import { getSessionUserIdOrRedirect } from '@/lib/auth/getSessionUser';
import { runRecurringCatchUp } from '@/lib/recurring/catchUp';
import { getBudgets, getCategories, getExpenses, getIncome } from '@/lib/data/queries';
import { mergeTransactions } from '@/lib/stats';
import { BudgetsClient } from './BudgetsClient';

export const dynamic = 'force-dynamic';

export default async function BudgetsPage() {
  const userId = await getSessionUserIdOrRedirect();

  // Materialize any recurring occurrences that came due since the last visit.
  // MUST complete before the reads below, or new rows surface one load late.
  // Never throws - a failure is logged and retried on the next load.
  await runRecurringCatchUp(userId);

  const [expenses, income, budgets, categories] = await Promise.all([
    getExpenses(userId),
    getIncome(userId),
    getBudgets(userId),
    getCategories(userId),
  ]);

  return (
    <BudgetsClient
      transactions={mergeTransactions(expenses, income)}
      categories={categories}
      budgets={budgets}
    />
  );
}
