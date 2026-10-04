import type { Transaction } from '@/types';
import { getWindowPredicate, isSideCash, type TrendPoint } from '@/lib/stats';
import { parseLocalDate } from '@/lib/format';
import type { Locale } from '@/lib/i18n/locale';

/** Modes short enough to read by week. Everything else is read by month. */
const WEEKLY_MODES = new Set(['30d', '90d', 'month']);
const DAY_MS = 86_400_000;

function dayIndex(from: Date, to: Date): number {
  return Math.round(
    (Date.UTC(to.getFullYear(), to.getMonth(), to.getDate()) - Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())) / DAY_MS,
  );
}

/**
 * Income and spending over ONE selected window - the Dashboard's shared
 * period - bucketed by week or month.
 *
 * The window comes from getWindowPredicate(), the same predicate behind the
 * stats card and "Where it went", so the three always cover the same dates.
 * Its bounds are read off that predicate by walking the calendar, from 1
 * January of the earliest record's year to the end of the current month
 * (nothing beyond: future buckets would only ever be empty).
 *
 * Income excludes side cash and spending is every negative amount - the
 * same rules as computeStatsForPeriod(). Empty buckets are kept as zero.
 */
export function buildPeriodTrend(
  transactions: Transaction[],
  mode: string,
  periodKey: string | null,
  today: Date,
  locale: Locale,
): TrendPoint[] {
  if (transactions.length === 0) return [];
  const inWindow = getWindowPredicate(mode, periodKey, today);

  let earliest = today;
  for (const t of transactions) {
    const d = parseLocalDate(t.date);
    if (d < earliest) earliest = d;
  }
  const scanEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  let start: Date | null = null;
  let end: Date | null = null;
  for (let d = new Date(earliest.getFullYear(), 0, 1); d <= scanEnd; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    if (inWindow(d)) {
      if (!start) start = d;
      end = d;
    }
  }
  if (!start || !end) return [];

  const isZh = locale === 'zh';
  const weekly = WEEKLY_MODES.has(mode);
  const buckets: { label: string; income: number; spending: number }[] = [];

  if (weekly) {
    const weeks = Math.floor(dayIndex(start, end) / 7) + 1;
    for (let w = 0; w < weeks; w++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7);
      const label = isZh ? `${d.getMonth() + 1}月${d.getDate()}日` : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      buckets.push({ label, income: 0, spending: 0 });
    }
  } else {
    for (let d = new Date(start.getFullYear(), start.getMonth(), 1); d <= end; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      const label = isZh ? `${d.getFullYear()}年${d.getMonth() + 1}月` : d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      buckets.push({ label, income: 0, spending: 0 });
    }
  }

  for (const t of transactions) {
    const d = parseLocalDate(t.date);
    if (d < start || d > end || !inWindow(d)) continue;
    const i = weekly
      ? Math.floor(dayIndex(start, d) / 7)
      : (d.getFullYear() - start.getFullYear()) * 12 + (d.getMonth() - start.getMonth());
    const b = buckets[i];
    if (!b) continue;
    if (t.amount > 0) {
      if (!isSideCash(t)) b.income += t.amount;
    } else {
      b.spending += Math.abs(t.amount);
    }
  }

  return buckets.map((b) => ({ month: b.label, income: Math.round(b.income), spending: Math.round(b.spending) }));
}
