/**
 * Window resolution for the Analysis page.
 *
 * THE MODEL, in one sentence:
 *   An analysis window is a whole number of COMPLETE calendar months.
 *   The month in progress is never inside it.
 *
 * Why: Analysis answers "what are my patterns", and a pattern needs complete
 * periods. A part-finished month is a partial numerator over a whole-month
 * divisor - it drags every average down and, worse, makes runway look longer
 * than it is. The previous design let each metric decide for itself whether to
 * include it, which produced a page where adjacent tiles silently covered
 * different spans. One rule, applied everywhere, is the fix.
 *
 * The current month is NOT hidden - it gets its own card at the top of the
 * page, showing spend, income and net on their own. Visible, never mixed in.
 *
 * This is a deliberate departure from the dashboard, which includes the month
 * in progress because it answers a different question: "where am I right now".
 * Both pages say which they are.
 *
 * CLOCK-FREE: `today` is always a parameter, resolved once in the browser.
 * DATE-FREE FILTERING: 'YYYY-MM-DD' sorts lexicographically as it sorts
 * chronologically, so membership is a string comparison - no Date per row,
 * and so no timezone surface.
 */

export type AnalysisWindowKey = '3m' | '6m' | '12m' | 'ytd' | 'all';

export const ANALYSIS_WINDOW_KEYS: readonly AnalysisWindowKey[] = ['3m', '6m', '12m', 'ytd', 'all'];

/** Static and date-free, so it is a valid initial useState value. */
export const DEFAULT_ANALYSIS_WINDOW: AnalysisWindowKey = '12m';

export const ANALYSIS_WINDOW_LABELS: Record<AnalysisWindowKey, string> = {
  '3m': 'Last 3 complete months',
  '6m': 'Last 6 complete months',
  '12m': 'Last 12 complete months',
  ytd: 'This year to date',
  all: 'All time',
};

export function isAnalysisWindowKey(value: unknown): value is AnalysisWindowKey {
  return typeof value === 'string' && (ANALYSIS_WINDOW_KEYS as readonly string[]).includes(value);
}

export interface AnalysisWindow {
  key: AnalysisWindowKey;
  label: string;
  /** First day of the first complete month. */
  startYmd: string;
  /** Last day of the last complete month. Never today. */
  endYmd: string;
  /** Whole calendar months in the window. */
  calendarMonths: number;
  /** 'Aug 2025 - Jul 2026'. Shown once under the period selector. */
  rangeLabel: string;
  /** First day of the month in progress - outside the window, shown separately. */
  currentMonthStartYmd: string;
  /** 'August 2026'. */
  currentMonthLabel: string;
  /** False when no complete month exists yet (a brand-new user in month one). */
  hasCompleteMonth: boolean;
}

interface Parts { y: number; m: number; d: number } // m is 0-based

function parts(ymd: string): Parts {
  return { y: Number(ymd.slice(0, 4)), m: Number(ymd.slice(5, 7)) - 1, d: Number(ymd.slice(8, 10)) };
}

function toYmd(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Day 0 of the following month. Numeric constructor, never string parsing,
 *  so this is local-calendar arithmetic with no UTC round-trip. */
function daysIn(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate();
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/** Shortest unambiguous span: 'Aug 2025 - Jul 2026', 'May-Jul 2026', 'Jul 2026'. */
export function formatMonthRange(startYmd: string, endYmd: string): string {
  if (endYmd < startYmd) return 'no complete months yet';
  const s = parts(startYmd);
  const e = parts(endYmd);
  if (s.y !== e.y) return `${MONTH_ABBR[s.m]} ${s.y} - ${MONTH_ABBR[e.m]} ${e.y}`;
  if (s.m === e.m) return `${MONTH_ABBR[s.m]} ${s.y}`;
  return `${MONTH_ABBR[s.m]}-${MONTH_ABBR[e.m]} ${s.y}`;
}

export function earliestDate(rows: readonly { date: string }[]): string | null {
  let min: string | null = null;
  for (const r of rows) if (min === null || r.date < min) min = r.date;
  return min;
}

export function resolveAnalysisWindow(
  key: AnalysisWindowKey,
  today: string,
  earliestYmd: string | null,
): AnalysisWindow {
  const t = parts(today);

  // The window ALWAYS ends at the last day of the last complete month. The
  // month in progress is never inside it, whatever the key.
  const lastCompleteIdx = t.y * 12 + t.m - 1;
  const ecY = Math.floor(lastCompleteIdx / 12);
  const ecM = ((lastCompleteIdx % 12) + 12) % 12;
  const endYmd = toYmd(ecY, ecM, daysIn(ecY, ecM));

  const e0 = earliestYmd ? parts(earliestYmd) : null;
  const historyStartIdx = e0 ? e0.y * 12 + e0.m : null;

  let startIdx: number;
  if (key === 'ytd') {
    startIdx = t.y * 12;
  } else if (key === 'all') {
    startIdx = historyStartIdx ?? lastCompleteIdx;
  } else {
    // N COMPLETE months back from the last complete one, so "Last 12 complete
    // months" divides by 12 and the label matches the arithmetic.
    const back = key === '3m' ? 3 : key === '6m' ? 6 : 12;
    startIdx = lastCompleteIdx - back + 1;
  }

  // Never reach back past the first month on record - leading empty months
  // would be averaged in as months of zero activity.
  if (historyStartIdx !== null && startIdx < historyStartIdx) startIdx = historyStartIdx;

  const sY = Math.floor(startIdx / 12);
  const sM = ((startIdx % 12) + 12) % 12;
  const startYmd = toYmd(sY, sM, 1);

  const hasCompleteMonth = startIdx <= lastCompleteIdx;
  const calendarMonths = hasCompleteMonth ? lastCompleteIdx - startIdx + 1 : 0;

  return {
    key,
    label: ANALYSIS_WINDOW_LABELS[key],
    startYmd,
    endYmd,
    calendarMonths,
    rangeLabel: hasCompleteMonth ? formatMonthRange(startYmd, endYmd) : 'no complete months yet',
    currentMonthStartYmd: toYmd(t.y, t.m, 1),
    currentMonthLabel: `${MONTH_FULL[t.m]} ${t.y}`,
    hasCompleteMonth,
  };
}

export function isInWindow(w: AnalysisWindow, ymd: string): boolean {
  return ymd >= w.startYmd && ymd <= w.endYmd;
}

export function filterToWindow<T extends { date: string }>(w: AnalysisWindow, rows: readonly T[]): T[] {
  return rows.filter((r) => isInWindow(w, r.date));
}
