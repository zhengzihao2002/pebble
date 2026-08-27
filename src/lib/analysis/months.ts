/**
 * THE DENOMINATOR RULE - shared by every rate metric on the Analysis page.
 *
 * Average monthly spend, savings rate, runway and both year-end projections
 * all divide by a month count. Getting it wrong is not cosmetic: too many
 * months understates spending, which OVERSTATES runway - telling someone their
 * money lasts longer than it does. That is the error direction that must not
 * ship, so this is defined once, here, rather than per metric.
 *
 * THE RULE
 *   Divide by months in which the user was plausibly recording.
 *   - Leading and trailing empty months: excluded. Nothing was recorded.
 *   - Interior gaps of GAP_MONTHS or more consecutive empty months: excluded.
 *     Nobody records nothing for a quarter; the app was not in use.
 *   - Shorter interior gaps: INCLUDED. A quiet month is real data.
 *
 * GAPS ARE DETECTED FROM ALL TRANSACTIONS, NOT JUST EXPENSES.
 * A month with income and no spending is a genuine zero-spend month and must
 * stay in the denominator. Detecting from expenses alone would delete it and
 * silently inflate average spend.
 *
 * The in-progress month is never counted: it is excluded upstream via
 * window.completeEndYmd, so a part-finished month cannot drag any average.
 */

import type { AnalysisWindow } from './windows';

/**
 * Consecutive empty months that constitute a recording gap.
 *
 * Three, because one or two empty months are plausibly frugality or a light
 * season and deserve to count as real zero-spend months, whereas three in a
 * row with no transactions of ANY kind - no income either - means the app was
 * not being used. Someone genuinely spending and earning nothing for a full
 * quarter is rare enough that mis-handling them costs less than reporting a
 * runway several times too long for everyone with a dormant stretch.
 */
export const GAP_MONTHS = 3;

/** Month index since year 0, from a 'YYYY-MM-DD' string. Comparable and
 *  subtractable, with no Date construction and so no timezone surface. */
export function monthIndex(ymd: string): number {
  return Number(ymd.slice(0, 4)) * 12 + Number(ymd.slice(5, 7)) - 1;
}

export interface ObservedMonths {
  /** Denominator for rate metrics. */
  count: number;
  /** Complete months inside the window, before the rule was applied. */
  calendarCount: number;
  /** Months removed as dormant. count + removed = calendarCount. */
  removed: number;
}

/**
 * @param allDates every transaction date in the window, expenses AND income
 * @param window   resolved window; only its complete-month portion is measured
 */
export function computeObservedMonths(
  allDates: readonly string[],
  window: AnalysisWindow,
): ObservedMonths {
  const startIdx = monthIndex(window.startYmd);
  const endIdx = monthIndex(window.endYmd);
  const calendarCount = Math.max(0, endIdx - startIdx + 1);
  if (calendarCount === 0) return { count: 0, calendarCount: 0, removed: 0 };

  // Which complete months hold at least one transaction of any kind.
  const active = new Set<number>();
  for (const d of allDates) {
    const i = monthIndex(d);
    if (i >= startIdx && i <= endIdx) active.add(i);
  }
  if (active.size === 0) return { count: 0, calendarCount, removed: calendarCount };

  const sorted = [...active].sort((a, b) => a - b);

  // Span from first to last active month - this drops leading and trailing
  // empties in one step, no special-casing needed.
  let count = sorted[sorted.length - 1] - sorted[0] + 1;

  // Then subtract interior runs of GAP_MONTHS or more empty months.
  let removed = 0;
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i] - sorted[i - 1] - 1;
    if (gap >= GAP_MONTHS) removed += gap;
  }
  count -= removed;

  return { count, calendarCount, removed: calendarCount - count };
}
