/**
 * Group C: cash flow, savings rate, runway, fixed commitments.
 * Pure and clock-free - the window arrives resolved.
 *
 * SIDE CASH IS EXCLUDED FROM EVERY INCOME FIGURE HERE, matching
 * computeStatsForPeriod() in stats.ts and the dashboard's Income tile. If this
 * page counted it and the dashboard did not, both would look broken.
 *
 * ONE EXCEPTION, DELIBERATE: gap detection for the denominator counts ALL
 * transactions, Side Cash included. A month with only Side Cash is still a
 * month you were recording. Excluding it would shrink the denominator and
 * inflate every rate below.
 *
 * INCOME MEANS NET. Transaction.amount for income already equals netAmount;
 * grossAmount is display-only. Never sum gross here.
 *
 * BALANCE ADJUSTMENTS CANNOT REACH HERE - not in the Transaction union, and
 * the page never receives them. Corrections are not income or spending.
 */

import { isSideCash } from '@/lib/stats';
import { isExhausted } from '@/lib/recurring/occurrences';
import type { RecurringRule, Transaction } from '@/types';
import { filterToWindow, type AnalysisWindow } from './windows';
import { computeObservedMonths, monthIndex } from './months';
import { isExpense } from './spending';

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface MonthlyFlow {
  key: string; // 'YYYY-MM'
  label: string;
  income: number;   // net, Side Cash excluded
  spending: number; // positive magnitude
  net: number;
  /** Null when income is zero - a rate with no denominator is not zero, it is undefined. */
  savingsRate: number | null;
  isPartial: boolean;
  overspent: boolean;
}

export interface CashflowSummary {
  months: MonthlyFlow[];
  /** Complete recorded months only. Null when there are none. */
  avgMonthlyIncome: number | null;
  avgMonthlySpend: number | null;
  avgMonthlyNet: number | null;
  /** Blended rate over complete months: (income - spend) / income. */
  savingsRate: number | null;
  /** Complete months where spending exceeded income. */
  overspentMonths: MonthlyFlow[];
  /**
   * Months the balance lasts at the average NET burn. Null when income covers
   * spending - "infinite runway" is not a number, and printing one would be
   * misleading. Capped at 600 so a near-zero burn cannot print an absurd figure.
   */
  runwayMonths: number | null;
  /** Balance divided by average spend: how long if income stopped entirely. */
  expenseCoverMonths: number | null;
  recordedMonths: number;
}

export function computeCashflow(
  transactions: readonly Transaction[],
  window: AnalysisWindow,
  totalBalance: number,
): CashflowSummary {
  const inWindow = filterToWindow(window, transactions);

  // ALL transactions, Side Cash included - see the header.
  const observed = computeObservedMonths(inWindow.map((t) => t.date), window);

  const startIdx = monthIndex(window.startYmd);
  const endIdx = monthIndex(window.endYmd);
  const partialIdx = window.partialStartYmd ? monthIndex(window.partialStartYmd) : null;

  const income = new Map<number, number>();
  const spend = new Map<number, number>();
  for (const t of inWindow) {
    const i = monthIndex(t.date);
    if (isExpense(t)) {
      spend.set(i, (spend.get(i) ?? 0) + Math.abs(t.amount));
    } else if (!isSideCash(t)) {
      // t.amount is already netAmount for income rows.
      income.set(i, (income.get(i) ?? 0) + t.amount);
    }
  }

  const months: MonthlyFlow[] = [];
  let completeIncome = 0;
  let completeSpend = 0;
  // WHOLE window, current month included - see savingsRate below.
  let windowIncome = 0;
  let windowSpend = 0;
  for (let i = startIdx; i <= endIdx; i++) {
    const y = Math.floor(i / 12);
    const m = i % 12;
    const inc = income.get(i) ?? 0;
    const sp = spend.get(i) ?? 0;
    const isPartial = partialIdx !== null && i === partialIdx;
    windowIncome += inc;
    windowSpend += sp;
    if (!isPartial) {
      completeIncome += inc;
      completeSpend += sp;
    }
    months.push({
      key: `${y}-${String(m + 1).padStart(2, '0')}`,
      label: m === 0 ? `${MONTH_ABBR[m]} ${String(y).slice(2)}` : MONTH_ABBR[m],
      income: inc,
      spending: sp,
      net: inc - sp,
      savingsRate: inc > 0 ? (inc - sp) / inc : null,
      isPartial,
      // A month with neither income nor spending is dormant, not overspent.
      overspent: !isPartial && sp > inc && (sp > 0 || inc > 0),
    });
  }

  const n = observed.count;
  const avgMonthlyIncome = n >= 1 ? completeIncome / n : null;
  const avgMonthlySpend = n >= 1 ? completeSpend / n : null;
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
    // WHOLE WINDOW, INCLUDING THE CURRENT MONTH - unlike the per-month
    // averages above, which exclude it.
    //
    // A rate PER MONTH is distorted by a part-finished month: partial
    // numerator over a whole-month denominator. A savings RATE is a ratio of
    // two sums over the same span - this month's income and this month's
    // spending are both partial, so they scale together and cancel. Excluding
    // the month would discard real data and make this disagree with the
    // dashboard tile, which includes it.
    savingsRate: windowIncome > 0 ? (windowIncome - windowSpend) / windowIncome : null,
    overspentMonths: months.filter((m) => m.overspent),
    runwayMonths: burn !== null && totalBalance > 0 ? Math.min(600, totalBalance / burn) : null,
    expenseCoverMonths:
      avgMonthlySpend !== null && avgMonthlySpend > 0 && totalBalance > 0
        ? Math.min(600, totalBalance / avgMonthlySpend)
        : null,
    recordedMonths: n,
  };
}

export interface Commitments {
  expenseMonthly: number;  // positive magnitude
  incomeMonthly: number;   // net
  expenseCount: number;
  incomeCount: number;
}

/** Frequency to occurrences per month. 'once' is not a commitment and is filtered out. */
const PER_MONTH: Record<string, number> = {
  weekly: 52 / 12,
  biweekly: 26 / 12,
  monthly: 1,
  yearly: 1 / 12,
};

/**
 * Recurring rules normalised to a monthly figure.
 *
 * THREE FILTERS, all required. getRecurringRules() only excludes 'deleted', so
 * PAUSED rules arrive here and are not commitments. A 'once' rule is a single
 * future event, not an ongoing obligation. An exhausted rule has no
 * occurrences left to owe.
 */
export function computeCommitments(rules: readonly RecurringRule[]): Commitments {
  let expenseMonthly = 0;
  let incomeMonthly = 0;
  let expenseCount = 0;
  let incomeCount = 0;

  for (const r of rules) {
    if (r.status !== 'active') continue;
    if (r.frequency === 'once') continue;
    // Second argument is required: isExhausted() takes a RecurrenceSpec, which
    // is the dependency-free structural type in occurrences.ts and deliberately
    // knows nothing about materialization state. The caller supplies it.
    if (isExhausted(r, r.materializedThrough)) continue;
    const per = PER_MONTH[r.frequency];
    if (per === undefined) continue;

    if (r.kind === 'expense') {
      expenseMonthly += Math.abs(r.amount) * per;
      expenseCount++;
    } else {
      // r.amount is NET for income rules, matching the transaction rule.
      incomeMonthly += r.amount * per;
      incomeCount++;
    }
  }

  return { expenseMonthly, incomeMonthly, expenseCount, incomeCount };
}
