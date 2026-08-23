/**
 * Pure occurrence arithmetic for recurring rules.
 *
 * Deliberately dependency-free. All dates are 'YYYY-MM-DD' strings and all
 * arithmetic happens in UTC integer space via Date.UTC(), so no local-timezone
 * or DST shift can ever perturb a result. Do NOT introduce `new Date(ymdString)`
 * here — it parses as UTC midnight and then reads back through local getters.
 */

/** Safety valve: most occurrences one rule may materialize in a single run. */
export const MAX_OCCURRENCES_PER_RUN = 250;

/** Hard loop bound. Weekly for ~380 years; only reachable via corrupt data. */
const MAX_INDEX = 20_000;

/** A calendar date, 'YYYY-MM-DD'. */
export type Ymd = string;

export type Frequency = 'once' | 'weekly' | 'biweekly' | 'monthly' | 'yearly';
export type EndMode = 'never' | 'after' | 'on';

/** Minimal shape needed to generate dates — decoupled from the DB row type. */
export interface RecurrenceSpec {
  frequency: Frequency;
  startDate: Ymd;
  endMode: EndMode;
  endCount: number | null;
  endDate: Ymd | null;
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

interface YmdParts {
  year: number;
  /** 1-12 */
  month: number;
  day: number;
}

export function isYmd(value: string): value is Ymd {
  return YMD_RE.test(value);
}

function parseYmd(value: Ymd): YmdParts {
  if (!YMD_RE.test(value)) {
    throw new Error(`Expected YYYY-MM-DD, received: ${value}`);
  }
  return {
    year: Number(value.slice(0, 4)),
    month: Number(value.slice(5, 7)),
    day: Number(value.slice(8, 10)),
  };
}

function formatYmd(parts: YmdParts): Ymd {
  const y = String(parts.year).padStart(4, '0');
  const m = String(parts.month).padStart(2, '0');
  const d = String(parts.day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Zero-padded fixed width means lexicographic order is chronological order. */
export function compareYmd(a: Ymd, b: Ymd): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addDays(value: Ymd, days: number): Ymd {
  const { year, month, day } = parseYmd(value);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return formatYmd({
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  });
}

/**
 * Add months, clamping the day to the target month's length.
 *
 * Always measured from the ORIGINAL anchor, never from the previous
 * occurrence — so a 31st rule gives Jan 31, Feb 28, Mar 31, and does not
 * drift down to the 28th permanently.
 */
export function addMonthsClamped(anchor: Ymd, months: number): Ymd {
  const { year, month, day } = parseYmd(anchor);
  const total = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(total / 12);
  const targetMonth = (((total % 12) + 12) % 12) + 1;
  return formatYmd({
    year: targetYear,
    month: targetMonth,
    day: Math.min(day, daysInMonth(targetYear, targetMonth)),
  });
}

/**
 * Today, in an explicitly supplied zone.
 *
 * The zone is a REQUIRED PARAMETER, deliberately. A module-level constant here
 * would be an assumption about where the user lives that no caller could see -
 * which is exactly the bug this replaces. A function that cannot assume a zone
 * cannot silently be wrong about one.
 *
 * On the server the zone comes from resolveUserTimeZone() (the browser's own,
 * via cookie); in the browser from resolveBrowserTimeZone(). Never from
 * new Date(), which is the container's zone - UTC on Vercel.
 *
 * 'en-CA' formats as YYYY-MM-DD, and Intl handles DST transitions.
 */
export function todayInZone(timeZone: string, now: Date = new Date()): Ymd {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * The date of occurrence `index` (0-based), ignoring end conditions.
 * Returns null when the frequency cannot produce that index.
 */
export function occurrenceAt(spec: RecurrenceSpec, index: number): Ymd | null {
  switch (spec.frequency) {
    case 'once':
      return index === 0 ? spec.startDate : null;
    case 'weekly':
      return addDays(spec.startDate, index * 7);
    case 'biweekly':
      return addDays(spec.startDate, index * 14);
    case 'monthly':
      return addMonthsClamped(spec.startDate, index);
    case 'yearly':
      return addMonthsClamped(spec.startDate, index * 12);
  }
}

export interface OccurrenceWindow {
  /** Exclusive lower bound — the rule's materialized_through. Null = from start. */
  after: Ymd | null;
  /** Inclusive upper bound — "today" for catch-up, a future date for previews. */
  through: Ymd;
  /** Cap on returned dates. Defaults to MAX_OCCURRENCES_PER_RUN. */
  limit?: number;
}

/**
 * Dates due in (window.after, window.through], honouring the end condition.
 *
 * Iterates from index 0 so that `endMode: 'after'` is enforced by generation
 * index rather than by counting existing rows — deleting a materialized
 * transaction can therefore never cause an extra one at the far end.
 *
 * Truncating at `limit` is safe: the caller advances materialized_through to
 * the last date returned, so the next run resumes exactly where this stopped.
 */
export function generateOccurrences(
  spec: RecurrenceSpec,
  window: OccurrenceWindow,
): Ymd[] {
  const limit = window.limit ?? MAX_OCCURRENCES_PER_RUN;
  const maxIndex =
    spec.endMode === 'after' && spec.endCount !== null
      ? Math.min(spec.endCount, MAX_INDEX)
      : MAX_INDEX;

  const due: Ymd[] = [];

  for (let index = 0; index < maxIndex; index++) {
    const date = occurrenceAt(spec, index);
    if (date === null) break;

    if (spec.endMode === 'on' && spec.endDate !== null && date > spec.endDate) break;
    if (date > window.through) break;

    if (window.after !== null && date <= window.after) continue;

    due.push(date);
    if (due.length >= limit) break;
  }

  return due;
}

/**
 * True when the rule can never fire again — used to retire it to 'ended'
 * so catch-up stops reconsidering it on every page load.
 */
export function isExhausted(spec: RecurrenceSpec, materializedThrough: Ymd | null): boolean {
  if (spec.endMode === 'never') return false;

  const lastIndex =
    spec.endMode === 'after' && spec.endCount !== null ? spec.endCount - 1 : null;

  if (lastIndex !== null) {
    const last = occurrenceAt(spec, lastIndex);
    return last !== null && materializedThrough !== null && materializedThrough >= last;
  }

  if (spec.endMode === 'on' && spec.endDate !== null) {
    return materializedThrough !== null && materializedThrough >= spec.endDate;
  }

  return false;
}
