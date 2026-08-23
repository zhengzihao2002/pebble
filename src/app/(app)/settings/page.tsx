import { getSessionUserIdOrRedirect } from '@/lib/auth/getSessionUser';
import { runRecurringCatchUp } from '@/lib/recurring/catchUp';
import { getBalanceAdjustments, getExpenses, getIncome, getUserAccount } from '@/lib/data/queries';
import { computeCurrentBalances, mergeTransactions } from '@/lib/stats';
import { SettingsClient } from './SettingsClient';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const userId = await getSessionUserIdOrRedirect();

  // Materialize any recurring occurrences that came due since the last visit.
  // MUST complete before the reads below, or new rows surface one load late.
  // Never throws - a failure is logged and retried on the next load.
  await runRecurringCatchUp(userId);

  const [expenses, income, openingBalances, adjustments] = await Promise.all([
    getExpenses(userId),
    getIncome(userId),
    getUserAccount(userId),
    getBalanceAdjustments(userId),
  ]);

  const transactions = mergeTransactions(expenses, income);

  // The transaction-only totals, obtained by computing current balances from
  // a zero opening. This lets the settings card show a live projected balance
  // as the opening values are edited, without re-querying.
  const fromZero = computeCurrentBalances(transactions, 0, 0, adjustments);

  return (
    <SettingsClient
      checkingOpening={openingBalances.checkingOpening}
      cashOpening={openingBalances.cashOpening}
      checkingTransactionTotal={fromZero.checking}
      cashTransactionTotal={fromZero.cash}
      hasTransactions={expenses.length > 0 || income.length > 0}
    />
  );
}
