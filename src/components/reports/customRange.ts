/**
 * Custom date range for Reports' "Custom range" period.
 *
 * Same rules as rollingWindow.ts: CLOCK-FREE (today is always passed in) and
 * STRING-DATE ARITHMETIC - 'YYYY-MM-DD' sorts lexicographically exactly as it
 * sorts chronologically, so bounds are strings and membership is a plain
 * string comparison. No Date object, no per-row timezone surface.
 *
 * An empty bound is an OPEN end: '' start means from the beginning, '' end
 * means up to the latest. Both bounds are inclusive.
 */

const YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface CustomRange {
  /** Inclusive, or '' for an open start. */
  startYmd: string;
  /** Inclusive, or '' for an open end. */
  endYmd: string;
}

/** A restored value, validated: localStorage can hold anything. */
export function sanitizeYmd(value: unknown): string {
  return typeof value === 'string' && YMD_PATTERN.test(value) ? value : '';
}

/** The first of today's month through today. */
export function defaultCustomRange(today: string): CustomRange {
  return { startYmd: `${today.slice(0, 7)}-01`, endYmd: today };
}

/** Both bounds set and the start after the end. Flagged, never swapped. */
export function isCustomRangeInverted(r: CustomRange): boolean {
  return r.startYmd !== '' && r.endYmd !== '' && r.startYmd > r.endYmd;
}

export function isInCustomRange(r: CustomRange, ymd: string): boolean {
  if (r.startYmd !== '' && ymd < r.startYmd) return false;
  if (r.endYmd !== '' && ymd > r.endYmd) return false;
  return true;
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatYmd(ymd: string, locale: 'en' | 'zh'): string {
  if (ymd === '') return '…';
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(5, 7));
  const d = Number(ymd.slice(8, 10));
  return locale === 'zh' ? `${y}年${m}月${d}日` : `${MONTH_ABBR[m - 1]} ${d}, ${y}`;
}

/**
 * 'Sep 1, 2026 - Sep 26, 2026' / '2026年9月1日 至 2026年9月26日'. Day
 * granularity, unlike formatRollingRangeLabel: a custom range can start and
 * end mid-month, and a month-only label would misstate it.
 */
export function formatCustomRangeLabel(r: CustomRange, locale: 'en' | 'zh'): string {
  const s = formatYmd(r.startYmd, locale);
  const e = formatYmd(r.endYmd, locale);
  return locale === 'zh' ? `${s} 至 ${e}` : `${s} - ${e}`;
}
