import { INTL_LOCALE, type Locale } from '@/lib/i18n/locale';
import { parseLocalDate } from '@/lib/format';

/** 'YYYY-MM-DD' plus n days, in local calendar terms. */
export function addDaysYmd(ymd: string, n: number): string {
  const dt = new Date(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)) + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export interface DayGroup<T> {
  date: string;
  items: T[];
}

/** Consecutive items sharing a date, in the order given (callers pass them sorted). */
export function groupByDay<T>(items: readonly T[], dateOf: (item: T) => string): DayGroup<T>[] {
  const out: DayGroup<T>[] = [];
  for (const it of items) {
    const date = dateOf(it);
    const last = out[out.length - 1];
    if (last && last.date === date) last.items.push(it);
    else out.push({ date, items: [it] });
  }
  return out;
}

/**
 * A day header: "Fri, Oct 16" / "10月16日 周五", prefixed with a relative word
 * ("Today · …") when the caller has one. The year appears only when it is not
 * `today`'s, compared against the caller's zone-aware today rather than the clock.
 */
export function dayHeading(ymd: string, locale: Locale, today: string, relative?: string): string {
  const dt = parseLocalDate(ymd);
  const sameYear = ymd.slice(0, 4) === today.slice(0, 4);
  const date = locale === 'zh'
    ? `${sameYear ? '' : `${dt.getFullYear()}年`}${dt.getMonth() + 1}月${dt.getDate()}日 ${dt.toLocaleDateString(INTL_LOCALE.zh, { weekday: 'short' })}`
    : dt.toLocaleDateString(INTL_LOCALE.en, { weekday: 'short', month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
  return relative ? `${relative} · ${date}` : date;
}
