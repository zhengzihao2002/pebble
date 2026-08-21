import { getSessionUserIdOrRedirect } from '@/lib/auth/getSessionUser';
import { getExpenses, getIncome, getUserAccount } from '@/lib/data/queries';
import { computeCurrentBalances, mergeTransactions } from '@/lib/stats';
import { SettingsClient } from './SettingsClient';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const userId = await getSessionUserIdOrRedirect();

  const [expenses, income, openingBalances] = await Promise.all([
    getExpenses(userId),
    getIncome(userId),
    getUserAccount(userId),
  ]);

  const transactions = mergeTransactions(expenses, income);

  // The transaction-only totals, obtained by computing current balances from
  // a zero opening. This lets the settings card show a live projected balance
  // as the opening values are edited, without re-querying.
  const fromZero = computeCurrentBalances(transactions, 0, 0);

  return (
    <SettingsClient
      checkingOpening={openingBalances.checkingOpening}
      cashOpening={openingBalances.cashOpening}
      checkingTransactionTotal={fromZero.checking}
      cashTransactionTotal={fromZero.cash}
    />
  );
}
