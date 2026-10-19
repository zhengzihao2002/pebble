/**
 * Monthly totals per category for the sparklines in the category table: the
 * `months` calendar months ending with the month of `endYmd`, oldest first.
 *
 * Runs over the rows BEFORE the period filter (type, account, search and tag
 * filters already applied), so a category's trend reaches back past the
 * month in view. Pure, string dates only.
 */
import type { Transaction } from '@/types';

export function categoryMonthlySeries(rows: Transaction[], endYmd: string, months: number, amt: (t: Transaction) => number): Map<string, number[]> {
  const endIdx = Number(endYmd.slice(0, 4)) * 12 + Number(endYmd.slice(5, 7)) - 1;
  const startIdx = endIdx - months + 1;
  const out = new Map<string, number[]>();
  for (const t of rows) {
    const i = Number(t.date.slice(0, 4)) * 12 + Number(t.date.slice(5, 7)) - 1;
    if (i < startIdx || i > endIdx) continue;
    let s = out.get(t.category);
    if (!s) { s = new Array(months).fill(0); out.set(t.category, s); }
    s[i - startIdx] += Math.abs(amt(t));
  }
  return out;
}
