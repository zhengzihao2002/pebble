import { getOwnWorkspaceUser } from '@/lib/partnerView.server';
import { runRecurringCatchUp } from '@/lib/recurring/catchUp';
import { getBalanceAdjustments, getExpenses, getGoals, getIncome, getAccounts } from '@/lib/data/queries';
import { computeCurrentBalances, mergeTransactions } from '@/lib/stats';
import { OwnGoalsView } from '@/components/goals/OwnGoalsView';

export const dynamic = 'force-dynamic';

// Goals hold no real money. goal.current_amount records how much of the
// existing balance has been mentally set aside, so the balance below is the
// real one and "unallocated" is what is left after those soft claims. Nothing
// is moved between accounts and no goal balance is ever stored separately.
export default async function GoalsPage() {
  const userId = await getOwnWorkspaceUser('/goals');

  // Materialize any recurring occurrences that came due since the last visit.
  // MUST complete before the reads below, or new rows surface one load late.
  // Never throws - a failure is logged and retried on the next load.
  await runRecurringCatchUp(userId);

  const [goals, expenses, income, adjustments, accounts] = await Promise.all([
    getGoals(userId),
    getExpenses(userId),
    getIncome(userId),
    getBalanceAdjustments(userId),
    getAccounts(userId),
  ]);

  // Reuses the same derivation as the dashboard and statement rather than a
  // second balance code path: opening balances plus every record against them.
  const balances = computeCurrentBalances(
    mergeTransactions(expenses, income),
    accounts,
    adjustments,
  );

  return <OwnGoalsView goals={goals} total={balances.total} />;
}
