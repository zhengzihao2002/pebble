/**
 * Like-for-like comparisons for the Dashboard's shared period.
 *
 * Pure: no clock reads (every function takes the caller's zone-aware `today`)
 * and no UI imports, so it is safe anywhere stats.ts is.
 *
 * WHY LIKE-FOR-LIKE. A month in progress compared with a whole month always
 * looks frugal on the 5th and alarming on the 30th - the half-finished-period
 * trap the stats card's tooltips already warn about. So while a period is in
 * progress, BOTH sides are cut at the same point: October 1-16 against
 * September 1-16, Q4 day 16 against Q3 day 16. A finished period compares
 * with the whole previous one.
 *
 * Windows mirror getWindowPredicate() in stats.ts branch for branch (the same
 * modes, the same `+ 1` on the rolling month windows). Keep them in step.
 */
import type { Transaction } from '@/types';
import { INTL_LOCALE, type Locale } from '@/lib/i18n/locale';

/** Inclusive calendar range; both ends at local midnight. */
export interface DateRange {
  start: Date;
  end: Date;
}

const MONTH_MODES: Record<string, number> = { month: 1, quarter: 3, year: 12 };

export function ymdOf(dt: Date): string {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function addDays(dt: Date, n: number): Date {
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + n);
}

/** Same day-of-month n months away, clamped to that month's last day. */
function addMonthsClamped(dt: Date, n: number): Date {
  const first = new Date(dt.getFullYear(), dt.getMonth() + n, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return new Date(first.getFullYear(), first.getMonth(), Math.min(dt.getDate(), last));
}

function endOfMonth(dt: Date): Date {
  return new Date(dt.getFullYear(), dt.getMonth() + 1, 0);
}

/** Days in a range, counting both ends. */
export function rangeDays(r: DateRange): number {
  return Math.round(
    (Date.UTC(r.end.getFullYear(), r.end.getMonth(), r.end.getDate()) - Date.UTC(r.start.getFullYear(), r.start.getMonth(), r.start.getDate())) / 86_400_000,
  ) + 1;
}

function midnight(dt: Date): Date {
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

/**
 * The whole window a mode + period covers. Rolling windows end today; a
 * month, quarter or year runs to its last day even while it is in progress.
 */
export function windowBounds(mode: string, periodKey: string | null, today: Date): DateRange {
  const now = midnight(today);
  if (mode === '30d' || mode === '90d') {
    const days = mode === '30d' ? 30 : 90;
    return { start: addDays(now, -days + 1), end: now };
  }
  if (mode === 'last6' || mode === 'last12') {
    const back = mode === 'last6' ? 6 : 12;
    return { start: new Date(now.getFullYear(), now.getMonth() - back + 1, 1), end: now };
  }
  if (mode === 'month') {
    const [y, m] = periodKey ? periodKey.split('-').map(Number) : [now.getFullYear(), now.getMonth()];
    const start = new Date(y, m, 1);
    return { start, end: endOfMonth(start) };
  }
  if (mode === 'quarter') {
    let y = now.getFullYear();
    let q = Math.floor(now.getMonth() / 3) + 1;
    if (periodKey) {
      const [py, pq] = periodKey.split('-Q');
      y = Number(py);
      q = Number(pq);
    }
    const start = new Date(y, (q - 1) * 3, 1);
    return { start, end: new Date(y, q * 3, 0) };
  }
  const y = periodKey ? Number(periodKey) : now.getFullYear();
  return { start: new Date(y, 0, 1), end: new Date(y, 11, 31) };
}

/**
 * The window `k` periods back (k = 0 is the selected one).
 *
 * `likeForLike`: cut every window at the point the current one has reached
 * today. Rolling windows already end today, so for them it changes nothing.
 *
 * Rolling MONTH windows (last 6 / last 12) step back a whole YEAR: their
 * first month is whole and their last is partial, so the window directly
 * before them would either overlap or be a different shape. The same months
 * a year earlier are exactly like-for-like, and the label says which dates
 * they are.
 */
export function shiftedWindow(mode: string, periodKey: string | null, today: Date, k: number, likeForLike: boolean): DateRange {
  const base = windowBounds(mode, periodKey, today);
  if (mode === '30d' || mode === '90d') {
    const days = mode === '30d' ? 30 : 90;
    return { start: addDays(base.start, -days * k), end: addDays(base.end, -days * k) };
  }
  if (mode === 'last6' || mode === 'last12') {
    return { start: addMonthsClamped(base.start, -12 * k), end: addMonthsClamped(base.end, -12 * k) };
  }
  const unit = MONTH_MODES[mode] ?? 12;
  const start = new Date(base.start.getFullYear(), base.start.getMonth() - unit * k, 1);
  const fullEnd = new Date(start.getFullYear(), start.getMonth() + unit, 0);
  const now = midnight(today);
  const inProgress = now >= base.start && now <= base.end;
  if (!likeForLike || !inProgress) return { start, end: fullEnd };
  const elapsed = rangeDays({ start: base.start, end: now });
  const cut = addDays(start, elapsed - 1);
  return { start, end: cut < fullEnd ? cut : fullEnd };
}

export interface RangeStats {
  income: number;
  spending: number;
  saved: number;
  savingsRate: number;
}

/**
 * The stats card's figures over an explicit range, with the SAME rules as
 * computeStatsForPeriod(): income excludes Side Cash, spending is every
 * negative amount, and the rate is floored to 2 decimals (never rounded up).
 */
export function statsInRange(transactions: readonly Transaction[], range: DateRange): RangeStats {
  const from = ymdOf(range.start);
  const to = ymdOf(range.end);
  let income = 0;
  let spending = 0;
  for (const t of transactions) {
    if (t.date < from || t.date > to) continue;
    if (t.amount > 0) {
      if (!(t.type === 'income' && t.category === 'Side Cash')) income += t.amount;
    } else {
      spending += Math.abs(t.amount);
    }
  }
  const savingsRate = income > 0 ? Math.floor(((income - spending) / income) * 10000) / 100 : 0;
  return { income, spending, saved: income - spending, savingsRate };
}

/** Spending per stored category name over a range (positive magnitudes). */
export function spendingByCategoryInRange(transactions: readonly Transaction[], range: DateRange): Record<string, number> {
  const from = ymdOf(range.start);
  const to = ymdOf(range.end);
  const out: Record<string, number> = {};
  for (const t of transactions) {
    if (t.amount >= 0 || t.date < from || t.date > to) continue;
    out[t.category] = (out[t.category] || 0) + Math.abs(t.amount);
  }
  return out;
}

/** Earliest record date, or null with no records. Used to drop windows before any history. */
export function earliestDate(transactions: readonly Transaction[]): string | null {
  let min: string | null = null;
  for (const t of transactions) if (min === null || t.date < min) min = t.date;
  return min;
}

/**
 * True when recorded history covers the whole window, so it can stand as a
 * comparison. A window that history only partly covers (records begin halfway
 * through last year) would set a full current period against a mostly empty
 * one and report a large false increase. The window must therefore START on
 * or after the first record's month: someone who began recording on the 12th
 * still gets "vs last month", since that first month is the best there is.
 */
export function coversHistory(r: DateRange, first: string | null): boolean {
  return first !== null && ymdOf(r.start) >= `${first.slice(0, 8)}01`;
}

/**
 * A window in words, for comparison labels. A whole month, quarter or year is
 * named ("September 2026", "Q3 2026", "2025"); anything else is a date range.
 * The year is added only when it differs from `today`'s or the range spans two.
 */
export function describeRange(r: DateRange, locale: Locale, today: Date): string {
  const zh = locale === 'zh';
  const sy = r.start.getFullYear();
  const ey = r.end.getFullYear();
  const startsMonth = r.start.getDate() === 1;
  const endsMonth = r.end.getDate() === endOfMonth(r.end).getDate();
  if (startsMonth && endsMonth && sy === ey) {
    const months = (r.end.getMonth() - r.start.getMonth()) + 1;
    if (months === 1) {
      return zh ? `${sy}年${r.start.getMonth() + 1}月` : r.start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    if (months === 3 && r.start.getMonth() % 3 === 0) {
      const q = r.start.getMonth() / 3 + 1;
      return zh ? `${sy}年第${q}季度` : `Q${q} ${sy}`;
    }
    if (months === 12) return String(sy);
  }
  const withYear = sy !== ey || sy !== today.getFullYear();
  if (zh) {
    const left = `${withYear ? `${sy}年` : ''}${r.start.getMonth() + 1}月${r.start.getDate()}日`;
    const sameMonth = sy === ey && r.start.getMonth() === r.end.getMonth();
    const right = sameMonth ? `${r.end.getDate()}日` : `${sy !== ey ? `${ey}年` : ''}${r.end.getMonth() + 1}月${r.end.getDate()}日`;
    return `${left}至${right}`;
  }
  const fmt = (dt: Date, opts: Intl.DateTimeFormatOptions) => dt.toLocaleDateString(INTL_LOCALE.en, opts);
  if (sy === ey && r.start.getMonth() === r.end.getMonth()) {
    return `${fmt(r.start, { month: 'short', day: 'numeric' })} – ${r.end.getDate()}${withYear ? `, ${ey}` : ''}`;
  }
  if (sy === ey) {
    return `${fmt(r.start, { month: 'short', day: 'numeric' })} – ${fmt(r.end, { month: 'short', day: 'numeric' })}${withYear ? `, ${ey}` : ''}`;
  }
  return `${fmt(r.start, { month: 'short', day: 'numeric', year: 'numeric' })} – ${fmt(r.end, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

export interface PeriodComparison {
  current: RangeStats;
  /** Null when recorded history does not cover the previous window (coversHistory). */
  previous: RangeStats | null;
  previousRange: DateRange;
  /** Up to 6 windows, oldest first, ending with the current one; windows history does not cover are dropped. */
  series: RangeStats[];
}

/** Everything the stats tiles need for their change chips and sparklines. */
export function comparePeriods(transactions: readonly Transaction[], mode: string, periodKey: string | null, today: Date, count = 6): PeriodComparison {
  const first = earliestDate(transactions);
  const windows = Array.from({ length: count }, (_, k) => shiftedWindow(mode, periodKey, today, k, true));
  const hasHistory = (r: DateRange) => coversHistory(r, first);
  const series = windows
    .filter((r, k) => k === 0 || hasHistory(r))
    .map((r) => statsInRange(transactions, r))
    .reverse();
  const previousRange = windows[1];
  return {
    current: statsInRange(transactions, windows[0]),
    previous: hasHistory(previousRange) ? statsInRange(transactions, previousRange) : null,
    previousRange,
    series,
  };
}
