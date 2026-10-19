import { formatCurrency } from '@/lib/format';

/*
 * Small date and shading helpers the Insights cards share. Pure functions on
 * 'YYYY-MM-DD' strings in local time, so the same input gives the same
 * output on the server and in the browser.
 */

export const pad = (n: number) => String(n).padStart(2, '0');
export const toYmd = (dt: Date) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
export const fromYmd = (s: string) => new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
export const addDaysYmd = (s: string, n: number) => {
  const dt = fromYmd(s);
  return toYmd(new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + n));
};
export const wholeDollars = (v: number) => formatCurrency(Math.round(v)).replace(/\.00$/, '');

/** Pine at these strengths, Less to More. */
export const SHADES = [16, 34, 54, 76, 100];

/**
 * The shade (0 = none, 1..5) for a day's spending. Shaded against a
 * high-but-typical day - the 90th percentile of the spending days given -
 * not the single biggest, so one large scheduled payment does not wash out
 * every ordinary day; days above it take the darkest shade. With fewer than
 * five spending days the biggest is used. Square root, so small days still
 * show.
 */
export function makeLevel(spends: number[]): (v: number) => number {
  const sorted = spends.filter((v) => v > 0).sort((a, b) => a - b);
  const max = sorted.length ? sorted[sorted.length - 1] : 0;
  const cap = sorted.length >= 5 ? sorted[Math.floor((sorted.length - 1) * 0.9)] : max;
  return (v: number) => (v <= 0 || cap <= 0 ? 0 : Math.max(1, Math.min(5, Math.ceil(Math.sqrt(Math.min(1, v / cap)) * 5))));
}

/** The jump-chip targets; also the sections' DOM ids. */
export const SECTION_IDS = {
  attention: 'pb-ins-attention',
  pace: 'pb-ins-pace',
  calendar: 'pb-ins-calendar',
  week: 'pb-ins-week',
  trends: 'pb-ins-trends',
  places: 'pb-ins-places',
  good: 'pb-ins-good',
} as const;

/** Same place, however the bank wrote it: case, spacing and a trailing store number ignored. */
export const placeKey = (title: string) => title.toLowerCase().replace(/\s*#?\d{2,}\s*$/, '').replace(/\s+/g, ' ').trim();
