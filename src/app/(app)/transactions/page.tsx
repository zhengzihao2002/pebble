import { getSessionUserIdOrRedirect } from '@/lib/auth/getSessionUser';
import { runRecurringCatchUp } from '@/lib/recurring/catchUp';
import { getBalanceAdjustments, getBudgets, getCategories, getExpenses, getIncome, getUserAccount } from '@/lib/data/queries';
import { computeCurrentBalances, computeRecentTransactions, mergeTransactions } from '@/lib/stats';
import { TransactionsClient } from './TransactionsClient';

export const dynamic = 'force-dynamic';

export default async function TransactionsPage() {
  const userId = await getSessionUserIdOrRedirect();

  // Materialize any recurring occurrences that came due since the last visit.
  // MUST complete before the reads below, or new rows surface one load late.
  // Never throws - a failure is logged and retried on the next load.
  await runRecurringCatchUp(userId);

  const [expenses, income, budgets, categories, openingBalances, adjustments] = await Promise.all([
    getExpenses(userId),
    getIncome(userId),
    getBudgets(userId),
    getCategories(userId),
    getUserAccount(userId),
    getBalanceAdjustments(userId),
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
    adjustments,
  );

  const balances = computeCurrentBalances(
    transactions,
    openingBalances.checkingOpening,
    openingBalances.cashOpening,
    adjustments,
  );

  return (
    <TransactionsClient
      transactions={transactions}
      adjustments={adjustments}
      ledger={ledger}
      categories={categories}
      budgets={budgets}
      accountOpeningTotal={openingBalances.checkingOpening + openingBalances.cashOpening}
      currentBalance={balances.total}
    />
  );
}
