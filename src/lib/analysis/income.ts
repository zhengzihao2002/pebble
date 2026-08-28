/**
 * Group A: income, deductions, stability. Pure and clock-free.
 *
 * THE WINDOW HOLDS ONLY COMPLETE MONTHS - no partial/complete split here.
 *
 * SIDE CASH IS EXCLUDED THROUGHOUT, matching the dashboard's Income tile and
 * this page's savings rate. For the deduction rate and stability this is a
 * JUDGEMENT CALL, stated in the tooltips: Side Cash usually has no
 * withholding, so including it would pull the rate toward zero.
 *
 * DEDUCTIONS, NOT TAX. The gross-to-net gap also covers insurance and
 * retirement contributions.
 *
 * INCOME MEANS NET where a single figure is used. grossAmount appears only in
 * the deduction calculation.
 */

import { deductionPct, isSideCash } from '@/lib/stats';
import type { IncomeTransaction, Transaction } from '@/types';
import { filterToWindow, type AnalysisWindow } from './windows';
import { computeObservedMonths, monthIndex } from './months';
import { isExpense } from './spending';
import { chartMonthLabel } from './monthLabels';
import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n/locale';

export interface MonthlyDeduction {
  key: string;
  label: string;
  gross: number;
  net: number;
  /** Percentage 0..100. Null when no gross income that month - undefined, not zero. */
  rate: number | null;
}

// ⚠️ RENAMED from spaced English literals ('very steady' etc.) to camelCase.
// Confirmed safe: this value is never persisted and never compared, only
// rendered - so nothing outside this file's own band() depends on the exact
// string. camelCase avoids awkward 'very steady' dictionary keys.
export type StabilityBand = 'veryStable' | 'stable' | 'variable' | 'highlyVariable';

export interface IncomeSummary {
  avgMonthlyNet: number | null;
  deductionRate: number | null;
  monthlyDeductions: MonthlyDeduction[];
  /**
   * Coefficient of variation of monthly net income: stddev / mean. Scale-free,
   * so comparable across incomes. Null with fewer than two months - variation
   * needs at least two observations.
   */
  cv: number | null;
  stability: StabilityBand | null;
  recordedMonths: number;
  /** Months containing any Standard Income. */
  monthsWithIncome: number;
  /** Months counted, e.g. 'Aug 2025 - Jul 2026'. */
  monthsLabel: string;
}

function isStandardIncome(t: Transaction): t is IncomeTransaction {
  return !isExpense(t) && !isSideCash(t);
}

function band(cv: number): StabilityBand {
  // Conventional thresholds, not derived. A salaried income lands near 0; 0.5
  // means the typical month is half again away from the mean.
  if (cv < 0.10) return 'veryStable';
  if (cv < 0.25) return 'stable';
  if (cv < 0.50) return 'variable';
  return 'highlyVariable';
}

export function computeIncomeSummary(
  transactions: readonly Transaction[],
  window: AnalysisWindow,
  locale: Locale = DEFAULT_LOCALE,
): IncomeSummary {
  const inWindow = filterToWindow(window, transactions);

  // Denominator from ALL transactions: a month you recorded anything is a
  // month you were recording, even if it held no Standard Income. Excluding
  // those would hide genuine zero-income months and overstate the average.
  const observed = computeObservedMonths(inWindow.map((t) => t.date), window);

  const startIdx = monthIndex(window.startYmd);
  const endIdx = monthIndex(window.endYmd);

  const grossBy = new Map<number, number>();
  const netBy = new Map<number, number>();
  for (const t of inWindow) {
    if (!isStandardIncome(t)) continue;
    const i = monthIndex(t.date);
    grossBy.set(i, (grossBy.get(i) ?? 0) + t.grossAmount);
    netBy.set(i, (netBy.get(i) ?? 0) + t.netAmount);
  }

  const monthlyDeductions: MonthlyDeduction[] = [];
  const nets: number[] = [];
  let totalGross = 0;
  let totalNet = 0;
  let monthsWithIncome = 0;

  for (let i = startIdx; i <= endIdx; i++) {
    const y = Math.floor(i / 12);
    const m = i % 12;
    const gross = grossBy.get(i) ?? 0;
    const net = netBy.get(i) ?? 0;

    monthlyDeductions.push({
      key: `${y}-${String(m + 1).padStart(2, '0')}`,
      label: chartMonthLabel(y, m, locale),
      gross,
      net,
      // Guarded: deductionPct returns 0 for zero gross, but a month with no pay
      // has an UNDEFINED rate, and the chart must break rather than dip.
      rate: gross > 0 ? deductionPct(gross, net) : null,
    });

    totalGross += gross;
    totalNet += net;
    nets.push(net);
    if (gross > 0) monthsWithIncome++;
  }

  const n = observed.count;
  const avgMonthlyNet = n >= 1 ? totalNet / n : null;

  // Variation across recorded months, zero-income months included: a month
  // with no pay IS instability, and dropping it would report a gig income as
  // steady.
  let cv: number | null = null;
  if (nets.length >= 2 && avgMonthlyNet !== null && avgMonthlyNet > 0) {
    const mean = avgMonthlyNet;
    const variance = nets.reduce((s, v) => s + (v - mean) ** 2, 0) / nets.length;
    cv = Math.sqrt(variance) / mean;
  }

  return {
    avgMonthlyNet,
    // Ratio of sums, not a mean of monthly percentages: this weights by
    // paycheck size, so a small month cannot swing it as much as a large one.
    deductionRate: totalGross > 0 ? deductionPct(totalGross, totalNet) : null,
    monthlyDeductions,
    cv,
    stability: cv !== null ? band(cv) : null,
    recordedMonths: n,
    monthsWithIncome,
    monthsLabel: window.rangeLabel,
  };
}
