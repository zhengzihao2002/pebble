import type { BalanceAdjustment } from '@/types';
import { addMonthsClamped } from '@/lib/recurring/occurrences';
import { compareSameDayIds } from '@/lib/stats';

export type CleanupSource = Pick<BalanceAdjustment, 'id' | 'amount' | 'description' | 'date'>;

export interface AdjustmentCleanupGroup {
  id: string;
  accountId: string;
  date: string;
  total: number;
  rows: CleanupSource[];
}

export const cleanupCutoff = (today: string) => addMonthsClamped(today, -3);
export const MAX_CLEANUP_DESCRIPTION = 240;
export const MAX_CLEANUP_ROWS = 200;

export function adjustmentCleanupGroup(accountId: string, source: readonly CleanupSource[]): AdjustmentCleanupGroup | undefined {
  if (source.length < 2 || source.length > MAX_CLEANUP_ROWS) return;
  const rows = [...source].sort((a, b) => a.date.localeCompare(b.date) || compareSameDayIds(a.id, b.id));
  const cents = rows.reduce((sum, row) => sum + Math.round(row.amount * 100), 0);
  // The existing column is numeric(12,2).
  if (Math.abs(cents) > 999_999_999_999) return;
  const last = rows[rows.length - 1];
  return { id: last.id, accountId, date: last.date, total: cents / 100, rows };
}

export function findAdjustmentCleanupGroups(
  adjustments: readonly BalanceAdjustment[], cutoff: string, accountIds: ReadonlySet<string>,
): AdjustmentCleanupGroup[] {
  const byAccount = new Map<string, BalanceAdjustment[]>();
  for (const row of adjustments) {
    if (!accountIds.has(row.accountId) || row.date >= cutoff || row.transferGroupId != null) continue;
    const rows = byAccount.get(row.accountId) ?? [];
    rows.push(row);
    byAccount.set(row.accountId, rows);
  }
  const groups: AdjustmentCleanupGroup[] = [];
  for (const [accountId, accountRows] of byAccount) {
    accountRows.sort((a, b) => a.date.localeCompare(b.date) || compareSameDayIds(a.id, b.id));
    for (let start = 0; start + 1 < accountRows.length; start += MAX_CLEANUP_ROWS) {
      const batch = accountRows.slice(start, start + MAX_CLEANUP_ROWS);
      const group = adjustmentCleanupGroup(accountId, batch.map(({ id, amount, description, date }) => ({ id, amount, description, date })));
      if (group) groups.push(group);
    }
  }
  return groups.sort((a, b) => b.rows.length - a.rows.length || b.date.localeCompare(a.date));
}
