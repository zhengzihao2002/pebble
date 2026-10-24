import type { Dictionary } from '@/lib/i18n';
import type { t as translate } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n/locale';
import { formatDate } from '@/lib/format';
import { addDays, generateOccurrences, isExhausted, type RecurrenceSpec } from '@/lib/recurring/occurrences';
import type { RecurringRule, UpcomingOccurrence } from '@/types';

/**
 * Pure helpers for the Scheduled page and the rule dialog's preview. Nothing
 * here reads the clock: every caller passes the zone-aware `today` it
 * resolved after mount, so the server and client renders agree.
 */

/** Frequency to occurrences per month - the same factors Analysis uses
    (computeCommitments in lib/analysis/cashflow.ts). 'once' has none. */
const PER_MONTH: Record<string, number> = {
  weekly: 52 / 12,
  biweekly: 26 / 12,
  monthly: 1,
  yearly: 1 / 12,
};

/** A rule's signed amount as a monthly figure; null for a one-off. */
export function monthlyEquivalent(rule: Pick<RecurringRule, 'frequency' | 'amount'>): number | null {
  const per = PER_MONTH[rule.frequency];
  return per === undefined ? null : rule.amount * per;
}

/**
 * A rule that has made every payment it ever will. isExhausted covers 'after'
 * and 'on'; a one-off keeps endMode 'never', so it would otherwise never read
 * as finished - once the high-water mark has reached its date it has fired
 * (or its date passed while it was paused), and it never runs again. Derived,
 * not stored, exactly like isExhausted.
 */
export function isDone(rule: RecurringRule): boolean {
  if (isExhausted(rule, rule.materializedThrough)) return true;
  return rule.frequency === 'once' && rule.materializedThrough !== null && rule.materializedThrough >= rule.startDate;
}

/** How far through its life a rule with an end is: payments up to the
    high-water mark against the payments it will ever make. Null when it
    never ends (no total to measure against). */
export function ruleProgress(rule: RecurringRule): { done: number; total: number } | null {
  let total: number;
  // A one-off has no journey to show: its Finished capsule says it all.
  if (rule.frequency === 'once') return null;
  if (rule.endMode === 'after' && rule.endCount) total = rule.endCount;
  else if (rule.endMode === 'on' && rule.endDate) {
    total = generateOccurrences(rule, { after: null, through: rule.endDate, limit: 5000 }).length;
  } else return null;
  if (total <= 0) return null;
  const done = rule.materializedThrough
    ? generateOccurrences(rule, { after: null, through: rule.materializedThrough, limit: total }).length
    : 0;
  return { done: Math.min(done, total), total };
}

/** The next date this rule will create a transaction, looking past the
    page's 60-day window (a yearly rule still has a next date). Same lower
    bound as scheduled/page.tsx, so it agrees with Coming up. */
export function nextDate(rule: RecurringRule, today: string): string | null {
  if (rule.status !== 'active' || isDone(rule)) return null;
  return generateOccurrences(rule, {
    after: rule.materializedThrough ?? addDays(today, -1),
    through: addDays(today, 800),
    limit: 1,
  })[0] ?? null;
}

/** Whole days from a to b ('YYYY-MM-DD'), calendar terms. */
export function daysBetween(a: string, b: string): number {
  const ms = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  return Math.round((ms(b) - ms(a)) / 86_400_000);
}

/** Running scheduled net per day from today through the horizon. Items
    dated before today (none, after catch-up) count on day 0. */
export function cumulativeNet(upcoming: readonly UpcomingOccurrence[], today: string, days: number): number[] {
  const out: number[] = [];
  let run = 0;
  let i = 0;
  for (let k = 0; k <= days; k++) {
    const day = addDays(today, k);
    while (i < upcoming.length && upcoming[i].date <= day) { run += upcoming[i].amount; i++; }
    out.push(run);
  }
  return out;
}

/** Money as a short label for a calendar cell: "-$2.2k", "+$160". */
export function compactMoney(n: number): string {
  // A day whose in and out cancel reads "$0", not "+$0".
  const sign = n < 0 ? '−' : n > 0 ? '+' : '';
  const a = Math.abs(n);
  const body = a >= 1000 ? `${(a / 1000).toFixed(a >= 10_000 ? 0 : 1).replace(/\.0$/, '')}k` : String(Math.round(a));
  return `${sign}$${body}`;
}

/**
 * Builds the inline schedule description ("Monthly from Aug 21" etc.).
 *
 * Takes d/t/locale as parameters rather than calling useTranslation() itself:
 * it is a plain function used inside a .map(), not a component, and passing
 * the already-resolved dictionary avoids resolving it once per rule. Takes
 * the bare schedule spec, so the rule dialog can describe a schedule that is
 * still being typed.
 *
 * spec.frequency indexes d.scheduled.frequencyShort directly - both are typed
 * against the same RecurringFrequency values, so a mismatched key is a
 * compile error.
 */
export function describeSchedule(spec: RecurrenceSpec, d: Dictionary, t: typeof translate, locale: Locale): string {
  const freq = d.scheduled.frequencyShort[spec.frequency];
  if (spec.frequency === 'once') return t(d.scheduled.onceOn, { freq, date: formatDate(spec.startDate, locale) });
  if (spec.endMode === 'after' && spec.endCount) return t(d.scheduled.afterCount, { freq, count: spec.endCount, date: formatDate(spec.startDate, locale) });
  if (spec.endMode === 'on' && spec.endDate) return t(d.scheduled.until, { freq, date: formatDate(spec.endDate, locale) });
  return t(d.scheduled.from, { freq, date: formatDate(spec.startDate, locale) });
}
