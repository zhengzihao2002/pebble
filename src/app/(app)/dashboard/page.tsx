import { getSessionUserIdOrRedirect } from '@/lib/auth/getSessionUser';
import { runRecurringCatchUp } from '@/lib/recurring/catchUp';
import { getBalanceAdjustments, getBudgets, getCategories, getExpenses, getGoals, getIncome, getUserAccount } from '@/lib/data/queries';
import { computeCurrentBalances, mergeTransactions } from '@/lib/stats';
import { DashboardClient } from './DashboardClient';

// Required on every page calling a Neon Auth method: the SDK reads cookies,
// so the page cannot be statically rendered.
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const userId = await getSessionUserIdOrRedirect();

  // Materialize any recurring occurrences that came due since the last visit.
  // MUST complete before the reads below, or new rows surface one load late.
  // Never throws - a failure is logged and retried on the next load.
  const catchUp = await runRecurringCatchUp(userId);

  const [expenses, income, budgets, categories, openingBalances, adjustments, goals] = await Promise.all([
    getExpenses(userId),
    getIncome(userId),
    getBudgets(userId),
    getCategories(userId),
    getUserAccount(userId),
    getBalanceAdjustments(userId),
    getGoals(userId),
  ]);

  const transactions = mergeTransactions(expenses, income);

  // Current balance is derived from stored OPENING balances plus every
  // transaction, never read from a stored current-balance field.
  const balances = computeCurrentBalances(
    transactions,
    openingBalances.checkingOpening,
    openingBalances.cashOpening,
    adjustments,
  );

  // Summed in JS from mapped rows, deliberately not with a SQL sum(): an
  // aggregate returns a STRING regardless of the column's mode: 'number'.
  // getGoals() already maps current_amount to a real number.
  const allocated = goals.reduce((total, g) => total + g.current, 0);

  return (
    <DashboardClient
      transactions={transactions}
      categories={categories}
      budgets={budgets}
      totalBalance={balances.total}
      allocated={allocated}
      catchUp={{
        expensesCreated: catchUp.expensesCreated,
        incomeCreated: catchUp.incomeCreated,
        truncated: catchUp.truncated,
        // The flag, not the message: the raw error can echo query fragments,
        // and it is already logged server-side in catchUp.ts.
        failed: catchUp.error !== undefined,
      }}
    />
  );
}
