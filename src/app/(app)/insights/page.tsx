import { getOwnWorkspaceUser } from '@/lib/partnerView.server';
import { runRecurringCatchUp } from '@/lib/recurring/catchUp';
import { getAccounts, getBalanceAdjustments, getBudgets, getCategories, getExpenses, getGoals, getIncome, getRecurringRules } from '@/lib/data/queries';
import { computeCurrentBalances, mergeTransactions } from '@/lib/stats';
import { InsightsClient } from './InsightsClient';

export const dynamic = 'force-dynamic';

// Existing reads only, the same ones other pages run. Everything on the page
// is computed in the browser from these.
export default async function InsightsPage() {
  const userId = await getOwnWorkspaceUser('/insights');

  // Materialize any recurring occurrences that came due since the last visit.
  // MUST complete before the reads below, or new rows surface one load late.
  await runRecurringCatchUp(userId);

  const [expenses, income, categories, budgets, rules, goals, accounts, adjustments] = await Promise.all([
    getExpenses(userId),
    getIncome(userId),
    getCategories(userId),
    getBudgets(userId),
    getRecurringRules(userId),
    getGoals(userId),
    getAccounts(userId),
    getBalanceAdjustments(userId),
  ]);

  const transactions = mergeTransactions(expenses, income);
  const balances = computeCurrentBalances(transactions, accounts, adjustments);

  return (
    <InsightsClient
      transactions={transactions} balancesByAccount={balances.byAccount}
      categories={categories}
      budgets={budgets}
      rules={rules}
      goals={goals}
      accounts={accounts}
    />
  );
}
