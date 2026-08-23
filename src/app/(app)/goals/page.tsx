import { getSessionUserIdOrRedirect } from '@/lib/auth/getSessionUser';
import { runRecurringCatchUp } from '@/lib/recurring/catchUp';
import { getBalanceAdjustments, getExpenses, getGoals, getIncome, getUserAccount } from '@/lib/data/queries';
import { computeCurrentBalances, mergeTransactions } from '@/lib/stats';
import { formatCurrency } from '@/lib/format';
import { GoalCard } from '@/components/goals/GoalCard';

export const dynamic = 'force-dynamic';

// No client shell: this page has no interactive state of its own. GoalCard
// resolves its own icon from goal.iconKey, so no LucideIcon crosses the
// server/client boundary. The add-goal trigger lives in the header, which is
// rendered by AppShell, so the modal mounts in (app)/layout.tsx rather than
// here - the same arrangement ModifyBudgetModal uses.
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

  const [goals, expenses, income, openingBalances, adjustments] = await Promise.all([
    getGoals(userId),
    getExpenses(userId),
    getIncome(userId),
    getUserAccount(userId),
    getBalanceAdjustments(userId),
  ]);

  // Reuses the same derivation as the dashboard and statement rather than a
  // second balance code path: opening balances plus every record against them.
  const balances = computeCurrentBalances(
    mergeTransactions(expenses, income),
    openingBalances.checkingOpening,
    openingBalances.cashOpening,
    adjustments,
  );

  const allocated = goals.reduce((sum, g) => sum + g.current, 0);
  const unallocated = balances.total - allocated;
  const overAllocated = unallocated < 0;

  const summaryRows: { label: string; value: number; color?: string }[] = [
    { label: 'Total balance', value: balances.total },
    { label: 'Set aside for goals', value: allocated },
    { label: 'Unallocated', value: unallocated, color: overAllocated ? 'var(--wine)' : 'var(--pine)' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="card" style={{ padding: '1.5rem' }}>
        <h3 style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.3rem' }}>Your money, allocated</h3>
        <p style={{ fontSize: '0.8rem', color: 'var(--ink-soft)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
          Goals do not hold money of their own. Each one records a share of your existing balance that
          you have set aside, so the figures below always add up to what you actually have.
        </p>

        <div className="stat-tabs">
          {summaryRows.map((r) => (
            <div key={r.label} className="stat-tab">
              <p style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', marginBottom: 4 }}>{r.label}</p>
              <p className="font-mono-tab" style={{ fontSize: '1.05rem', fontWeight: 600, color: r.color ?? 'var(--ink)' }}>
                {formatCurrency(r.value)}
              </p>
            </div>
          ))}
        </div>

        {overAllocated && (
          <p style={{ fontSize: '0.8rem', color: 'var(--wine)', marginTop: '1rem', lineHeight: 1.5 }}>
            You have set aside {formatCurrency(Math.abs(unallocated))} more than your balance holds. That is
            allowed — it just means the goals below are counting on money that is not there yet.
          </p>
        )}
      </div>

      {goals.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem 1.5rem', color: 'var(--ink-soft)' }}>
          <p style={{ fontWeight: 500, marginBottom: 4, color: 'var(--ink)' }}>No goals yet</p>
          <p style={{ fontSize: '0.85rem' }}>Use “Add goal” above to set one up.</p>
        </div>
      ) : (
        <div className="goals-grid">
          {goals.map((g) => <GoalCard key={g.id} goal={g} />)}
        </div>
      )}
    </div>
  );
}
