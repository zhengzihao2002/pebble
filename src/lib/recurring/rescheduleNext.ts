import { addDays, generateOccurrences, type RecurrenceSpec } from './occurrences';
import { scheduledTextValues } from './textShortcuts';

/** Explicitly reposition progress without changing the recurrence or past transactions. */
export function nextPaymentMark(spec: RecurrenceSpec, nextDate: string, today: string): string | null {
  try { scheduledTextValues(nextDate); scheduledTextValues(today); } catch { return null; }
  if (nextDate < today) return null;
  const mark = addDays(nextDate, -1);
  return generateOccurrences(spec, { after: mark, through: nextDate, limit: 1 })[0] === nextDate ? mark : null;
}
