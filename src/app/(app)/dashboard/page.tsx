import { getSessionUserIdOrRedirect } from '@/lib/auth/getSessionUser';
import { getBudgets, getExpenses, getIncome, getUserAccount } from '@/lib/data/queries';
import { computeCurrentBalances, mergeTransactions } from '@/lib/stats';
import { DashboardClient } from './DashboardClient';

// Required on every page calling a Neon Auth method: the SDK reads cookies,
// so the page cannot be statically rendered.
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const userId = await getSessionUserIdOrRedirect();

  const [expenses, income, budgets, openingBalances] = await Promise.all([
    getExpenses(userId),
    getIncome(userId),
    getBudgets(userId),
    getUserAccount(userId),
  ]);

  const transactions = mergeTransactions(expenses, income);

  // Current balance is derived from stored OPENING balances plus every
  // transaction, never read from a stored current-balance field.
  const balances = computeCurrentBalances(
    transactions,
    openingBalances.checkingOpening,
    openingBalances.cashOpening,
  );

  return (
    <DashboardClient
      transactions={transactions}
      budgets={budgets}
      totalBalance={balances.total}
    />
  );
}
