import { INTL_LOCALE, DEFAULT_LOCALE, type Locale } from '@/lib/i18n/locale';

/**
 * Chart-tick style: month plus FULL year, on every tick.
 *
 * Previously showed the year only at the January boundary, to save
 * horizontal space. Removed after real use showed a bare "Jul" was ambiguous
 * about which year - correctness won over compactness. interval and
 * minTickGap on the axis, already in place, thin the ticks at narrow widths
 * rather than overlapping them.
 *
 * Extracted because 'MONTH_ABBR' plus a version of this rule was
 * independently duplicated FOUR times (income.ts, cashflow.ts, upcoming.ts,
 * spending.ts) before this file existed - see spending.ts for how the fourth
 * copy was found.
 *
 * Chinese gets its own branch, not just swapped month names: year-before-
 * month is the correct convention there, not a translated "Jul 2026" shape.
 */
export function chartMonthLabel(year: number, month0: number, locale: Locale = DEFAULT_LOCALE): string {
  if (locale === 'zh') {
    return `${year}年${month0 + 1}月`;
  }
  const monthPart = new Date(year, month0, 1).toLocaleDateString(INTL_LOCALE[locale], { month: 'short' });
  return `${monthPart} ${year}`;
}

/** List-header style: month plus full year, always. Used where each entry
 *  stands alone (a list of upcoming months) rather than beside its neighbours
 *  on a chart axis. */
export function fullMonthLabel(year: number, month0: number, locale: Locale = DEFAULT_LOCALE): string {
  return new Date(year, month0, 1).toLocaleDateString(INTL_LOCALE[locale], { month: 'short', year: 'numeric' });
}
