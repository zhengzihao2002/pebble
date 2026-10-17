/**
 * Cumulative spending through the Dashboard's period, day by day, beside the
 * previous comparable period - for the Spending pace card.
 *
 * Pure: no clock reads (the caller passes its zone-aware `today`) and no UI
 * imports. Spending is every negative amount, the same rule as the stats
 * card, so "spent so far" here equals the Spending tile's like-for-like figure.
 * The one deliberate difference: "so far" stops at today, so a record dated
 * after today (counted by the tile, which covers the whole calendar window)
 * is left out until its day comes.
 *
 * Days are aligned by POSITION from each window's first day: day 16 of
 * October sits over day 16 of September, day 40 of Q4 over day 40 of Q3.
 * Both sides are cumulative from zero, so the comparison at any day is
 * like-for-like by construction - a half-finished month is never set against
 * a whole one.
 */
import type { Transaction } from '@/types';
import { rangeDays, ymdOf, type DateRange } from './periodCompare';

export interface PacePoint {
  /** 1-based day of the window. */
  day: number;
  /** Cumulative spending this period; null after today (not happened yet). */
  current: number | null;
  /** Cumulative spending in the previous period; null past its last day. */
  previous: number | null;
}

export interface SpendingPace {
  points: PacePoint[];
  /** Index into points of today (or the last day, for a finished period); -1 before the window starts. */
  todayIndex: number;
  spentSoFar: number;
  /** The previous period's cumulative spending at the same day. */
  previousAtPoint: number;
  previousTotal: number;
  /** Days in the current window. */
  length: number;
}

function dailySpending(transactions: readonly Transaction[], range: DateRange): number[] {
  const n = rangeDays(range);
  const out = new Array<number>(n).fill(0);
  const from = ymdOf(range.start);
  const to = ymdOf(range.end);
  const startUtc = Date.UTC(range.start.getFullYear(), range.start.getMonth(), range.start.getDate());
  for (const t of transactions) {
    if (t.amount >= 0 || t.date < from || t.date > to) continue;
    const i = Math.round((Date.UTC(Number(t.date.slice(0, 4)), Number(t.date.slice(5, 7)) - 1, Number(t.date.slice(8, 10))) - startUtc) / 86_400_000);
    if (i >= 0 && i < n) out[i] += Math.abs(t.amount);
  }
  return out;
}

/**
 * `current` and `previous` are WHOLE windows (a month runs to its last day
 * even while it is in progress); `today` decides where the current line stops.
 */
export function buildSpendingPace(
  transactions: readonly Transaction[],
  current: DateRange,
  previous: DateRange,
  today: Date,
): SpendingPace {
  const cur = dailySpending(transactions, current);
  const prev = dailySpending(transactions, previous);
  const length = cur.length;
  const todayYmd = ymdOf(today);
  const todayIndex = todayYmd > ymdOf(current.end)
    ? length - 1
    : todayYmd < ymdOf(current.start)
      ? -1
      : rangeDays({ start: current.start, end: new Date(today.getFullYear(), today.getMonth(), today.getDate()) }) - 1;

  const n = Math.max(length, prev.length);
  const points: PacePoint[] = [];
  let c = 0;
  let p = 0;
  let previousAtPoint = 0;
  for (let i = 0; i < n; i++) {
    if (i < cur.length) c += cur[i];
    if (i < prev.length) p += prev[i];
    if (i === Math.min(todayIndex, prev.length - 1)) previousAtPoint = p;
    points.push({
      day: i + 1,
      current: i <= todayIndex && i < length ? Math.round(c * 100) / 100 : null,
      previous: i < prev.length ? Math.round(p * 100) / 100 : null,
    });
  }
  const spentSoFar = todayIndex >= 0 ? (points[todayIndex]?.current ?? 0) : 0;
  return { points, todayIndex, spentSoFar, previousAtPoint: todayIndex >= 0 ? Math.round(previousAtPoint * 100) / 100 : 0, previousTotal: Math.round(p * 100) / 100, length };
}
