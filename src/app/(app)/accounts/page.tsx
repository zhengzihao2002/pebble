import { getSessionUserIdOrRedirect } from '@/lib/auth/getSessionUser';
import { runRecurringCatchUp } from '@/lib/recurring/catchUp';
import { getAccounts, getBalanceAdjustments, getExpenses, getIncome } from '@/lib/data/queries';
import { AccountsClient } from './AccountsClient';

export const dynamic = 'force-dynamic';

// Existing reads only. The balance history is the same ledger walk the
// Transactions page uses, so the two always agree.
export default async function AccountsPage() {
  const userId = await getSessionUserIdOrRedirect();

  // Materialize any recurring occurrences that came due since the last visit.
  // MUST complete before the reads below, or new rows surface one load late.
  await runRecurringCatchUp(userId);

  const [expenses, income, adjustments, accounts] = await Promise.all([
    getExpenses(userId),
    getIncome(userId),
    getBalanceAdjustments(userId),
    getAccounts(userId),
  ]);

  return <AccountsClient expenses={expenses} income={income} adjustments={adjustments} accounts={accounts} />;
}
