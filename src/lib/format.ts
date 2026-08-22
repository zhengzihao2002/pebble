// Strips the time-of-day off a Date, for calendar-day-level comparisons.
export function atMidnight(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// The current date and time, evaluated fresh on every call.
//
// Deliberately a function, not a constant. A module-scope `const TODAY =
// new Date()` is captured once when the module first loads, so on a warm
// server container it goes stale past midnight and every "last 30 days"
// window silently shifts. Callers that need a stable value across a loop
// should snapshot it into a local once, rather than calling this per item.
export function getToday(): Date {
  return new Date();
}

// Today's date as a local 'YYYY-MM-DD' string, for date-input defaults.
// (Deliberately not toISOString().slice(0,10) — that converts to UTC first,
// which can silently shift the date by one day depending on the user's
// timezone.)
export function todayDateString(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// Parses a 'YYYY-MM-DD' string as LOCAL midnight. new Date('YYYY-MM-DD')
// parses as UTC midnight, but every date getter used elsewhere in this app
// reads in local time — for anyone west of UTC that mismatch can silently
// shift a transaction's displayed/grouped date back a day. Building the
// Date from integer components sidesteps the UTC step entirely.
export function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function formatCurrency(n: number): string {
  return n < 0
    ? `-$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(dateStr: string): string {
  return parseLocalDate(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}
