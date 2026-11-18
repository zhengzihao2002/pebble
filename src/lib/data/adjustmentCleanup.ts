import 'server-only';

import { neonSql } from '@/db';
import type { CleanupSource } from '@/lib/adjustmentCleanup';

/** The exact preview is checked against locked rows. Both write branches
 * target disjoint row IDs and share the same guard and exact decimal sum. */
export function applyAdjustmentCleanupStatement(input: {
  userId: string;
  cutoff: string;
  accountId: string;
  retainedId: string;
  description: string;
  sources: CleanupSource[];
}) {
  const { userId, cutoff, accountId, retainedId, description, sources } = input;
  return neonSql`
    WITH expected AS (
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(sources)}::jsonb)
        AS x(id text, amount numeric, description text, date date)
    ), picked AS MATERIALIZED (
      SELECT a.id, a.amount, a.transaction_date
      FROM balance_adjustment a JOIN expected e ON e.id = a.id
      WHERE a.user_id = ${userId}::uuid AND a.account_id = ${accountId}
        AND a.transaction_date = e.date AND a.transaction_date < ${cutoff}::date
        AND a.transfer_group_id IS NULL AND a.amount = e.amount AND a.description = e.description
      ORDER BY a.id FOR UPDATE OF a
    ), ready AS MATERIALIZED (
      SELECT sum(amount) AS total FROM picked
      HAVING count(*) = (SELECT count(*) FROM expected)
        AND max(transaction_date) = max(transaction_date) FILTER (WHERE id = ${retainedId})
        AND abs(sum(amount)) <= 9999999999.99
        AND (sum(amount) = 0 OR ${description} <> '')
        AND EXISTS (SELECT 1 FROM account WHERE user_id = ${userId}::uuid AND id = ${accountId})
    ), combined AS (
      UPDATE balance_adjustment a SET amount = r.total, description = ${description}
      FROM ready r WHERE a.user_id = ${userId}::uuid AND a.id = ${retainedId} AND r.total <> 0
      RETURNING a.id
    ), removed AS (
      DELETE FROM balance_adjustment a USING ready r, picked p
      WHERE a.user_id = ${userId}::uuid AND a.id = p.id
        AND (r.total = 0 OR a.id <> ${retainedId})
      RETURNING a.id
    )
    SELECT count(*)::integer AS removed FROM removed
  `;
}
