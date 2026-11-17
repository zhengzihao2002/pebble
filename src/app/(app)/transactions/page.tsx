import { getSessionUserIdOrRedirect } from '@/lib/auth/getSessionUser';
import { runRecurringCatchUp } from '@/lib/recurring/catchUp';
import { getBalanceAdjustments, getBudgets, getCategories, getExpenses, getIncome, getAccounts } from '@/lib/data/queries';
import { computeCurrentBalances, computeRecentTransactions, mergeTransactions } from '@/lib/stats';
import { TransactionsClient } from './TransactionsClient';

export const dynamic = 'force-dynamic';

export default async function TransactionsPage() {
  const userId = await getSessionUserIdOrRedirect();

  // Materialize any recurring occurrences that came due since the last visit.
  // MUST complete before the reads below, or new rows surface one load late.
  // Never throws - a failure is logged and retried on the next load.
  await runRecurringCatchUp(userId);

  const [expenses, income, budgets, categories, adjustments, accounts] = await Promise.all([
    getExpenses(userId, { includeGhost: true }),
    getIncome(userId, { includeGhost: true }),
    getBudgets(userId),
    getCategories(userId),
    getBalanceAdjustments(userId, { includeGhost: true }),
    getAccounts(userId, { includeGhost: true }),
  ]);

  const transactions = mergeTransactions(expenses, income);
  const ordinaryAccounts = accounts.filter(account => !account.isGhost);
  const ghostIds = new Set(accounts.filter(account => account.isGhost).map(account => account.id));
  const visibleExpenses = expenses.filter(record => !ghostIds.has(record.accountId));
  const visibleIncome = income.filter(record => !ghostIds.has(record.accountId));
  const visibleAdjustments = adjustments.filter(record => !ghostIds.has(record.accountId));

  // The ledger is pure and fully serializable, so it is computed here rather
  // than on the client. This is the single place the opening-balance walk
  // runs: it starts from the stored OPENING balances and adds forward.
  const rawLedger = computeRecentTransactions(
    expenses,
    income,
    accounts,
    adjustments,
  );

  // Ghost history is available only behind the explicit client checkbox.
  // Rebuild the ordinary ledger independently so a ghost posting can never
  // change an ordinary running balance, opening figure or chart point.
  const ordinaryLedger = computeRecentTransactions(visibleExpenses, visibleIncome, ordinaryAccounts, visibleAdjustments);
  const ordinaryById = new Map(ordinaryLedger.map(entry => [entry.transId, entry]));
  const ledger = rawLedger.map(entry => ordinaryById.get(entry.transId) ?? entry);
  const balances = computeCurrentBalances(
    mergeTransactions(visibleExpenses, visibleIncome), ordinaryAccounts, visibleAdjustments,
  );

  return (
    <TransactionsClient
      transactions={transactions}
      adjustments={adjustments}
      ledger={ledger}
      categories={categories}
      budgets={budgets}
      // Every account starts at zero by design - the pre-transaction
      // baseline for a month with no prior entries is always 0.
      accountOpeningTotal={0}
      currentBalance={balances.total}
      accounts={accounts}
      balancesByAccount={balances.byAccount}
    />
  );
}
