import type { LedgerRecord } from '@/types';
import { transactionDisplayAccountId } from '@/lib/creditCards';

/** Ghost history is an explicitly scoped view, never an input to app totals. */
export function filterGhostActivity<T extends { record: LedgerRecord }>(entries: T[], options: {
  monthPrefix: string;
  accountId: string | null;
  query: string;
  type: 'all' | 'income' | 'expense';
  accountNames: ReadonlyMap<string, string>;
  categoryName: (category: string) => string;
}): T[] {
  const query = options.query.trim().toLowerCase();
  const amountQuery = query.replace(/[$,\s]/g, '');
  return entries.filter(({ record }) => {
    if (!record.date.startsWith(options.monthPrefix)) return false;
    const accountId = transactionDisplayAccountId(record);
    if (options.accountId && accountId !== options.accountId) return false;
    if (options.type !== 'all' && record.type !== options.type) return false;
    if (!query) return true;
    const category = record.type === 'adjustment' ? '' : `${record.category} ${options.categoryName(record.category)}`;
    const tag = record.type === 'expense' ? record.tag ?? '' : '';
    const payoff = record.type === 'expense' ? record.creditCardPayoff : undefined;
    const accountName = options.accountNames.get(accountId) ?? payoff?.cardName ?? '';
    const text = [record.description, category, tag, accountName].join(' ').toLowerCase();
    return text.includes(query) || (/\d/.test(amountQuery) && Math.abs(record.amount).toFixed(2).includes(amountQuery));
  });
}
