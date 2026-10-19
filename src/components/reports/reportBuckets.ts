/**
 * Buckets for the Reports timeline chart: the rows in view, summed per day,
 * week or month across the report's bounds.
 *
 * Pure and clock-free like periodBounds.ts: string dates, `today` passed in.
 * Income counts every income row (Standard Income AND Side Cash), as the
 * Reports totals do - deliberately not buildPeriodTrend, which leaves Side
 * Cash out and uses the Dashboard's windows.
 */
import type { Transaction } from '@/types';
import { addDaysYmd, diffDays, spanDays, toYmd, daysInMonth, type Bounds } from './periodBounds';

export type Granularity = 'day' | 'week' | 'month';

export interface ReportBucket {
  key: string;
  startYmd: string;
  endYmd: string;
  income: number;
  /** Money out, positive. */
  spending: number;
  net: number;
  count: number;
  /** Starts after today: not happened yet, drawn hollow rather than as zero. */
  future: boolean;
  /** Contains today. */
  current: boolean;
}

/** Daily up to about two months, weekly up to about six, monthly beyond. */
export function granularityFor(bounds: Bounds): Granularity {
  const n = spanDays(bounds);
  return n <= 62 ? 'day' : n <= 190 ? 'week' : 'month';
}

export function buildReportBuckets(rows: Transaction[], bounds: Bounds, today: string | null): { granularity: Granularity; buckets: ReportBucket[] } {
  const granularity = granularityFor(bounds);
  const buckets: ReportBucket[] = [];
  const make = (startYmd: string, endYmd: string): ReportBucket => ({
    key: startYmd, startYmd, endYmd, income: 0, spending: 0, net: 0, count: 0,
    future: !!today && startYmd > today,
    current: !!today && startYmd <= today && endYmd >= today,
  });
  const sy = Number(bounds.startYmd.slice(0, 4));
  const sm = Number(bounds.startYmd.slice(5, 7)) - 1;
  const startMonth = sy * 12 + sm;
  if (granularity === 'month') {
    const ey = Number(bounds.endYmd.slice(0, 4));
    const em = Number(bounds.endYmd.slice(5, 7)) - 1;
    for (let i = startMonth; i <= ey * 12 + em; i++) {
      const y = Math.floor(i / 12);
      const m = i % 12;
      const s = toYmd(y, m, 1);
      const e = toYmd(y, m, daysInMonth(y, m));
      buckets.push(make(s < bounds.startYmd ? bounds.startYmd : s, e > bounds.endYmd ? bounds.endYmd : e));
    }
  } else {
    const step = granularity === 'day' ? 1 : 7;
    for (let s = bounds.startYmd; s <= bounds.endYmd; s = addDaysYmd(s, step)) {
      const e = addDaysYmd(s, step - 1);
      buckets.push(make(s, e > bounds.endYmd ? bounds.endYmd : e));
    }
  }
  for (const t of rows) {
    if (t.date < bounds.startYmd || t.date > bounds.endYmd) continue;
    let i: number;
    if (granularity === 'month') {
      i = Number(t.date.slice(0, 4)) * 12 + Number(t.date.slice(5, 7)) - 1 - startMonth;
    } else {
      i = Math.floor(diffDays(bounds.startYmd, t.date) / (granularity === 'day' ? 1 : 7));
    }
    const b = buckets[i];
    if (!b) continue;
    if (t.amount > 0) b.income += t.amount; else b.spending -= t.amount;
    b.count += 1;
  }
  for (const b of buckets) {
    b.income = Math.round(b.income * 100) / 100;
    b.spending = Math.round(b.spending * 100) / 100;
    b.net = Math.round((b.income - b.spending) * 100) / 100;
  }
  return { granularity, buckets };
}
