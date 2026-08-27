/**
 * The month in progress, on its own.
 *
 * The analysis window holds only COMPLETE months, so the current month is
 * never inside any metric on the page. That makes every average honest, but it
 * would also hide the month you are actually living in - so it gets its own
 * card at the top.
 *
 * Clock-free: `today` is a parameter.
 *
 * SIDE CASH EXCLUDED from income here, matching every other income figure on
 * the page. Balance adjustments cannot reach here - not in the Transaction
 * union, and the page never receives them.
 */

import { isSideCash } from '@/lib/stats';
import type { Transaction } from '@/types';
import { isExpense } from './spending';

export interface CurrentMonthSummary {
  label: string;          // 'August 2026'
  spending: number;       // positive magnitude
  income: number;         // net, Side Cash excluded
  net: number;
  expenseCount: number;
  /** How far through the month today is, 0..1. Context for the figures. */
  progress: number;
  dayOfMonth: number;
  daysInMonth: number;
}

export function computeCurrentMonth(
  transactions: readonly Transaction[],
  today: string,
  startYmd: string,
  label: string,
): CurrentMonthSummary {
  let spending = 0;
  let income = 0;
  let expenseCount = 0;

  for (const t of transactions) {
    // Bounded at today: a future-dated row in this month has not happened yet
    // and must not appear as money already spent.
    if (t.date < startYmd || t.date > today) continue;
    if (isExpense(t)) {
      spending += Math.abs(t.amount);
      expenseCount++;
    } else if (!isSideCash(t)) {
      income += t.amount;
    }
  }

  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const dayOfMonth = Number(today.slice(8, 10));
  const daysInMonth = new Date(y, m, 0).getDate();

  return {
    label,
    spending,
    income,
    net: income - spending,
    expenseCount,
    progress: dayOfMonth / daysInMonth,
    dayOfMonth,
    daysInMonth,
  };
}
