import type { NeonQueryFunction } from '@neondatabase/serverless';
import type { Ymd } from './occurrences';

/**
 * The single SQL statement behind "Charge next payment now".
 *
 * Takes the Neon client as a PARAMETER (rather than importing the db module)
 * so the exact SQL can be exercised against a throwaway Postgres in a test
 * without a Neon connection or 'server-only'. Nothing else lives here.
 *
 * ONE statement, so the mark advancing and the row appearing are a single
 * atomic step: the CTE `upd` is the compare-and-set on the rule - it only
 * returns a row while the high-water mark and the schedule fields the
 * occurrence was computed from are still what the caller read, and while the
 * account is still active (a hibernated or closed account takes no new
 * transactions) - and the INSERT selects FROM it, so zero matched rows means
 * zero inserted rows. The insert is ON CONFLICT DO NOTHING on
 * (rule, occurrence), the same idempotency guard catch-up relies on.
 *
 * The transaction row copies the rule exactly as catch-up does: expense keeps
 * the rule's negative amount and tag; income stores the rule's NET in
 * net_amount, with gross falling back to net (unreachable: gross is NOT NULL
 * on income rules by CHECK).
 *
 * Result: one row `{ advanced, inserted }`. advanced is 1 when the
 * compare-and-set matched (0 = nothing changed at all); inserted is 0 when
 * ON CONFLICT skipped the row because that occurrence already exists.
 */
export interface ChargeNextSqlArgs {
  kind: 'expense' | 'income';
  userId: string;
  ruleId: string;
  /** New transaction id (generateTransId). */
  transactionId: string;
  /** The occurrence being charged: becomes occurrence_date. */
  occurrenceDate: Ymd;
  /** The rule's new high-water mark (planChargeNext.newMaterializedThrough):
      the occurrence date, or the end date for the last payment of an 'on' rule. */
  newMaterializedThrough: Ymd;
  /** The date the transaction is recorded on. */
  transactionDate: Ymd;
  /** The rule as the caller read it - the compare-and-set expectation. */
  expected: {
    materializedThrough: Ymd | null;
    frequency: string;
    startDate: Ymd;
    endMode: string;
    endCount: number | null;
    endDate: Ymd | null;
  };
}

export function chargeNextStatement(sql: NeonQueryFunction<false, false>, a: ChargeNextSqlArgs) {
  const e = a.expected;
  const advanced = sql`UPDATE recurring_rule rr
        SET materialized_through = ${a.newMaterializedThrough}::date, updated_at = now()
      WHERE rr.id = ${a.ruleId} AND rr.user_id = ${a.userId}::uuid AND rr.status = 'active'
        AND rr.kind = ${a.kind}
        AND rr.materialized_through IS NOT DISTINCT FROM ${e.materializedThrough}::date
        AND rr.frequency = ${e.frequency} AND rr.start_date = ${e.startDate}::date
        AND rr.end_mode = ${e.endMode}
        AND rr.end_count IS NOT DISTINCT FROM ${e.endCount}::int
        AND rr.end_date IS NOT DISTINCT FROM ${e.endDate}::date
        AND EXISTS (SELECT 1 FROM account ac WHERE ac.id = rr.account_id AND ac.user_id = rr.user_id AND ac.status = 'active')
      RETURNING rr.id, rr.user_id, rr.description, rr.category, rr.tag, rr.payment_method, rr.account_id, rr.amount, rr.gross_amount`;

  return a.kind === 'expense'
    ? sql`WITH upd AS (${advanced}), ins AS (
          INSERT INTO expense
            (id, user_id, description, category, tag, transaction_date, payment_method, account_id, amount, recurring_rule_id, occurrence_date)
          SELECT ${a.transactionId}, upd.user_id, upd.description, upd.category, COALESCE(upd.tag, ''), ${a.transactionDate}::date,
                 upd.payment_method, upd.account_id, upd.amount, upd.id, ${a.occurrenceDate}::date
            FROM upd
          ON CONFLICT (recurring_rule_id, occurrence_date) DO NOTHING
          RETURNING id
        )
        SELECT (SELECT count(*) FROM upd)::int AS advanced, (SELECT count(*) FROM ins)::int AS inserted`
    : sql`WITH upd AS (${advanced}), ins AS (
          INSERT INTO income
            (id, user_id, description, category, transaction_date, payment_method, account_id, gross_amount, net_amount, recurring_rule_id, occurrence_date)
          SELECT ${a.transactionId}, upd.user_id, upd.description, upd.category, ${a.transactionDate}::date,
                 upd.payment_method, upd.account_id, COALESCE(upd.gross_amount, upd.amount), upd.amount, upd.id, ${a.occurrenceDate}::date
            FROM upd
          ON CONFLICT (recurring_rule_id, occurrence_date) DO NOTHING
          RETURNING id
        )
        SELECT (SELECT count(*) FROM upd)::int AS advanced, (SELECT count(*) FROM ins)::int AS inserted`;
}
