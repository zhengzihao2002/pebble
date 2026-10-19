import type { Goal } from '@/types';
import type { Dictionary } from '@/lib/i18n';
import { t } from '@/lib/i18n';
import { formatCurrency, splitCents } from '@/lib/format';
import { renderTemplate } from '@/lib/i18n/RichText';
import { InfoTooltip } from '@/components/shared/InfoTooltip';
import { SectionHeader } from '@/components/kit/SectionHeader';
import { GoalsAllocationBar, type AllocationSlice } from './GoalsAllocationBar';

interface GoalsSummaryProps {
  /** The server-side dictionary (goals/page.tsx resolves the locale). */
  d: Dictionary;
  goals: Goal[];
  /** computeCurrentBalances(...).total - the dashboard's figure, never recomputed here. */
  total: number;
  /** Sum of every goal's current amount. */
  allocated: number;
  /** total - allocated, so it matches goalAllocation.ts to the cent. */
  unallocated: number;
  overAllocated: boolean;
}

/**
 * "Your money, allocated" - the Goals page's hero. A SERVER component (no
 * 'use client'), so its text still comes from the dictionary the page
 * resolved, as it always has; only the interactive ribbon is a client piece.
 *
 * It opens with the real balance as the one display figure, then the two
 * halves of it - set aside for goals and unallocated - and a ribbon that
 * splits the balance into each goal's share plus what is free. The blurb that
 * used to lead the card now sits behind the (i) next to the title: same words,
 * less to read before the numbers.
 *
 * All three figures are computed by the page exactly as before (stable keys,
 * formatCurrency pinned to en-US, money in .font-mono-tab / .pb-money so
 * privacy mode blurs it).
 */
export function GoalsSummary({ d, goals, total, allocated, unallocated, overAllocated }: GoalsSummaryProps) {
  const ux = d.ux.goals;
  const { whole, cents } = splitCents(formatCurrency(total));
  const withMoney = goals.filter((g) => g.current > 0);
  const share = total > 0 ? Math.round((allocated / total) * 100) : null;

  const subtitle = allocated <= 0
    ? ux.noneSetAside
    : share !== null && !overAllocated
      ? t(withMoney.length === 1 ? ux.shareSetAsideOne : ux.shareSetAside, { pct: share, count: withMoney.length })
      : undefined;

  // Keyed by a stable identifier rather than by the translated label: the
  // React key must not change when the language does.
  const split: { key: string; label: string; value: number; tone: 'goals' | 'free'; color?: string; pct: number | null }[] = [
    { key: 'allocated', label: d.goals.setAside, value: allocated, tone: 'goals', pct: total > 0 && !overAllocated ? (allocated / total) * 100 : null },
    // (Over-allocated: a share above 100% of the balance says nothing the
    // wine figures and the bracket do not say better, so none is shown.)
    {
      key: 'unallocated', label: d.goals.unallocated, value: unallocated, tone: 'free',
      color: unallocated < 0 ? 'var(--wine)' : 'var(--pine)',
      pct: total > 0 && unallocated >= 0 ? (unallocated / total) * 100 : null,
    },
  ];

  // The "set aside" key is a stripe of the goals' own colours (up to four),
  // so it reads as "these goals" against the pine hatch of what is free.
  const keyColors = withMoney.slice().sort((a, b) => b.current - a.current).slice(0, 4).map((g) => g.color);
  const goalsKey = keyColors.length > 1
    ? `linear-gradient(90deg, ${keyColors.map((c, i) => `${c} ${(i / keyColors.length) * 100}% ${((i + 1) / keyColors.length) * 100}%`).join(', ')})`
    : keyColors[0];

  const slices: AllocationSlice[] = withMoney
    .slice()
    .sort((a, b) => b.current - a.current)
    .map((g) => ({ key: g.id, name: g.name, color: g.color, value: g.current }));

  return (
    <section className="card pb-goals-hero">
      <SectionHeader
        title={(
          <span className="pb-goals-hero-title">
            {d.goals.allocatedTitle}
            <InfoTooltip label={ux.aboutAllocation}>{d.goals.allocatedBlurb}</InfoTooltip>
          </span>
        )}
        subtitle={subtitle ? <span className="pb-tnum">{subtitle}</span> : undefined}
      />

      <div className="pb-goals-hero-top">
        <div className="pb-goals-hero-figure">
          <p className="pb-goals-hero-label">{d.goals.totalBalance}</p>
          {/* formatCurrency stays pinned to en-US in every locale - these
              are the user's actual dollars, not a localized quantity. */}
          <p className="font-display pb-money pb-goals-hero-num">
            {whole}<span className="pb-hero-cents">{cents}</span>
          </p>
        </div>

        <dl className="pb-goals-hero-split">
          {split.map((r) => (
            <div key={r.key} className="pb-goals-hero-cell">
              <dt>
                <i
                  className={`pb-goals-key pb-goals-key-${r.tone}`} aria-hidden="true"
                  style={r.tone === 'goals' && goalsKey ? { ['--pb-goals-key' as string]: goalsKey } : undefined}
                />
                {r.label}
              </dt>
              <dd className="font-mono-tab" style={r.color ? { color: r.color } : undefined}>{formatCurrency(r.value)}</dd>
              <dd className="pb-goals-hero-pct pb-tnum" aria-hidden={r.pct === null ? true : undefined}>
                {r.pct === null ? ' ' : `${r.pct > 0 && r.pct < 1 ? '<1' : Math.round(r.pct)}%`}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <GoalsAllocationBar slices={slices} total={total} allocated={allocated} unallocated={unallocated} />

      {overAllocated && (
        <p className="pb-goals-over-note">
          {/* Same message as before; its amount now blurs with the others. */}
          {renderTemplate(d.goals.overAllocated, { amount: <span className="font-mono-tab">{formatCurrency(Math.abs(unallocated))}</span> })}
        </p>
      )}
    </section>
  );
}
