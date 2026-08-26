/**
 * Window resolution for the Analysis page.
 *
 * CLOCK-FREE BY CONSTRUCTION. `today` is always a parameter and is never read
 * here - not via getToday(), not via new Date(). The page resolves it once, in
 * the browser, from the browser's own IANA zone, and threads it down. That is
 * stronger than snapshotting the clock per call as getWindowPredicate() does:
 * a whole render pass shares one value, so nothing can straddle midnight.
 *
 * DATE-FREE IN THE FILTER PATH. 'YYYY-MM-DD' sorts lexicographically exactly as
 * it sorts chronologically, so window membership is a string comparison. No
 * Date is constructed per row, so there is no timezone surface to get wrong.
 *
 * NOT getWindowPredicate(). That helper returns a bare predicate with no
 * bounds, and every rate on this page needs the window's LENGTH as a
 * denominator. It also leaves its month-based windows open at the top end;
 * these are closed at `today`, because a numerator that includes future-dated
 * rows against a denominator of months elapsed is simply wrong arithmetic.
 */

export type AnalysisWindowKey = '3m' | '6m' | '12m' | 'ytd' | 'all';

export const ANALYSIS_WINDOW_KEYS: readonly AnalysisWindowKey[] = ['3m', '6m', '12m', 'ytd', 'all'];

/**
 * 12 months is the shortest window containing a full seasonal cycle, so the
 * category breakdown does not swing on which month the page is opened in.
 * Static and date-free - it is a valid initial useState value.
 */
export const DEFAULT_ANALYSIS_WINDOW: AnalysisWindowKey = '12m';

export const ANALYSIS_WINDOW_LABELS: Record<AnalysisWindowKey, string> = {
  '3m': 'Last 3 months',
  '6m': 'Last 6 months',
  '12m': 'Last 12 months',
  ytd: 'This year to date',
  all: 'All time',
};

/** Guards restored preferences: localStorage can hold anything, including a
 *  key written by an older or newer build of this page. */
export function isAnalysisWindowKey(value: unknown): value is AnalysisWindowKey {
  return typeof value === 'string' && (ANALYSIS_WINDOW_KEYS as readonly string[]).includes(value);
}

export interface AnalysisWindow {
  key: AnalysisWindowKey;
  /** Short name of the window itself, e.g. 'Last 12 months'. */
  label: string;
  /** Resolved bounds, e.g. 'Sep 1, 2025 - Aug 25, 2026'. Render in .font-mono-tab. */
  rangeLabel: string;
  startYmd: string;
  endYmd: string;
  /**
   * Elapsed span in months, fractional. INFORMATIONAL ONLY - do not use as a
   * denominator. Rate metrics divide by completeMonths instead.
   *
   * Historical note on the original, fractional. The current month counts in proportion to the
   * days elapsed. Rounding the partial month up to a whole one would inflate
   * this denominator, understate average monthly spend, and so OVERSTATE
   * runway - an error in the one direction that matters.
   */
  months: number;
  /**
   * False when the window is shorter than one month, which only happens for
   * 'ytd' in early January or 'all' with a very short history. Rate metrics
   * should show their empty state rather than divide by a fraction and print a
   * number an order of magnitude too large.
   */
  hasFullMonth: boolean;
  /**
   * Whole calendar months in the window, excluding the current one while it is
   * still in progress. THIS is the denominator for every rate metric.
   *
   * Spending is lumpy - rent and subscriptions cluster at month boundaries -
   * so a fractional run rate over a part-finished month swings on which day
   * you happen to look. Whole months only is stable and is what "average
   * monthly spend" means to a reader.
   */
  completeMonths: number;
  /** First day of the in-progress month, or null when today ends a month. */
  partialStartYmd: string | null;
  /** Last day covered by completeMonths. */
  completeEndYmd: string;
  /**
   * True when the window was cut short because it reached back further than
   * your recorded history. The requested label ('Last 12 months') then does
   * not describe the denominator, so the UI must say so.
   */
  limitedByHistory: boolean;
}

interface Parts { y: number; m: number; d: number } // m is 0-based

function parts(ymd: string): Parts {
  return { y: Number(ymd.slice(0, 4)), m: Number(ymd.slice(5, 7)) - 1, d: Number(ymd.slice(8, 10)) };
}

function toYmd(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Day-0 of the following month. Numeric constructor, never string parsing, so
 *  this is local-calendar arithmetic with no UTC round-trip.
 *  TODO: occurrences.ts exports a daysInMonth(); swap to it once its month base
 *  (0- or 1-indexed) is confirmed. Guessing wrong here would silently corrupt
 *  every denominator on the page, so it is reimplemented in one line instead. */
function daysIn(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate();
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Local rather than MONTH_NAMES from @/data/seed: this needs abbreviations, and
// that export's exact contents are unverified. Reconcile if they match.

export function formatYmdShort(ymd: string): string {
  const p = parts(ymd);
  return `${MONTH_ABBR[p.m]} ${p.d}, ${p.y}`;
}

/** Earliest date across rows, for the 'all' window's start. Null when empty. */
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
  const endYmd = today;

  // START OF HISTORY, rounded down to the 1st of that month.
  //
  // Spending is month-granular: a transaction on Jul 15 does not mean your
  // July began on the 15th, it means July had activity. Rounding down treats
  // that first month as a whole month of observation, which it is.
  const e0 = earliestYmd ? parts(earliestYmd) : null;
  const historyStart = e0 ? toYmd(e0.y, e0.m, 1) : null;

  let startYmd: string;
  if (key === 'ytd') {
    startYmd = toYmd(t.y, 0, 1);
  } else if (key === 'all') {
    startYmd = historyStart ?? toYmd(t.y, t.m, 1);
  } else {
    // 3m spans this month plus the two before it, so the start is the 1st of
    // (n - 1) months back. 6m and 12m resolve to the same first-of-month
    // cutoff as the dashboard's 'last6' / 'last12', so the two pages agree.
    const back = key === '3m' ? 2 : key === '6m' ? 5 : 11;
    const total = t.y * 12 + t.m - back;
    startYmd = toYmd(Math.floor(total / 12), total % 12, 1);
  }

  // CLAMP TO THE START OF HISTORY. Without this, a 12-month window over two
  // months of records divides by 11.8 instead of 1.8 - it counts ten months
  // you were not recording as ten months of zero spending. Average spend then
  // comes out ~6x low, and runway (balance / average spend) ~6x HIGH. An error
  // that overstates how long your money lasts is the one that must not ship.
  //
  // This changes no totals: firstOfMonth(earliest) <= earliest, so every
  // transaction that was in the window is still in it. Denominators only.
  let clamped = false;
  if (historyStart && historyStart > startYmd) {
    startYmd = historyStart;
    clamped = true;
  }

  // Only reachable when every transaction is future-dated. Collapse rather
  // than invert, so months lands at 0 and rate metrics show their empty state.
  if (startYmd > endYmd) startYmd = endYmd;

  const s = parts(startYmd);
  const e = parts(endYmd);
  const months =
    (e.y - s.y) * 12 +
    (e.m - s.m) +
    e.d / daysIn(e.y, e.m) -
    (s.d - 1) / daysIn(s.y, s.m);

  // The current calendar month is complete only if today is its last day.
  const isMonthEnd = e.d === daysIn(e.y, e.m);
  const prevIdx = e.y * 12 + e.m - 1;
  const pY = Math.floor(prevIdx / 12);
  const pM = prevIdx % 12;
  const partialStartYmd = isMonthEnd ? null : toYmd(e.y, e.m, 1);
  const completeEndYmd = isMonthEnd ? endYmd : toYmd(pY, pM, daysIn(pY, pM));

  // Every window start is a 1st-of-month, so this is a plain month-index
  // difference. Floors at 0 when the window holds no complete month at all.
  const ce = parts(completeEndYmd);
  const completeMonths =
    completeEndYmd >= startYmd ? (ce.y * 12 + ce.m) - (s.y * 12 + s.m) + 1 : 0;

  return {
    key,
    label: ANALYSIS_WINDOW_LABELS[key],
    rangeLabel: `${formatYmdShort(startYmd)} - ${formatYmdShort(endYmd)}`,
    startYmd,
    endYmd,
    months,
    hasFullMonth: completeMonths >= 1,
    completeMonths,
    partialStartYmd,
    completeEndYmd,
    limitedByHistory: clamped,
  };
}

export function isInWindow(w: AnalysisWindow, ymd: string): boolean {
  return ymd >= w.startYmd && ymd <= w.endYmd;
}

export function filterToWindow<T extends { date: string }>(w: AnalysisWindow, rows: readonly T[]): T[] {
  return rows.filter((r) => isInWindow(w, r.date));
}
