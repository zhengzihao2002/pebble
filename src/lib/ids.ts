// Date.now() alone can collide if two items are added within the same
// millisecond (e.g. a fast double-click). Prefer a real UUID where available.
export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Expense/income records use a date/time-based id instead of a random UUID so
// that same-day entries can be ordered by actual creation time.
//
// NOT directly sortable, despite the shape. Imported legacy rows use
// YYYYMMDD_ + 9 digits, where '_' (0x5F) sorts ABOVE every digit, so a plain
// string comparison puts them wrong against app-generated ids. Ordering goes
// through compareSameDayIds() in stats.ts, which handles both formats. Any
// third format has to be handled there too.
//
// Also stamps the CURRENT time, not the transaction's date: a back-dated entry
// carries an id from the day it was typed. Recurring occurrences materialized
// for past dates use this same generator, so several may share a millisecond -
// catchUp.ts checks generated ids for collisions before inserting.
export function generateTransId(): string {
  const d = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}${pad(d.getMilliseconds(), 3)}`;
  const rand = Math.random().toString(36).slice(2, 6);
  return `${stamp}-${rand}`;
}
