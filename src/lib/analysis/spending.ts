/**
 * Group B spending metrics. Pure and clock-free: the window is passed in,
 * already resolved, so nothing here reads a clock.
 *
 * CLASSIFICATION IS BY t.type, NOT BY SIGN. computeStatsForPeriod() in stats.ts
 * splits on `t.amount > 0`. Both agree in practice - the expense CHECK forces
 * amount <= 0 and net_amount >= 0 - but Reports classifies with isExpense(),
 * and Reports is the page whose category totals these numbers are cross-checked
 * against. Matching Reports is what keeps that check meaningful.
 *
 * BALANCE ADJUSTMENTS CANNOT REACH HERE. They are not in the Transaction union
 * and the Analysis page never receives them: page.tsx consumes them server-side
 * for the balance and drops them. Corrections are not spending.
 *
 * SIDE CASH is not a factor in this module - it is an income category, and
 * nothing here touches income. It does affect the DENOMINATOR indirectly, via
 * gap detection below, which is correct: a month with only Side Cash income is
 * still a month you were recording.
 */

import type { ExpenseTransaction, Transaction } from '@/types';
import { filterToWindow, type AnalysisWindow } from './windows';
import { computeObservedMonths, monthIndex } from './months';

export function isExpense(t: Transaction): t is ExpenseTransaction {
  return t.type === 'expense';
}

export interface CategorySpend {
  category: string;
  /** Positive magnitude. expense.amount is stored negative. */
  total: number;
  /** Fraction of window spend, 0..1. */
  share: number;
}

export interface SpendingSummary {
  /** Whole window, including the in-progress month. Matches Reports. */
  total: number;
  /**
   * Complete-month spend divided by recorded months. Null when no complete
   * recorded month exists in the window.
   */
  monthlyAverage: number | null;
  /** Descending by total. Covers the whole window, in-progress month included. */
  categories: CategorySpend[];
  /**
   * Share of spend held by the top 3 categories, 0..1. Null when there is no
   * spend. With 3 or fewer categories this is 1 by definition, which is
   * correct rather than a bug.
   */
  top3Share: number | null;
  expenseCount: number;
  /** Denominator behind monthlyAverage, per the rule in months.ts. */
  completeMonths: number;
  /** Complete calendar months in the window, before the denominator rule. */
  calendarMonths: number;
  /** Months dropped as dormant. Surfaced so the figure can explain itself. */
  dormantMonths: number;
  /** Months counted, e.g. 'Aug 2025 - Jul 2026'. */
  monthsLabel: string;
}

export function computeSpendingSummary(
  transactions: readonly Transaction[],
  window: AnalysisWindow,
): SpendingSummary {
  const inWindow = filterToWindow(window, transactions);
  const expenses = inWindow.filter(isExpense);

  // ALL transactions, expenses and income alike. A month with income and no
  // spending is a genuine zero-spend month and must stay in the denominator.
  const observed = computeObservedMonths(inWindow.map((t) => t.date), window);
  const observedMonths = observed.count;

  // Split at the month boundary. The average uses COMPLETE months only, so a
  // part-finished month cannot drag it - the current month is reported on its
  // own instead. Totals and categories below still cover the whole window, so
  // they keep matching Reports for the same range.
  const byCategory = new Map<string, number>();
  let total = 0;
  // No partial/complete split any more: the window contains only complete
  // months by construction, so every row here is in a finished month.
  for (const e of expenses) {
    const mag = Math.abs(e.amount);
    total += mag;
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + mag);
  }

  const categories: CategorySpend[] = [...byCategory.entries()]
    .map(([category, catTotal]) => ({
      category,
      total: catTotal,
      share: total > 0 ? catTotal / total : 0,
    }))
    .sort((a, b) => b.total - a.total || a.category.localeCompare(b.category));

  const top3 = categories.slice(0, 3).reduce((s, c) => s + c.total, 0);

  return {
    total,
    monthlyAverage: observedMonths >= 1 ? total / observedMonths : null,
    categories,
    top3Share: total > 0 ? top3 / total : null,
    expenseCount: expenses.length,
    completeMonths: observedMonths,
    calendarMonths: observed.calendarCount,
    dormantMonths: observed.removed,
    monthsLabel: window.rangeLabel,
  };
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface MonthlySpend {
  key: string; // 'YYYY-MM'
  label: string;
  total: number;
  /** The in-progress month. Rendered differently so it is not read as a dip. */
  isPartial: boolean;
}

/**
 * Continuous month-by-month spend across the window. Months with no spending
 * are emitted as zero rather than skipped: a gap in the chart IS the
 * information. Dormant stretches are excluded from the AVERAGE but still shown
 * here, because hiding them would misrepresent the shape of the history.
 */
export function computeMonthlySpend(
  transactions: readonly Transaction[],
  window: AnalysisWindow,
): MonthlySpend[] {
  const expenses = filterToWindow(window, transactions).filter(isExpense);

  const byMonth = new Map<string, number>();
  for (const e of expenses) {
    const k = e.date.slice(0, 7);
    byMonth.set(k, (byMonth.get(k) ?? 0) + Math.abs(e.amount));
  }

  const startIdx = monthIndex(window.startYmd);
  const endIdx = monthIndex(window.endYmd);

  const out: MonthlySpend[] = [];
  for (let i = startIdx; i <= endIdx; i++) {
    const y = Math.floor(i / 12);
    const m = i % 12;
    const key = `${y}-${String(m + 1).padStart(2, '0')}`;
    out.push({
      key,
      // Year shown only in January, so the axis stays readable at 375px.
      label: m === 0 ? `${MONTH_ABBR[m]} ${String(y).slice(2)}` : MONTH_ABBR[m],
      total: byMonth.get(key) ?? 0,
      // Always false now: the window holds only complete months. Kept so the
      // chart's Cell colouring needs no change.
      isPartial: false,
    });
  }
  return out;
}
