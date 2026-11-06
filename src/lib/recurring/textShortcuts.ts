import { isYmd, type Ymd } from './occurrences';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Deterministic calendar values: never use the server clock, locale or timezone. */
export function scheduledTextValues(date: Ymd): Record<string, string> {
  if (!isYmd(date)) throw new Error('A valid processed date is required for scheduled text.');
  const [year, month, day] = date.split('-');
  const y = Number(year), m = Number(month), d = Number(day);
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (y < 1 || m < 1 || m > 12 || d < 1 || d > days[m - 1]) throw new Error('A valid processed date is required for scheduled text.');
  const name = MONTHS[m - 1];
  return { MONTH: name, MMMM: name, MONTH_SHORT: name.slice(0, 3), MMM: name.slice(0, 3), MONTH_NUMBER: month, MM: month, YEAR: year, YYYY: year, YY: year.slice(-2), DAY: day, DD: day, DATE: date };
}

/** Shared with the parameterized SQL renderer used by the atomic early-payment path. */
export function shortcutPattern(token: string): string {
  return `\\{\\{[ \\t]*${token}[ \\t]*\\}\\}|\\{[ \\t]*${token}[ \\t]*\\}`;
}

export function expandScheduledText(template: string, date: Ymd): string {
  const values = scheduledTextValues(date);
  // One pass: unknown shortcuts and unrelated braces are preserved verbatim.
  return template.replace(/\{\{[ \t]*([a-z_]+)[ \t]*\}\}|\{[ \t]*([a-z_]+)[ \t]*\}/gi,
    (original, double: string | undefined, single: string | undefined) => values[(double ?? single ?? '').toUpperCase()] ?? original);
}
