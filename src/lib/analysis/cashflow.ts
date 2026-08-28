/**
 * Group C: cash flow, savings rate, runway, fixed commitments.
 * Pure and clock-free - the window arrives resolved.
 *
 * THE WINDOW HOLDS ONLY COMPLETE MONTHS. There is no partial/complete split
 * here any more: every row is in a finished month by construction.
 *
 * SIDE CASH IS EXCLUDED FROM EVERY INCOME FIGURE, matching the dashboard's
 * Income tile. One exception, deliberate: gap detection for the denominator
 * counts ALL transactions, Side Cash included, because a month with only Side
 * Cash is still a month you were recording.
 *
 * INCOME MEANS NET. Transaction.amount for income already equals netAmount.
 *
 * BALANCE ADJUSTMENTS CANNOT REACH HERE - not in the Transaction union, and
 * the page never receives them.
 */

import { isSideCash } from '@/lib/stats';
import { isExhausted } from '@/lib/recurring/occurrences';
import type { RecurringRule, Transaction } from '@/types';
import { filterToWindow, type AnalysisWindow } from './windows';
import { computeObservedMonths, monthIndex } from './months';
import { isExpense } from './spending';
import { chartMonthLabel } from './monthLabels';
import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n/locale';

export interface MonthlyFlow {
  key: string; // 'YYYY-MM'
  label: string;
  income: number;   // net, Side Cash excluded
  spending: number; // positive magnitude
  net: number;
  /** Null when income is zero - a rate with no denominator is undefined, not zero. */
  savingsRate: number | null;
  /** Always false: the window holds only complete months. Kept for the chart. */
  isPartial: boolean;
  overspent: boolean;
}

export interface CashflowSummary {
  months: MonthlyFlow[];
  avgMonthlyIncome: number | null;
  avgMonthlySpend: number | null;
  avgMonthlyNet: number | null;
  /**
   * (income - spending) / income across the window's complete months.
   *
   * Deliberately NOT the dashboard's figure. The dashboard includes the month
   * in progress because it answers "where am I right now"; this page answers
   * "what are my patterns", and a pattern needs complete periods.
   */
  savingsRate: number | null;
  overspentMonths: MonthlyFlow[];
  /**
   * Months the balance lasts at the average net burn. Null when income covers
   * spending - "infinite runway" is not a number. Capped at 600 so a near-zero
   * burn cannot print an absurd figure.
   */
  runwayMonths: number | null;
  /** Balance divided by average spend: how long if income stopped entirely. */
  expenseCoverMonths: number | null;
  recordedMonths: number;
  /** Months counted, e.g. 'Aug 2025 - Jul 2026'. */
  monthsLabel: string;
}

export function computeCashflow(
  transactions: readonly Transaction[],
  window: AnalysisWindow,
  totalBalance: number,
  locale: Locale = DEFAULT_LOCALE,
): CashflowSummary {
  const inWindow = filterToWindow(window, transactions);

  // ALL transactions, Side Cash included - see the header.
  const observed = computeObservedMonths(inWindow.map((t) => t.date), window);

  const startIdx = monthIndex(window.startYmd);
  const endIdx = monthIndex(window.endYmd);

  const income = new Map<number, number>();
  const spend = new Map<number, number>();
  for (const t of inWindow) {
    const i = monthIndex(t.date);
    if (isExpense(t)) {
      spend.set(i, (spend.get(i) ?? 0) + Math.abs(t.amount));
    } else if (!isSideCash(t)) {
      income.set(i, (income.get(i) ?? 0) + t.amount);
    }
  }

  const months: MonthlyFlow[] = [];
  let totalIncome = 0;
  let totalSpend = 0;
  for (let i = startIdx; i <= endIdx; i++) {
    const y = Math.floor(i / 12);
    const m = i % 12;
    const inc = income.get(i) ?? 0;
    const sp = spend.get(i) ?? 0;
    totalIncome += inc;
    totalSpend += sp;
    months.push({
      key: `${y}-${String(m + 1).padStart(2, '0')}`,
      label: chartMonthLabel(y, m, locale),
      income: inc,
      spending: sp,
      net: inc - sp,
      savingsRate: inc > 0 ? (inc - sp) / inc : null,
      isPartial: false,
      // A month with neither income nor spending is dormant, not overspent.
      overspent: sp > inc && (sp > 0 || inc > 0),
    });
  }

  const n = observed.count;
  const avgMonthlyIncome = n >= 1 ? totalIncome / n : null;
  const avgMonthlySpend = n >= 1 ? totalSpend / n : null;
  const avgMonthlyNet =
    avgMonthlyIncome !== null && avgMonthlySpend !== null ? avgMonthlyIncome - avgMonthlySpend : null;

  // Burn only. When income covers spending the balance is not being drawn
  // down, so runway is undefined rather than large.
  const burn = avgMonthlyNet !== null && avgMonthlyNet < 0 ? -avgMonthlyNet : null;

  return {
    months,
    avgMonthlyIncome,
    avgMonthlySpend,
    avgMonthlyNet,
    savingsRate: totalIncome > 0 ? (totalIncome - totalSpend) / totalIncome : null,
    overspentMonths: months.filter((m) => m.overspent),
    runwayMonths: burn !== null && totalBalance > 0 ? Math.min(600, totalBalance / burn) : null,
    expenseCoverMonths:
      avgMonthlySpend !== null && avgMonthlySpend > 0 && totalBalance > 0
        ? Math.min(600, totalBalance / avgMonthlySpend)
        : null,
    recordedMonths: n,
    monthsLabel: window.rangeLabel,
  };
}

export interface Commitments {
  expenseMonthly: number;  // positive magnitude
  incomeMonthly: number;   // net
  expenseCount: number;
  incomeCount: number;
}

/** Frequency to occurrences per month. 'once' is not a commitment. */
const PER_MONTH: Record<string, number> = {
  weekly: 52 / 12,
  biweekly: 26 / 12,
  monthly: 1,
  yearly: 1 / 12,
};

/**
 * Recurring rules normalised to a monthly figure.
 *
 * THREE FILTERS, all required. getRecurringRules() excludes only 'deleted', so
 * PAUSED rules arrive here and are not commitments. A 'once' rule is a single
 * future event, not an ongoing obligation. An exhausted rule owes nothing.
 */
export function computeCommitments(rules: readonly RecurringRule[]): Commitments {
  let expenseMonthly = 0;
  let incomeMonthly = 0;
  let expenseCount = 0;
  let incomeCount = 0;

  for (const r of rules) {
    if (r.status !== 'active') continue;
    if (r.frequency === 'once') continue;
    // Second argument required: isExhausted takes a RecurrenceSpec, which is
    // the dependency-free structural type and knows nothing about
    // materialization state. The caller supplies it.
    if (isExhausted(r, r.materializedThrough)) continue;
    const per = PER_MONTH[r.frequency];
    if (per === undefined) continue;

    if (r.kind === 'expense') {
      expenseMonthly += Math.abs(r.amount) * per;
      expenseCount++;
    } else {
      incomeMonthly += r.amount * per;
      incomeCount++;
    }
  }

  return { expenseMonthly, incomeMonthly, expenseCount, incomeCount };
}
