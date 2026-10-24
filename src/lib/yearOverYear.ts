/**
 * "Same period last year": the Dashboard's selected period set against the
 * same window one year earlier.
 *
 * Pure, like periodCompare.ts it builds on: every function takes the caller's
 * zone-aware `today`, nothing reads a clock.
 *
 * WINDOWS. A month, quarter or year goes back to the same month, quarter or
 * year of the previous calendar year. A rolling window (last 30/90 days, last
 * 6/12 months) is shifted back exactly 12 months, so "the last 30 days" meets
 * the same 30 days a year ago.
 *
 * LIKE-FOR-LIKE. While a month, quarter or year is in progress the earlier
 * window is cut at the same point (October 1-16 against October 1-16 a year
 * back), exactly the rule periodCompare uses; a finished period meets the
 * whole earlier one. The current window is NOT cut: it already holds only what
 * has happened.
 *
 * NOTHING TO COMPARE. A year back with no record at all, or history that
 * starts after that window began (coversHistory), is not a comparison - a full
 * period set against a mostly empty one would report a large false increase -
 * so the result is null and the card renders nothing.
 */
import type { Transaction } from '@/types';
import {
  addMonthsClamped,
  coversHistory,
  earliestDate,
  shiftedWindow,
  spendingByCategoryInRange,
  statsInRange,
  windowBounds,
  ymdOf,
  type DateRange,
  type RangeStats,
} from '@/lib/periodCompare';

const UNIT_MONTHS: Record<string, number> = { month: 1, quarter: 3, year: 12 };

export interface CategoryMover {
  /** The stored category name. */
  category: string;
  current: number;
  previous: number;
  /** current - previous: positive when spending rose. */
  change: number;
}

export interface YearOverYear {
  current: RangeStats;
  previous: RangeStats;
  currentRange: DateRange;
  previousRange: DateRange;
  /** Up to three categories whose spending moved most, by absolute change. */
  movers: CategoryMover[];
}

/** The window one year before the Dashboard's selected one (see the file comment). */
export function yearAgoWindow(mode: string, periodKey: string | null, today: Date): DateRange {
  const unit = UNIT_MONTHS[mode];
  if (unit) return shiftedWindow(mode, periodKey, today, 12 / unit, true);
  const base = windowBounds(mode, periodKey, today);
  return { start: addMonthsClamped(base.start, -12), end: addMonthsClamped(base.end, -12) };
}

export function compareYearOverYear(
  transactions: readonly Transaction[],
  mode: string,
  periodKey: string | null,
  today: Date,
  moverCount = 3,
): YearOverYear | null {
  const previousRange = yearAgoWindow(mode, periodKey, today);
  const from = ymdOf(previousRange.start);
  const to = ymdOf(previousRange.end);
  let any = false;
  for (const t of transactions) if (t.date >= from && t.date <= to) { any = true; break; }
  if (!any || !coversHistory(previousRange, earliestDate(transactions))) return null;

  const currentRange = windowBounds(mode, periodKey, today);
  const cur = spendingByCategoryInRange(transactions, currentRange);
  const prev = spendingByCategoryInRange(transactions, previousRange);
  const movers = [...new Set([...Object.keys(cur), ...Object.keys(prev)])]
    .map((category): CategoryMover => {
      const current = cur[category] ?? 0;
      const previous = prev[category] ?? 0;
      return { category, current, previous, change: Math.round((current - previous) * 100) / 100 };
    })
    .filter((m) => m.change !== 0)
    // Biggest swing first; the name breaks a tie so the order never depends on key order.
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change) || (a.category < b.category ? -1 : 1))
    .slice(0, moverCount);

  return {
    current: statsInRange(transactions, currentRange),
    previous: statsInRange(transactions, previousRange),
    currentRange,
    previousRange,
    movers,
  };
}
