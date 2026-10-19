/**
 * Date bounds for the report in view, the comparable earlier window, and the
 * period stepper's next/previous targets.
 *
 * Same rules as rollingWindow.ts and customRange.ts: CLOCK-FREE (`today` is
 * always passed in, resolved zone-aware by ReportsClient) and STRING-DATE
 * ARITHMETIC on 'YYYY-MM-DD'. Day arithmetic goes through Date.UTC so no
 * local timezone or daylight-saving shift can move a date.
 *
 * Nothing here filters the report itself - ReportsClient's applyPeriod stays
 * the ONE period predicate. These bounds only drive the new summary pieces
 * (comparison, timeline chart, daily average) and the stepper, which writes
 * the same English MONTH_NAMES / QUARTER_NAMES values the selects write.
 */
import { MONTH_NAMES, QUARTER_NAMES } from '@/data/seed';
import type { PeriodGroup } from './types';
import type { RollingWindow } from './rollingWindow';
import type { CustomRange } from './customRange';
import { isCustomRangeInverted } from './customRange';

export interface Bounds {
  /** Inclusive. */
  startYmd: string;
  /** Inclusive. */
  endYmd: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
export function toYmd(y: number, m0: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${pad(m0 + 1)}-${pad(d)}`;
}
export function daysInMonth(y: number, m0: number): number {
  return new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
}
function utc(ymd: string): number {
  return Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)));
}
/** ymd plus n days (n may be negative). */
export function addDaysYmd(ymd: string, n: number): string {
  const d = new Date(utc(ymd) + n * 86_400_000);
  return toYmd(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
/** Whole days from a to b (b - a). */
export function diffDays(a: string, b: string): number {
  return Math.round((utc(b) - utc(a)) / 86_400_000);
}
/** Inclusive length of a span in days. */
export function spanDays(b: Bounds): number {
  return diffDays(b.startYmd, b.endYmd) + 1;
}

function monthBounds(y: number, m0: number): Bounds {
  return { startYmd: toYmd(y, m0, 1), endYmd: toYmd(y, m0, daysInMonth(y, m0)) };
}
function quarterBounds(y: number, q0: number): Bounds {
  return { startYmd: toYmd(y, q0 * 3, 1), endYmd: toYmd(y, q0 * 3 + 2, daysInMonth(y, q0 * 3 + 2)) };
}

export interface BoundsInput {
  periodGroup: PeriodGroup;
  /** effectiveSubPeriod: a MONTH_NAMES / QUARTER_NAMES value or a year. */
  subPeriod: string;
  /** effectiveSubYear: a year or 'All'. */
  subYear: string;
  rollingWindow: RollingWindow | null;
  customRange: CustomRange;
  today: string | null;
  /** Earliest and latest dates of the rows in view, for open ends and All time. */
  dataRange: Bounds | null;
}

/**
 * The calendar span the report covers, or null where there is none: Month or
 * Quarter across All years (several disjoint spans), an inverted custom range,
 * or an open range / All time with no rows to anchor it.
 */
export function resolvePeriodBounds(i: BoundsInput): Bounds | null {
  const y = Number(i.subYear);
  switch (i.periodGroup) {
    case 'month': {
      const m = MONTH_NAMES.indexOf(i.subPeriod);
      return m >= 0 && i.subYear !== 'All' && Number.isFinite(y) ? monthBounds(y, m) : null;
    }
    case 'quarter': {
      const q = QUARTER_NAMES.indexOf(i.subPeriod);
      return q >= 0 && i.subYear !== 'All' && Number.isFinite(y) ? quarterBounds(y, q) : null;
    }
    case 'year': {
      const yy = Number(i.subPeriod);
      return /^\d{4}$/.test(i.subPeriod) ? { startYmd: toYmd(yy, 0, 1), endYmd: toYmd(yy, 11, 31) } : null;
    }
    case 'last3': case 'last6': case 'last12':
      return i.rollingWindow ? { startYmd: i.rollingWindow.startYmd, endYmd: i.rollingWindow.endYmd } : null;
    case 'custom': {
      if (isCustomRangeInverted(i.customRange)) return null;
      const s = i.customRange.startYmd || i.dataRange?.startYmd;
      const e = i.customRange.endYmd || (i.dataRange ? (i.today && i.today > i.dataRange.endYmd ? i.today : i.dataRange.endYmd) : undefined);
      return s && e && s <= e ? { startYmd: s, endYmd: e } : null;
    }
    case 'all': {
      if (!i.dataRange) return null;
      const e = i.today && i.today > i.dataRange.endYmd ? i.today : i.dataRange.endYmd;
      return { startYmd: i.dataRange.startYmd, endYmd: e };
    }
  }
}

export type PrevKind = 'month' | 'quarter' | 'year' | 'months' | 'days';
export interface PreviousWindow {
  bounds: Bounds;
  /** The current window it is compared with (cut to today when in progress). */
  current: Bounds;
  kind: PrevKind;
  /** For 'months' / 'days'. */
  count: number;
  /** True when both windows were cut to the same number of days to date. */
  toDate: boolean;
}

/**
 * The comparable earlier window: the month, quarter or year before; the N
 * months before a rolling window; the same number of days before a custom
 * range with both ends set. None for All time or across All years.
 *
 * A window still in progress (it reaches past today) is compared to date: the
 * current window is cut at today and the earlier one at the same day count,
 * so a half-finished month is never set against a whole one.
 */
export function previousWindow(periodGroup: PeriodGroup, bounds: Bounds | null, custom: CustomRange, today: string | null): PreviousWindow | null {
  if (!bounds) return null;
  let prev: Bounds;
  let kind: PrevKind;
  let count = 0;
  const sy = Number(bounds.startYmd.slice(0, 4));
  const sm = Number(bounds.startYmd.slice(5, 7)) - 1;
  if (periodGroup === 'month') {
    const idx = sy * 12 + sm - 1;
    prev = monthBounds(Math.floor(idx / 12), idx % 12);
    kind = 'month';
  } else if (periodGroup === 'quarter') {
    const idx = sy * 4 + Math.floor(sm / 3) - 1;
    prev = quarterBounds(Math.floor(idx / 4), idx % 4);
    kind = 'quarter';
  } else if (periodGroup === 'year') {
    prev = { startYmd: toYmd(sy - 1, 0, 1), endYmd: toYmd(sy - 1, 11, 31) };
    kind = 'year';
  } else if (periodGroup === 'last3' || periodGroup === 'last6' || periodGroup === 'last12') {
    count = periodGroup === 'last3' ? 3 : periodGroup === 'last6' ? 6 : 12;
    const idx = sy * 12 + sm - count;
    const endIdx = sy * 12 + sm - 1;
    const ey = Math.floor(endIdx / 12);
    const em = ((endIdx % 12) + 12) % 12;
    prev = { startYmd: toYmd(Math.floor(idx / 12), ((idx % 12) + 12) % 12, 1), endYmd: toYmd(ey, em, daysInMonth(ey, em)) };
    kind = 'months';
  } else if (periodGroup === 'custom' && custom.startYmd && custom.endYmd) {
    count = spanDays(bounds);
    prev = { startYmd: addDaysYmd(bounds.startYmd, -count), endYmd: addDaysYmd(bounds.startYmd, -1) };
    kind = 'days';
  } else {
    return null;
  }
  let current = bounds;
  let toDate = false;
  if (today && bounds.startYmd <= today && bounds.endYmd > today) {
    const elapsed = diffDays(bounds.startYmd, today);
    current = { startYmd: bounds.startYmd, endYmd: today };
    const cut = addDaysYmd(prev.startYmd, elapsed);
    prev = { startYmd: prev.startYmd, endYmd: cut < prev.endYmd ? cut : prev.endYmd };
    toDate = true;
  }
  return { bounds: prev, current, kind, count, toDate };
}

export interface StepTarget {
  subPeriod: string;
  subYear: string;
}

/**
 * The month, quarter or year one step older (-1) or newer (+1), or null at
 * either end. Reachable periods are those in the years that have rows of the
 * current types (yearOptions) and not after the current period - so a step
 * never lands on a year the year filter would silently replace. With All
 * years, the first step resolves a concrete year: the current year if it has
 * rows, else the newest.
 */
export function stepPeriod(
  periodGroup: PeriodGroup, subPeriod: string, subYear: string, yearOptions: string[], today: string | null, dir: 1 | -1,
): StepTarget | null {
  if (!today) return null;
  const cy = Number(today.slice(0, 4));
  const cm = Number(today.slice(5, 7)) - 1;
  const years = yearOptions.map(Number).filter((y) => Number.isFinite(y)).sort((a, b) => a - b);
  if (periodGroup === 'year') {
    const list = years.filter((y) => y <= cy);
    const cur = Number(subPeriod);
    const next = dir === 1 ? list.find((y) => y > cur) : [...list].reverse().find((y) => y < cur);
    return next === undefined ? null : { subPeriod: String(next), subYear };
  }
  if (periodGroup !== 'month' && periodGroup !== 'quarter') return null;
  const names = periodGroup === 'month' ? MONTH_NAMES : QUARTER_NAMES;
  const per = names.length;
  const nowIdx = periodGroup === 'month' ? cm : Math.floor(cm / 3);
  const idx = names.indexOf(subPeriod);
  if (idx < 0) return null;
  const year = subYear === 'All' ? (years.includes(cy) ? cy : years[years.length - 1]) : Number(subYear);
  if (!Number.isFinite(year)) return null;
  const at = year * per + idx;
  const reachable: number[] = [];
  for (const y of years) {
    for (let i = 0; i < per; i++) {
      if (y < cy || (y === cy && i <= nowIdx)) reachable.push(y * per + i);
    }
  }
  const next = dir === 1 ? reachable.find((v) => v > at) : [...reachable].reverse().find((v) => v < at);
  if (next === undefined) return null;
  return { subPeriod: names[next % per], subYear: String(Math.floor(next / per)) };
}

/**
 * A custom range with both ends set, moved by its own length. Null when the
 * range is open or inverted, when the newer step would start after today, or
 * when the older step would end before the earliest row.
 */
export function shiftCustomRange(r: CustomRange, dir: 1 | -1, today: string | null, earliestYmd: string | null): CustomRange | null {
  if (!r.startYmd || !r.endYmd || isCustomRangeInverted(r)) return null;
  const len = diffDays(r.startYmd, r.endYmd) + 1;
  const next = { startYmd: addDaysYmd(r.startYmd, dir * len), endYmd: addDaysYmd(r.endYmd, dir * len) };
  if (dir === 1 && today && next.startYmd > today) return null;
  if (dir === -1 && earliestYmd && next.endYmd < earliestYmd) return null;
  return next;
}
