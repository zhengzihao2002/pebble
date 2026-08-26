/**
 * Group A: income, deductions, stability. Pure and clock-free.
 *
 * SIDE CASH IS EXCLUDED THROUGHOUT, matching the dashboard's Income tile and
 * this page's savings rate. For the deduction rate this is a JUDGEMENT CALL,
 * stated in the tooltip: Side Cash usually has no withholding, so including it
 * would pull the rate toward zero and describe nothing real.
 *
 * DEDUCTIONS, NOT TAX. The gap between gross and net also covers insurance and
 * retirement contributions. Never label it tax.
 *
 * INCOME MEANS NET where a single figure is used. grossAmount appears only in
 * the deduction calculation, never summed as income.
 */

import { deductionPct, isSideCash } from '@/lib/stats';
import type { IncomeTransaction, Transaction } from '@/types';
import { filterToWindow, type AnalysisWindow } from './windows';
import { computeObservedMonths, monthIndex } from './months';
import { isExpense } from './spending';

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface MonthlyDeduction {
  key: string;
  label: string;
  gross: number;
  net: number;
  /** Percentage 0..100. Null when no gross income that month - undefined, not zero. */
  rate: number | null;
}

export type StabilityBand = 'very steady' | 'steady' | 'variable' | 'highly variable';

export interface IncomeSummary {
  /** Average monthly net income over recorded complete months. */
  avgMonthlyNet: number | null;
  /** avgMonthlyNet x 12. An estimate, labelled as one. */
  annualEstimate: number | null;
  /** Ratio of sums: (gross - net) / gross, as a percentage. */
  deductionRate: number | null;
  monthlyDeductions: MonthlyDeduction[];
  /**
   * Coefficient of variation of monthly net income: stddev / mean.
   * Scale-free, so comparable across incomes. Null with fewer than two
   * complete recorded months - variation needs at least two observations.
   */
  cv: number | null;
  stability: StabilityBand | null;
  recordedMonths: number;
  /** Complete recorded months containing any Standard Income. */
  monthsWithIncome: number;
}

function isStandardIncome(t: Transaction): t is IncomeTransaction {
  return !isExpense(t) && !isSideCash(t);
}

function band(cv: number): StabilityBand {
  // Thresholds are conventional, not derived. A salaried income lands near 0;
  // 0.5 means the typical month is half again away from the mean, which is
  // plainly variable. Stated as a rough guide in the tooltip.
  if (cv < 0.10) return 'very steady';
  if (cv < 0.25) return 'steady';
  if (cv < 0.50) return 'variable';
  return 'highly variable';
}

export function computeIncomeSummary(
  transactions: readonly Transaction[],
  window: AnalysisWindow,
): IncomeSummary {
  const inWindow = filterToWindow(window, transactions);

  // Denominator from ALL transactions, Side Cash and expenses included: a
  // month you recorded anything is a month you were recording, even if it
  // held no Standard Income. Excluding those months would hide genuine
  // zero-income months and overstate both the average and the stability.
  const observed = computeObservedMonths(inWindow.map((t) => t.date), window);

  const startIdx = monthIndex(window.startYmd);
  const endIdx = monthIndex(window.endYmd);
  const partialIdx = window.partialStartYmd ? monthIndex(window.partialStartYmd) : null;

  const grossBy = new Map<number, number>();
  const netBy = new Map<number, number>();
  for (const t of inWindow) {
    if (!isStandardIncome(t)) continue;
    const i = monthIndex(t.date);
    grossBy.set(i, (grossBy.get(i) ?? 0) + t.grossAmount);
    netBy.set(i, (netBy.get(i) ?? 0) + t.netAmount);
  }

  const monthlyDeductions: MonthlyDeduction[] = [];
  const completeNets: number[] = [];
  let completeGross = 0;
  let completeNet = 0;
  let monthsWithIncome = 0;

  for (let i = startIdx; i <= endIdx; i++) {
    const y = Math.floor(i / 12);
    const m = i % 12;
    const gross = grossBy.get(i) ?? 0;
    const net = netBy.get(i) ?? 0;
    const isPartial = partialIdx !== null && i === partialIdx;

    monthlyDeductions.push({
      key: `${y}-${String(m + 1).padStart(2, '0')}`,
      label: m === 0 ? `${MONTH_ABBR[m]} ${String(y).slice(2)}` : MONTH_ABBR[m],
      gross,
      net,
      rate: gross > 0 ? deductionPct(gross, net) : null,
    });

    if (!isPartial) {
      completeGross += gross;
      completeNet += net;
      completeNets.push(net);
      if (gross > 0) monthsWithIncome++;
    }
  }

  const n = observed.count;
  const avgMonthlyNet = n >= 1 ? completeNet / n : null;

  // Variation across recorded complete months, zero-income months included:
  // a month with no pay IS instability, and dropping it would report a gig
  // income as steady.
  let cv: number | null = null;
  if (completeNets.length >= 2 && avgMonthlyNet !== null && avgMonthlyNet > 0) {
    const mean = avgMonthlyNet;
    const variance = completeNets.reduce((s, v) => s + (v - mean) ** 2, 0) / completeNets.length;
    cv = Math.sqrt(variance) / mean;
  }

  return {
    avgMonthlyNet,
    annualEstimate: avgMonthlyNet !== null ? avgMonthlyNet * 12 : null,
    // Ratio of sums, not a mean of monthly percentages: this weights by
    // paycheck size, so a small month cannot swing the figure as much as a
    // large one.
    deductionRate: completeGross > 0 ? deductionPct(completeGross, completeNet) : null,
    monthlyDeductions,
    cv,
    stability: cv !== null ? band(cv) : null,
    recordedMonths: n,
    monthsWithIncome,
  };
}
