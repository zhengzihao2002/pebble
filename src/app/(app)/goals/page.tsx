import { getSessionUserIdOrRedirect } from '@/lib/auth/getSessionUser';
import { runRecurringCatchUp } from '@/lib/recurring/catchUp';
import { getBalanceAdjustments, getExpenses, getGoals, getIncome, getAccounts } from '@/lib/data/queries';
import { computeCurrentBalances, mergeTransactions } from '@/lib/stats';
import { getDictionary } from '@/lib/i18n';
import { resolveUserLocale } from '@/lib/i18n/serverLocale';
import { GoalsSummary } from '@/components/goals/GoalsSummary';
import { GoalsView } from '@/components/goals/GoalsView';

export const dynamic = 'force-dynamic';

// No client shell: the page itself has no interactive state. The allocation
// hero (GoalsSummary) is a Server Component rendering its text from the
// dictionary resolved here; only its ribbon popup is a client piece. The goals
// below are GoalsView, a client island that owns the Cards / Timeline switch
// and the zone-aware today the countdowns need. GoalCard resolves its own icon
// from goal.iconKey, so no LucideIcon crosses the server/client boundary. The
// add-goal trigger is the last tile in the grid (AddGoalTile, which owns its
// own dialog); on a phone the centre + menu opens the AppShell copy of the
// same dialog.
//
// That also makes this the ONLY page whose user-visible text is (partly)
// rendered on the server, and therefore the only caller of
// resolveUserLocale(). Every other page is a thin query shell handing props to
// a *Client.tsx, where useTranslation() applies instead.
//
// Goals hold no real money. goal.current_amount records how much of the
// existing balance has been mentally set aside, so the balance below is the
// real one and "unallocated" is what is left after those soft claims. Nothing
// is moved between accounts and no goal balance is ever stored separately.
export default async function GoalsPage() {
  const userId = await getSessionUserIdOrRedirect();

  // Materialize any recurring occurrences that came due since the last visit.
  // MUST complete before the reads below, or new rows surface one load late.
  // Never throws - a failure is logged and retried on the next load.
  await runRecurringCatchUp(userId);

  const [goals, expenses, income, adjustments, accounts] = await Promise.all([
    getGoals(userId),
    getExpenses(userId),
    getIncome(userId),
    getBalanceAdjustments(userId),
    getAccounts(userId),
  ]);

  // Cookie read, not a query. Display-only: nothing below writes, and the
  // locale never reaches a filter, a comparison or a stored value.
  const d = getDictionary(await resolveUserLocale());

  // Reuses the same derivation as the dashboard and statement rather than a
  // second balance code path: opening balances plus every record against them.
  const balances = computeCurrentBalances(
    mergeTransactions(expenses, income),
    accounts,
    adjustments,
  );

  const allocated = goals.reduce((sum, g) => sum + g.current, 0);
  const unallocated = balances.total - allocated;
  // Nothing set aside means nothing over-allocated: with no goals,
  // unallocated IS the balance, and a negative balance is not goals
  // claiming too much.
  const overAllocated = allocated > 0 && unallocated < 0;

  return (
    <div className="pb-goals">
      <GoalsSummary
        d={d} goals={goals} total={balances.total}
        allocated={allocated} unallocated={unallocated} overAllocated={overAllocated}
      />
      <GoalsView goals={goals} />
    </div>
  );
}
