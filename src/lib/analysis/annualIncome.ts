/**
 * Estimated annual income - the SINGLE source for this figure.
 *
 * Used by the Analysis page and by the Modify Budget dialog. Those two
 * previously disagreed on METHOD: the dialog used estimateAnnualIncome() in
 * stats.ts, which divides by months CONTAINING income, while Analysis divided
 * by months the user was recording. Someone paid every other month got double
 * their real income in the dialog - the worst place for it, since an inflated
 * income figure leads directly to over-budgeting.
 *
 * They now share one method and differ only in WINDOW, which each states in
 * its own tooltip:
 *   Analysis - the period selected on the page
 *   Budgets  - trailing 12 months, fixed
 *
 * NOT ALL HISTORY, DELIBERATELY. Averaging across a job change blends an old
 * salary with a new one and reports a figure matching neither. A bounded
 * window tracks current earnings; twelve months is the shortest window holding
 * a full year of bonuses and seasonal variation.
 *
 * CLOCK-FREE: `today` is a parameter. The dialog's loader runs server-side,
 * where the clock is UTC on Vercel, so it receives today from the client.
 *
 * SIDE CASH EXCLUDED - Standard Income only, matching the dashboard.
 * INCOME MEANS NET. t.amount is already netAmount for income rows.
 */

import { isSideCash } from '@/lib/stats';
import type { Transaction } from '@/types';
import { computeObservedMonths } from './months';
import { earliestDate, resolveAnalysisWindow, type AnalysisWindow } from './windows';
import { isExpense } from './spending';

export interface AnnualIncomeEstimate {
  /** Average monthly take-home Standard Income x 12. Null with no recorded month. */
  annual: number | null;
  monthlyAverage: number | null;
  /** The denominator - complete recorded months, dormant stretches removed. */
  recordedMonths: number;
}

/** Core calculation, for a window already resolved. */
export function estimateAnnualIncomeInWindow(
  transactions: readonly Transaction[],
  window: AnalysisWindow,
): AnnualIncomeEstimate {
  const inWindow = transactions.filter((t) => t.date >= window.startYmd && t.date <= window.endYmd);

  // Gap detection sees ALL transactions, expenses and Side Cash included: a
  // month you recorded anything is a month you were recording, even if no
  // Standard Income arrived. Dropping those would hide genuine no-pay months
  // and inflate the estimate.
  const observed = computeObservedMonths(inWindow.map((t) => t.date), window);

  // Complete months only - a part-finished month over a whole-month divisor
  // would understate the average.
  let net = 0;
  for (const t of inWindow) {
    if (isExpense(t) || isSideCash(t)) continue;
    if (window.partialStartYmd && t.date >= window.partialStartYmd) continue;
    net += t.amount;
  }

  const monthlyAverage = observed.count >= 1 ? net / observed.count : null;
  return {
    annual: monthlyAverage === null ? null : monthlyAverage * 12,
    monthlyAverage,
    recordedMonths: observed.count,
  };
}

/**
 * Trailing 12 months. The fixed window for the Modify Budget dialog, which has
 * no period selector of its own.
 */
export function estimateAnnualIncomeTrailing12(
  transactions: readonly Transaction[],
  today: string,
): AnnualIncomeEstimate {
  const window = resolveAnalysisWindow('12m', today, earliestDate(transactions));
  return estimateAnnualIncomeInWindow(transactions, window);
}
