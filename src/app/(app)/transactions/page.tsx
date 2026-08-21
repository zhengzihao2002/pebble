import { getSessionUserIdOrRedirect } from '@/lib/auth/getSessionUser';
import { getBudgets, getExpenses, getIncome, getUserAccount } from '@/lib/data/queries';
import { computeCurrentBalances, computeRecentTransactions, mergeTransactions } from '@/lib/stats';
import { TransactionsClient } from './TransactionsClient';

export const dynamic = 'force-dynamic';

export default async function TransactionsPage() {
  const userId = await getSessionUserIdOrRedirect();

  const [expenses, income, budgets, openingBalances] = await Promise.all([
    getExpenses(userId),
    getIncome(userId),
    getBudgets(userId),
    getUserAccount(userId),
  ]);

  const transactions = mergeTransactions(expenses, income);

  // The ledger is pure and fully serializable, so it is computed here rather
  // than on the client. This is the single place the opening-balance walk
  // runs: it starts from the stored OPENING balances and adds forward.
  const ledger = computeRecentTransactions(
    expenses,
    income,
    openingBalances.checkingOpening,
    openingBalances.cashOpening,
  );

  const balances = computeCurrentBalances(
    transactions,
    openingBalances.checkingOpening,
    openingBalances.cashOpening,
  );

  return (
    <TransactionsClient
      transactions={transactions}
      ledger={ledger}
      budgets={budgets}
      accountOpeningTotal={openingBalances.checkingOpening + openingBalances.cashOpening}
      currentBalance={balances.total}
    />
  );
}
