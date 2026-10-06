import { getSessionUserIdOrRedirect } from '@/lib/auth/getSessionUser';
import { runRecurringCatchUp } from '@/lib/recurring/catchUp';
import { getAccounts, getBudgets, getCategories, getExpenses, getGoals, getIncome, getRecurringRules } from '@/lib/data/queries';
import { mergeTransactions } from '@/lib/stats';
import { InsightsClient } from './InsightsClient';

export const dynamic = 'force-dynamic';

// Existing reads only, the same ones other pages run. Everything on the page
// is computed in the browser from these.
export default async function InsightsPage() {
  const userId = await getSessionUserIdOrRedirect();

  // Materialize any recurring occurrences that came due since the last visit.
  // MUST complete before the reads below, or new rows surface one load late.
  await runRecurringCatchUp(userId);

  const [expenses, income, categories, budgets, rules, goals, accounts] = await Promise.all([
    getExpenses(userId),
    getIncome(userId),
    getCategories(userId),
    getBudgets(userId),
    getRecurringRules(userId),
    getGoals(userId),
    getAccounts(userId),
  ]);

  return (
    <InsightsClient
      transactions={mergeTransactions(expenses, income)}
      categories={categories}
      budgets={budgets}
      rules={rules}
      goals={goals}
      accounts={accounts}
    />
  );
}
