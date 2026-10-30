import { getSessionUserIdOrRedirect } from '@/lib/auth/getSessionUser';
import { runRecurringCatchUp } from '@/lib/recurring/catchUp';
import { getBudgets, getCategories, getExpenses, getIncome } from '@/lib/data/queries';
import { mergeTransactions } from '@/lib/stats';
import { BudgetsClient } from './BudgetsClient';
import { getAnnualBudgetContext, getEffectiveAnnualBudgets } from '@/lib/budgets/annualData';
import { BudgetCalendarRefresh } from '@/components/budgets/BudgetCalendarRefresh';
import { BudgetPlanNavigationRegistration } from '@/components/budgets/BudgetPlanNavigation';
import { todayInZone } from '@/lib/recurring/occurrences';

export const dynamic = 'force-dynamic';

export default async function BudgetsPage() {
  const userId = await getSessionUserIdOrRedirect();

  // Materialize any recurring occurrences that came due since the last visit.
  // MUST complete before the reads below, or new rows surface one load late.
  // Never throws - a failure is logged and retried on the next load.
  await runRecurringCatchUp(userId);

  const [expenses, income, budgets, categories, annualContext] = await Promise.all([
    getExpenses(userId),
    getIncome(userId),
    getBudgets(userId),
    getCategories(userId),
    getAnnualBudgetContext(userId),
  ]);

  const pastYears = await Promise.all(Array.from({ length: 3 }, async (_, offset) => {
    const year = annualContext.year - offset - 1;
    return [String(year), await getEffectiveAnnualBudgets(userId, year)] as const;
  }));
  const budgetsByYear = { ...Object.fromEntries(pastYears), [String(annualContext.year)]: budgets };

  return (
    <>
      <BudgetPlanNavigationRegistration year={annualContext.year + 1} />
      <BudgetCalendarRefresh year={annualContext.year} timeZone={annualContext.timeZone} />
      <BudgetsClient
        key={annualContext.year}
        transactions={mergeTransactions(expenses, income)}
        categories={categories}
        budgets={budgets}
        budgetsByYear={budgetsByYear}
        today={todayInZone(annualContext.timeZone)}
      />
    </>
  );
}
