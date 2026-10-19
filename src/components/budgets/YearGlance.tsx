'use client';

import { CalendarClock } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { renderTemplate } from '@/lib/i18n/RichText';
import { ProgressRing } from '@/components/kit/ProgressRing';
import { Skeleton } from '@/components/kit/Skeleton';
import type { PaceStatus } from './pace';

// Before about two weeks of the year a straight-line forecast swings wildly
// on a single bill, so it waits.
const MIN_FORECAST_FRACTION = 14 / 365;

/**
 * NEW: the year at a glance. A ring for how much of the year's budgets is
 * used (pine, wine only once spending passes them - wine means over budget
 * and nothing else) with an ink tick where an even pace would be today, so
 * "am I on track" reads before any figure. Beside it the ring's own scale is
 * not repeated; the plan card's four figures sit next to it.
 *
 * Its partner, YearForecast, says where spending lands on Dec 31 if it keeps
 * its year-to-date rate: totalSpent / yearFraction(today). Both use exactly
 * the plan card's totals, never recomputed.
 *
 * The ring wears pb-chart-fade, so privacy mode blurs it (its percentage
 * gives the ratio away) and a tap reveals it like any chart.
 */
export function YearRing({ totalBudget, totalSpent, fraction }: {
  totalBudget: number;
  totalSpent: number;
  /** yearFraction(today), or null for the first frame. */
  fraction: number | null;
}) {
  const { d, t } = useTranslation();
  const ux = d.ux.budgets;
  if (fraction === null) {
    return (
      <div className="pb-bud-ring" aria-hidden="true">
        <Skeleton width="100%" height="100%" radius="50%" />
      </div>
    );
  }
  const used = totalBudget > 0 ? totalSpent / totalBudget : null;
  const usedPct = used === null ? null : Math.round(used * 100);
  const yearPct = Math.round(fraction * 100);
  return (
    <div
      className="pb-bud-ring pb-chart-fade" role="img"
      aria-label={usedPct === null ? t(ux.yearGone, { pct: String(yearPct) }) : t(ux.ringLabel, { used: String(usedPct), year: String(yearPct) })}
    >
      <ProgressRing value={used ?? 0} size={148} stroke={12} color={used !== null && used > 1 ? 'var(--wine)' : 'var(--pine)'}>
        <span className="pb-bud-ring-pct pb-tnum">{usedPct === null ? '—' : `${usedPct}%`}</span>
        {usedPct !== null && <span className="pb-bud-ring-sub">{ux.used}</span>}
      </ProgressRing>
      {/* Where an even pace would be today: a tick across the ring. */}
      <span className="pb-bud-ring-tick" style={{ transform: `rotate(${Math.min(fraction, 1) * 360}deg)` }} aria-hidden="true">
        <span />
      </span>
    </div>
  );
}

export function YearForecast({ totalBudget, totalSpent, fraction, status, unbudgetedSpent }: {
  totalBudget: number;
  totalSpent: number;
  fraction: number | null;
  /** The plan's pace (same test as the Pace figure), or null without budgets. */
  status: PaceStatus | null;
  /** Spending this year in categories with no budget - part of totalSpent. */
  unbudgetedSpent: number;
}) {
  const { d, t } = useTranslation();
  const ux = d.ux.budgets;
  const money = (n: number) => <span className="font-mono-tab">{formatCurrency(n)}</span>;

  if (fraction === null) {
    return (
      <div className="pb-bud-forecast" aria-hidden="true">
        <Skeleton width="40%" height="0.8rem" />
        <Skeleton width="75%" height="1.3rem" />
        <Skeleton width="60%" height="0.8rem" />
      </div>
    );
  }

  const yearLine = (
    <p className="pb-bud-fc-year">
      <span className="pb-bud-fc-tick" aria-hidden="true" />
      <span className="pb-tnum">{t(ux.yearGone, { pct: String(Math.round(fraction * 100)) })}</span>
    </p>
  );
  if (totalBudget <= 0 || status === null) return <div className="pb-bud-forecast">{yearLine}</div>;

  const projected = totalSpent / fraction;
  const gap = Math.abs(projected - totalBudget);
  const early = fraction < MIN_FORECAST_FRACTION;
  return (
    <div className="pb-bud-forecast">
      <p className="pb-bud-fc-label">
        <CalendarClock size={14} aria-hidden="true" />
        {ux.forecastLabel}
      </p>
      {early ? (
        <p className="pb-bud-fc-cmp">{ux.forecastEarly}</p>
      ) : (
        <>
          <p className="pb-bud-fc-figure">{renderTemplate(ux.forecastBy, { amount: money(projected) })}</p>
          <p className="pb-bud-fc-cmp">
            {status === 'onPace' ? ux.forecastEven
              : renderTemplate(projected > totalBudget ? ux.forecastOver : ux.forecastUnder, { amount: money(gap) })}
          </p>
        </>
      )}
      {yearLine}
      {unbudgetedSpent > 0 && (
        <p className="pb-bud-fc-note">{renderTemplate(ux.includesUnbudgeted, { amount: money(unbudgetedSpent) })}</p>
      )}
    </div>
  );
}
