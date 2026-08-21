import { getSessionUserIdOrRedirect } from '@/lib/auth/getSessionUser';
import { getBudgets, getExpenses, getIncome } from '@/lib/data/queries';
import { mergeTransactions } from '@/lib/stats';
import { BudgetsClient } from './BudgetsClient';

export const dynamic = 'force-dynamic';

export default async function BudgetsPage() {
  const userId = await getSessionUserIdOrRedirect();

  const [expenses, income, budgets] = await Promise.all([
    getExpenses(userId),
    getIncome(userId),
    getBudgets(userId),
  ]);

  return (
    <BudgetsClient
      transactions={mergeTransactions(expenses, income)}
      budgets={budgets}
    />
  );
}
