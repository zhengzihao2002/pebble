import type { NeonQueryFunction } from '@neondatabase/serverless';
import type { RecurrenceSpec } from './occurrences';

interface Values extends RecurrenceSpec {
  kind: string; description: string; category: string; tag: string | null;
  paymentMethod: string; accountId: string; amount: number; grossAmount: number | null;
}
/** Run AFTER the user-write lock. Refuse to reopen any live payment or a stale progress marker. */
export function rescheduleNextStatement(sql: NeonQueryFunction<false, false>, userId: string, id: string, expectedMark: string | null, nextDate: string, newMark: string, v: Values) {
  return sql`UPDATE recurring_rule rr SET
    description=${v.description}, category=${v.category}, tag=${v.tag}, payment_method=${v.paymentMethod},
    account_id=${v.accountId}, amount=${v.amount}, gross_amount=${v.grossAmount}, frequency=${v.frequency},
    start_date=${v.startDate}::date, end_mode=${v.endMode}, end_count=${v.endCount}, end_date=${v.endDate}::date,
    materialized_through=${newMark}::date, updated_at=now()
    WHERE rr.id=${id} AND rr.user_id=${userId}::uuid AND rr.kind=${v.kind} AND rr.status <> 'deleted'
      AND rr.materialized_through IS NOT DISTINCT FROM ${expectedMark}::date
      AND EXISTS (SELECT 1 FROM account ac WHERE ac.id=${v.accountId} AND ac.user_id=rr.user_id AND ac.status='active')
      AND NOT EXISTS (SELECT 1 FROM expense e WHERE e.user_id=rr.user_id AND e.recurring_rule_id=rr.id AND e.occurrence_date >= ${nextDate}::date)
      AND NOT EXISTS (SELECT 1 FROM income i WHERE i.user_id=rr.user_id AND i.recurring_rule_id=rr.id AND i.occurrence_date >= ${nextDate}::date)
    RETURNING rr.id`;
}
