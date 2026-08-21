import { getSessionUserIdOrRedirect } from '@/lib/auth/getSessionUser';
import { getBudgets, getCategories, getExpenses, getIncome } from '@/lib/data/queries';
import { mergeTransactions } from '@/lib/stats';
import { ReportsClient } from './ReportsClient';

export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  const userId = await getSessionUserIdOrRedirect();

  // Reports sees the COMPLETE history. The 13-month limit on the
  // transactions page is a statement-navigator view constraint only;
  // expense and income rows are permanent and all of them are reported on.
  const [expenses, income, budgets, categories] = await Promise.all([
    getExpenses(userId),
    getIncome(userId),
    getBudgets(userId),
    getCategories(userId),
  ]);

  return (
    <ReportsClient
      transactions={mergeTransactions(expenses, income)}
      categories={categories}
      budgets={budgets}
    />
  );
}
