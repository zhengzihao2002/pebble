// Date.now() alone can collide if two items are added within the same
// millisecond (e.g. a fast double-click). Prefer a real UUID where available.
export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Expense/income records specifically use a date/time-based id instead of a
// random UUID: it's directly sortable as a plain string (zero-padded,
// most-significant-first), which computeRecentTransactions relies on to
// break ties between same-day entries by actual creation order.
export function generateTransId(): string {
  const d = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}${pad(d.getMilliseconds(), 3)}`;
  const rand = Math.random().toString(36).slice(2, 6);
  return `${stamp}-${rand}`;
}
