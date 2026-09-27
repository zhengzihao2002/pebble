import 'server-only';
import { neonSql } from '@/db';
import { userWriteLockStatement } from './userWriteLock';

/**
 * Adds `amount` (an exact 2-decimal string) to one goal's set-aside figure,
 * race-safely. Returns true when the goal was updated, false when either rule
 * refused it.
 *
 * Both rules live INSIDE the UPDATE, evaluated by the database after the
 * per-user lock is held:
 *   - the goal may not pass its target;
 *   - the amount must fit within Unallocated = balance - everything set aside.
 * The balance expression mirrors computeCurrentBalances() in stats.ts: the
 * signed sum of every expense (stored negative), income (net_amount) and
 * balance adjustment on any of this user's accounts, hibernated included,
 * with no date filter. Verified against the Goals page to the cent.
 */
export async function addToGoalGuarded(userId: string, goalId: string, amount: string): Promise<boolean> {
  const results = await neonSql.transaction(
    [
      userWriteLockStatement(userId),
      neonSql`
        UPDATE goal AS g
        SET current_amount = g.current_amount + ${amount}::numeric
        WHERE g.id = ${goalId}
          AND g.user_id = ${userId}::uuid
          AND g.current_amount + ${amount}::numeric <= g.target_amount
          AND ${amount}::numeric <= (
                (SELECT COALESCE(SUM(e.amount), 0) FROM expense e
                   JOIN account a ON a.id = e.account_id AND a.user_id = ${userId}::uuid
                  WHERE e.user_id = ${userId}::uuid)
              + (SELECT COALESCE(SUM(i.net_amount), 0) FROM income i
                   JOIN account a ON a.id = i.account_id AND a.user_id = ${userId}::uuid
                  WHERE i.user_id = ${userId}::uuid)
              + (SELECT COALESCE(SUM(b.amount), 0) FROM balance_adjustment b
                   JOIN account a ON a.id = b.account_id AND a.user_id = ${userId}::uuid
                  WHERE b.user_id = ${userId}::uuid)
              - (SELECT COALESCE(SUM(x.current_amount), 0) FROM goal x
                  WHERE x.user_id = ${userId}::uuid)
              )
        RETURNING g.id
      `,
    ],
    { isolationLevel: 'ReadCommitted' },
  );
  const updated = results[1] as unknown;
  return Array.isArray(updated) && updated.length === 1;
}
