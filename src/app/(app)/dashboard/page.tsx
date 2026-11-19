import { getOwnWorkspaceUser } from '@/lib/partnerView.server';
import { runRecurringCatchUp } from '@/lib/recurring/catchUp';
import { getBalanceAdjustments, getBudgets, getCategories, getExpenses, getGoals, getIncome, getAccounts, getRecurringRules } from '@/lib/data/queries';
import { computeCurrentBalances, mergeTransactions } from '@/lib/stats';
import { DashboardClient } from './DashboardClient';

// Required on every page calling a Neon Auth method: the SDK reads cookies,
// so the page cannot be statically rendered.
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const userId = await getOwnWorkspaceUser('/dashboard');

  // Materialize any recurring occurrences that came due since the last visit.
  // MUST complete before the reads below, or new rows surface one load late.
  // Never throws - a failure is logged and retried on the next load.
  const catchUp = await runRecurringCatchUp(userId);

  const [allExpenses, allIncome, budgets, categories, allAdjustments, goals, heroAccounts, rules] = await Promise.all([
    getExpenses(userId, { includeGhost: true }),
    getIncome(userId, { includeGhost: true }),
    getBudgets(userId),
    getCategories(userId),
    getBalanceAdjustments(userId, { includeGhost: true }),
    getGoals(userId),
    getAccounts(userId, { includeGhost: true }),
    // For the Upcoming card. The same read Scheduled and Analysis run; it
    // joins this batch, so it adds no round trip.
    getRecurringRules(userId),
  ]);

  const accounts = heroAccounts.filter(account => !account.isGhost);
  const ids = new Set(accounts.map(account => account.id));
  const expenses = allExpenses.filter(record => ids.has(record.accountId));
  const income = allIncome.filter(record => ids.has(record.accountId));
  const adjustments = allAdjustments.filter(record => ids.has(record.accountId));
  const transactions = mergeTransactions(expenses, income);

  // Current balance is derived from stored OPENING balances plus every
  // transaction, never read from a stored current-balance field.
  const balances = computeCurrentBalances(
    mergeTransactions(allExpenses, allIncome),
    heroAccounts,
    allAdjustments,
  );

  // Summed in JS from mapped rows, deliberately not with a SQL sum(): an
  // aggregate returns a STRING regardless of the column's mode: 'number'.
  // getGoals() already maps current_amount to a real number.
  const allocated = goals.reduce((total, g) => total + g.current, 0);

  return (
    <DashboardClient
      transactions={transactions}
      categories={categories}
      budgets={budgets}
      totalBalance={balances.total}
      accounts={accounts}
      heroAccounts={heroAccounts}
      balancesByAccount={balances.byAccount}
      allocated={allocated}
      // Both already loaded above for the total and `allocated`; passed
      // through (no new query) for the hero's balance line and the goals glance.
      adjustments={adjustments}
      goals={goals}
      rules={rules}
      catchUp={{
        expensesCreated: catchUp.expensesCreated,
        incomeCreated: catchUp.incomeCreated,
        truncated: catchUp.truncated,
        // The flag, not the message: the raw error can echo query fragments,
        // and it is already logged server-side in catchUp.ts.
        failed: catchUp.error !== undefined,
      }}
    />
  );
}
