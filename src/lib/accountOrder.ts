import type { Account } from '@/lib/data/mappers';

export const ACCOUNT_SORT_MODES = ['default', 'balanceDesc', 'balanceAsc', 'name', 'manual'] as const;
export type AccountSortMode = typeof ACCOUNT_SORT_MODES[number];
export function accountSortMode(value: unknown): AccountSortMode {
  return ACCOUNT_SORT_MODES.includes(value as AccountSortMode) ? value as AccountSortMode : 'default';
}
export function manualAccountIds(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string'))] : [];
}
/** Match the wallet's existing groups, including its two sleeping lists. */
export function accountOrderGroup(a: Account): number {
  return (a.status === 'hibernated' ? 2 : 0) + (a.kind === 'credit' ? 1 : 0);
}
export function orderAccounts(accounts: Account[], balances: Record<string, number>, mode: AccountSortMode, manualIds: string[]) {
  const ranks = new Map(manualIds.map((id, i) => [id, i]));
  const fallback = (a: Account, b: Account) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id);
  return [...accounts].sort((a, b) => {
    // Account state and kind always take priority over the chosen sort.
    const group = accountOrderGroup(a) - accountOrderGroup(b);
    if (group) return group;
    const balance = (balances[b.id] ?? 0) - (balances[a.id] ?? 0);
    if (mode === 'manual') return (ranks.get(a.id) ?? Infinity) - (ranks.get(b.id) ?? Infinity) || fallback(a, b);
    if (mode === 'name') return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) || fallback(a, b);
    if (mode === 'balanceAsc') return -balance || fallback(a, b);
    if (mode === 'balanceDesc') return balance || fallback(a, b);
    return fallback(a, b);
  });
}
