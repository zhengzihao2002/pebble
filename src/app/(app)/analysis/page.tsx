import { getSessionUserIdOrRedirect } from '@/lib/auth/getSessionUser';
import { runRecurringCatchUp } from '@/lib/recurring/catchUp';
import {
  getBalanceAdjustments,
  getBudgets,
  getCategories,
  getExpenses,
  getIncome,
  getRecurringRules,
  getUserAccount,
} from '@/lib/data/queries';
import { computeCurrentBalances, mergeTransactions } from '@/lib/stats';
import { AnalysisClient } from './AnalysisClient';

// Required on every page calling a Neon Auth method: the SDK reads cookies,
// so the page cannot be statically rendered.
export const dynamic = 'force-dynamic';

export default async function AnalysisPage() {
  const userId = await getSessionUserIdOrRedirect();

  // Materialize any recurring occurrences that came due since the last visit.
  // MUST complete before the reads below, or new rows surface one load late.
  // Never throws - a failure is logged and retried on the next load.
  await runRecurringCatchUp(userId);

  // Analysis sees the COMPLETE history, same as Reports: year-over-year and
  // seasonality metrics are the whole point of this page.
  const [expenses, income, budgets, categories, openingBalances, adjustments, rules] = await Promise.all([
    getExpenses(userId),
    getIncome(userId),
    getBudgets(userId),
    getCategories(userId),
    getUserAccount(userId),
    getBalanceAdjustments(userId),
    getRecurringRules(userId),
  ]);

  const transactions = mergeTransactions(expenses, income);

  // Derived HERE rather than on the client, for two reasons:
  //  1. Identical helper and identical inputs to dashboard/page.tsx, so the
  //     two pages cannot disagree by a cent.
  //  2. It keeps balance adjustments off the wire entirely. Adjustments are
  //     corrections, not activity - they must never reach an income or
  //     spending metric, and the surest way to guarantee that is for the
  //     client never to receive them.
  const balances = computeCurrentBalances(
    transactions,
    openingBalances.checkingOpening,
    openingBalances.cashOpening,
    adjustments,
  );

  // Rules are passed unfiltered. Filtering (status === 'active', not
  // exhausted, frequency !== 'once') belongs beside the commitment metric
  // that depends on it, not hidden in the fetch layer.
  return (
    <AnalysisClient
      transactions={transactions}
      categories={categories}
      budgets={budgets}
      rules={rules}
      totalBalance={balances.total}
    />
  );
}
