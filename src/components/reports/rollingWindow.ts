/**
 * Rolling-window date bounds for Reports' "Last N months" filter.
 *
 * Deliberately separate from src/lib/analysis/windows.ts despite the
 * surface similarity - the two answer different questions. Analysis
 * excludes the month in progress: a pattern needs complete periods. Reports
 * is a transaction LIST, where a person expects today's spending to already
 * be there. Sharing code between them risks either page's semantics leaking
 * into the other the next time one changes; each stays self-contained.
 *
 * CLOCK-FREE: `today` is always a parameter, resolved once by the caller
 * (client-side, timezone-aware - see ReportsClient).
 *
 * STRING-DATE ARITHMETIC: 'YYYY-MM-DD' sorts lexicographically exactly as it
 * sorts chronologically, so bounds are strings and membership is a plain
 * string comparison - no Date object, no per-row timezone surface. Matches
 * how src/lib/analysis/windows.ts is built.
 *
 * DEFINITION - matches the Dashboard's existing last6/last12 in stats.ts, for
 * one consistent meaning of "last N months" wherever it appears: N whole
 * calendar months, ending with the one in progress. "Last 3 months" on
 * 2026-11-12 is 2026-09-01 through 2026-11-12 - September and October
 * complete, November partial and INCLUDED, because Reports lists what
 * happened and today's spending belongs in it. (Analysis's "last N COMPLETE
 * months" deliberately excludes the current month; that is a different
 * question and this file does not answer it.)
 */

export type RollingWindowKey = 'last3' | 'last6' | 'last12';

export const ROLLING_WINDOW_MONTHS: Record<RollingWindowKey, number> = {
  last3: 3,
  last6: 6,
  last12: 12,
};

export const ROLLING_WINDOW_KEYS: readonly RollingWindowKey[] = ['last3', 'last6', 'last12'];

export function isRollingWindowKey(value: string): value is RollingWindowKey {
  return (ROLLING_WINDOW_KEYS as readonly string[]).includes(value);
}

export interface RollingWindow {
  key: RollingWindowKey;
  /** First day of the start month, inclusive. */
  startYmd: string;
  /** Always equal to the `today` passed in, inclusive. */
  endYmd: string;
}

function parts(ymd: string): { y: number; m: number } {
  return { y: Number(ymd.slice(0, 4)), m: Number(ymd.slice(5, 7)) - 1 };
}

function toYmd(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function resolveRollingWindow(key: RollingWindowKey, today: string): RollingWindow {
  const { y, m } = parts(today);
  const monthsBack = ROLLING_WINDOW_MONTHS[key];
  // Same "+1" as stats.ts's getWindowPredicate for last6/last12: without it
  // the window reaches back one month too many and "last 3" would actually
  // span 4 months of data while still being labelled 3.
  const startIdx = y * 12 + m - monthsBack + 1;
  const sY = Math.floor(startIdx / 12);
  const sM = ((startIdx % 12) + 12) % 12;
  return { key, startYmd: toYmd(sY, sM, 1), endYmd: today };
}

export function isInRollingWindow(w: RollingWindow, ymd: string): boolean {
  return ymd >= w.startYmd && ymd <= w.endYmd;
}

/**
 * 'Sep 2025 - Aug 2026' / '2025年9月 至 2026年8月'. Month+year granularity on
 * both ends, matching how the Dashboard already labels its identical
 * last6/last12 windows (describeWindow() in stats.ts) - deliberately not
 * reused from there: that function reads the clock internally, which this
 * module must not do.
 */
export function formatRollingRangeLabel(w: RollingWindow, locale: 'en' | 'zh'): string {
  const s = parts(w.startYmd);
  const e = parts(w.endYmd);
  if (locale === 'zh') {
    return `${s.y}年${s.m + 1}月 至 ${e.y}年${e.m + 1}月`;
  }
  const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${MONTH_ABBR[s.m]} ${s.y} - ${MONTH_ABBR[e.m]} ${e.y}`;
}
