/**
 * Group D: year-over-year, projections, budget variance.
 * Clock-free: `today` is always a parameter.
 *
 * SIDE CASH EXCLUDED from every income figure, matching Groups A and C.
 * BALANCE ADJUSTMENTS cannot reach here - not in the Transaction union.
 * PROJECTIONS ARE ESTIMATES and must be labelled as such wherever shown.
 */

import { isSideCash } from '@/lib/stats';
import type { Transaction } from '@/types';
import { monthIndex } from './months';
import { isExpense } from './spending';

export interface YearStats {
  year: number;
  income: number;
  spending: number;
  net: number;
  /** Null when no income that year - a rate with no denominator is undefined. */
  savingsRate: number | null;
  /** Months of that year containing any transaction. */
  recordedMonths: number;
  /** True for the year in progress - not directly comparable to complete years. */
  isCurrent: boolean;
}

/** Per-year totals across ALL history. Deliberately ignores the page's period
 *  selector: a year-over-year comparison filtered to three months is meaningless. */
export function computeYearOverYear(
  transactions: readonly Transaction[],
  today: string,
): YearStats[] {
  const currentYear = Number(today.slice(0, 4));
  const byYear = new Map<number, { income: number; spending: number; months: Set<number> }>();

  for (const t of transactions) {
    const y = Number(t.date.slice(0, 4));
    let e = byYear.get(y);
    if (!e) {
      e = { income: 0, spending: 0, months: new Set() };
      byYear.set(y, e);
    }
    e.months.add(Number(t.date.slice(5, 7)));
    if (isExpense(t)) e.spending += Math.abs(t.amount);
    else if (!isSideCash(t)) e.income += t.amount;
  }

  return [...byYear.entries()]
    .map(([year, e]) => ({
      year,
      income: e.income,
      spending: e.spending,
      net: e.income - e.spending,
      savingsRate: e.income > 0 ? (e.income - e.spending) / e.income : null,
      recordedMonths: e.months.size,
      isCurrent: year === currentYear,
    }))
    .sort((a, b) => a.year - b.year);
}

export interface Projection {
  /** Flat: current balance + average monthly net x months remaining. */
  flat: number;
  /**
   * Same, but distributing the remaining months by their historical seasonal
   * weight. Null with under two years of history: with one year there is no
   * repeated pattern, so any weighting would be noise presented as insight.
   */
  seasonal: number | null;
  monthsRemaining: number;
  /** Complete years backing the seasonal weights. */
  seasonalYears: number;
}

/**
 * @param avgMonthlyNet from computeCashflow - already excludes Side Cash and
 *                      uses the shared recorded-months denominator
 */
export function computeProjection(
  transactions: readonly Transaction[],
  today: string,
  totalBalance: number,
  avgMonthlyNet: number | null,
): Projection | null {
  if (avgMonthlyNet === null) return null;

  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7)); // 1-based
  const day = Number(today.slice(8, 10));
  const daysThisMonth = new Date(year, month, 0).getDate();

  // The current month counts only for the days still ahead of it. A projection
  // made on the 25th must not assume all of this month is still to come.
  const monthsRemaining = (12 - month) + (daysThisMonth - day) / daysThisMonth;

  const flat = totalBalance + avgMonthlyNet * monthsRemaining;

  // Seasonal weights: each calendar month's share of net flow, from COMPLETE
  // prior years only. The current year is excluded - it is the thing being
  // projected, and including it would let the projection feed itself.
  const netByMonth = new Map<number, number[]>();
  const yearsSeen = new Set<number>();
  for (const t of transactions) {
    const y = Number(t.date.slice(0, 4));
    if (y >= year) continue;
    yearsSeen.add(y);
    const m = Number(t.date.slice(5, 7));
    const amt = isExpense(t) ? -Math.abs(t.amount) : isSideCash(t) ? 0 : t.amount;
    const arr = netByMonth.get(m) ?? [];
    arr.push(amt);
    netByMonth.set(m, arr);
  }

  let seasonal: number | null = null;
  if (yearsSeen.size >= 2) {
    const yearCount = yearsSeen.size;
    const monthAvg: number[] = [];
    for (let m = 1; m <= 12; m++) {
      const sum = (netByMonth.get(m) ?? []).reduce((s, v) => s + v, 0);
      monthAvg[m] = sum / yearCount;
    }
    const overall = monthAvg.slice(1).reduce((s, v) => s + v, 0) / 12;

    if (overall !== 0) {
      let weighted = 0;
      for (let m = month + 1; m <= 12; m++) weighted += monthAvg[m];
      // Current month, pro-rated for the days remaining.
      weighted += monthAvg[month] * ((daysThisMonth - day) / daysThisMonth);
      // Rescale so the seasonal shape is applied to the CURRENT average rather
      // than to historical amounts, which may be from a different income level.
      seasonal = totalBalance + (weighted / overall) * avgMonthlyNet;
    }
  }

  return { flat, seasonal, monthsRemaining, seasonalYears: yearsSeen.size };
}

export interface BudgetVariance {
  category: string;
  spent: number;
  budget: number;
  /** Spent as a share of budget, 0..n. Over 1 means over budget. */
  usedShare: number;
  overBudget: boolean;
}

/**
 * Year-to-date spend against annual budgets. Uses the CALENDAR YEAR, not the
 * page's period selector, because budget.annual_amount is an annual figure.
 *
 * @param spentByCategory from computeCategorySpent(transactions, year)
 */
export function computeBudgetVariance(
  spentByCategory: Record<string, number>,
  budgets: Record<string, number>,
): BudgetVariance[] {
  return Object.entries(budgets)
    .filter(([, annual]) => annual > 0)
    .map(([category, annual]) => {
      const spent = Math.abs(spentByCategory[category] ?? 0);
      return {
        category,
        spent,
        budget: annual,
        usedShare: spent / annual,
        overBudget: spent > annual,
      };
    })
    .sort((a, b) => b.usedShare - a.usedShare);
}

/** How far through the calendar year today is, 0..1. The pace to compare
 *  budget usage against. */
export function yearProgress(today: string): number {
  const year = Number(today.slice(0, 4));
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  const now = Date.UTC(year, Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)));
  // UTC throughout, on a date already resolved in the user's zone - this is
  // elapsed-fraction arithmetic on three fixed points, not a clock read.
  return (now - start) / (end - start);
}
