import { getSessionUserIdOrRedirect } from '@/lib/auth/getSessionUser';
import { runRecurringCatchUp } from '@/lib/recurring/catchUp';
import { getCategories, getExpenses, getIncome } from '@/lib/data/queries';
import { getAnnualPlannerData } from '@/lib/budgets/annualData';
import { mergeTransactions } from '@/lib/stats';
import { todayInZone } from '@/lib/recurring/occurrences';
import { AnnualPlannerClient } from './AnnualPlannerClient';
import { BudgetCalendarRefresh } from '@/components/budgets/BudgetCalendarRefresh';

export const dynamic = 'force-dynamic';

export default async function AnnualPlannerPage() {
  const userId = await getSessionUserIdOrRedirect();
  await runRecurringCatchUp(userId);
  const [data, categories, expenses, income] = await Promise.all([
    getAnnualPlannerData(userId), getCategories(userId), getExpenses(userId), getIncome(userId),
  ]);
  return <><BudgetCalendarRefresh year={data.year} timeZone={data.timeZone} /><AnnualPlannerClient key={`${data.year}:${data.timeZone}`} data={data} categories={categories}
    transactions={mergeTransactions(expenses, income)} today={todayInZone(data.timeZone)} /></>;
}
