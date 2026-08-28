import { getSessionUserIdOrRedirect } from '@/lib/auth/getSessionUser';
import { runRecurringCatchUp } from '@/lib/recurring/catchUp';
import { getBalanceAdjustments, getExpenses, getGoals, getIncome, getUserAccount } from '@/lib/data/queries';
import { computeCurrentBalances, mergeTransactions } from '@/lib/stats';
import { formatCurrency } from '@/lib/format';
import { getDictionary, t } from '@/lib/i18n';
import { resolveUserLocale } from '@/lib/i18n/serverLocale';
import { GoalCard } from '@/components/goals/GoalCard';

export const dynamic = 'force-dynamic';

// No client shell: this page has no interactive state of its own. GoalCard
// resolves its own icon from goal.iconKey, so no LucideIcon crosses the
// server/client boundary. The add-goal trigger lives in the header, which is
// rendered by AppShell, so the modal mounts in (app)/layout.tsx rather than
// here - the same arrangement ModifyBudgetModal uses.
//
// That also makes this the ONLY page whose user-visible text is rendered on
// the server, and therefore the only caller of resolveUserLocale(). Every
// other page is a thin query shell handing props to a *Client.tsx, where
// useTranslation() applies instead.
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

  // Cookie read, not a query. Display-only: nothing below writes, and the
  // locale never reaches a filter, a comparison or a stored value.
  const d = getDictionary(await resolveUserLocale());

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

  // Keyed by a stable identifier rather than by the translated label: the
  // React key must not change when the language does.
  const summaryRows: { key: string; label: string; value: number; color?: string }[] = [
    { key: 'total', label: d.goals.totalBalance, value: balances.total },
    { key: 'allocated', label: d.goals.setAside, value: allocated },
    { key: 'unallocated', label: d.goals.unallocated, value: unallocated, color: overAllocated ? 'var(--wine)' : 'var(--pine)' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="card" style={{ padding: '1.5rem' }}>
        <h3 style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.3rem' }}>{d.goals.allocatedTitle}</h3>
        <p style={{ fontSize: '0.8rem', color: 'var(--ink-soft)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
          {d.goals.allocatedBlurb}
        </p>

        <div className="stat-tabs">
          {summaryRows.map((r) => (
            <div key={r.key} className="stat-tab">
              <p style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', marginBottom: 4 }}>{r.label}</p>
              {/* formatCurrency stays pinned to en-US in every locale - these
                  are the user's actual dollars, not a localized quantity. */}
              <p className="font-mono-tab" style={{ fontSize: '1.05rem', fontWeight: 600, color: r.color ?? 'var(--ink)' }}>
                {formatCurrency(r.value)}
              </p>
            </div>
          ))}
        </div>

        {overAllocated && (
          <p style={{ fontSize: '0.8rem', color: 'var(--wine)', marginTop: '1rem', lineHeight: 1.5 }}>
            {t(d.goals.overAllocated, { amount: formatCurrency(Math.abs(unallocated)) })}
          </p>
        )}
      </div>

      {goals.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem 1.5rem', color: 'var(--ink-soft)' }}>
          <p style={{ fontWeight: 500, marginBottom: 4, color: 'var(--ink)' }}>{d.goals.emptyTitle}</p>
          {/* The quoted button name is interpolated, not concatenated: it sits
              mid-sentence in English and after the verb in Chinese. */}
          <p style={{ fontSize: '0.85rem' }}>{t(d.goals.emptyHint, { action: d.common.addGoal })}</p>
        </div>
      ) : (
        <div className="goals-grid">
          {goals.map((g) => <GoalCard key={g.id} goal={g} />)}
        </div>
      )}
    </div>
  );
}
