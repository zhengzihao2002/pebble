/**
 * Splits an ALREADY-SORTED list into runs of the same date, for the day
 * headers in an ungrouped, date-sorted report. Headers are only inserted
 * between runs, so the order is exactly the one ReportsClient produced.
 */
import type { Transaction } from '@/types';

export interface DaySection {
  ymd: string;
  total: number;
  items: Transaction[];
}

export function sectionByDay(items: Transaction[], amt: (t: Transaction) => number): DaySection[] {
  const out: DaySection[] = [];
  for (const t of items) {
    const last = out[out.length - 1];
    if (last && last.ymd === t.date) {
      last.items.push(t);
      last.total += amt(t);
    } else {
      out.push({ ymd: t.date, total: amt(t), items: [t] });
    }
  }
  return out;
}
