import { todayInZone } from '@/lib/recurring/occurrences';

export function calendarYear(now: Date, timeZone: string): number {
  return Number(todayInZone(timeZone, now).slice(0, 4));
}

/** Find the actual instant of January 1 in an IANA zone, including offset changes. */
export function nextBudgetYearBoundary(now: Date, timeZone: string): number {
  const year = calendarYear(now, timeZone);
  const utc = Date.UTC(year + 1, 0, 1);
  let low = utc - 36 * 60 * 60 * 1000;
  let high = utc + 36 * 60 * 60 * 1000;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (calendarYear(new Date(middle), timeZone) > year) high = middle;
    else low = middle;
  }
  return high;
}
