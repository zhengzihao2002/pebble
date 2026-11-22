export const MAX_TAG_NAME_LENGTH = 50;

export interface TransactionTagGroup {
  name: string;
  count: number;
}

export interface TaggedTransaction {
  id: string;
  description: string;
  category: string;
  date: string;
  amount: number;
  accountName: string | null;
}

export function indexTaggedTransactions(
  expenses: readonly (Omit<TaggedTransaction, 'accountName'> & { tag?: string; accountId: string; creditCardPayoff?: { cardName: string } })[],
  accounts: readonly { id: string; name: string }[],
): Record<string, TaggedTransaction[]> {
  const names = new Map(accounts.map(account => [account.id, account.name]));
  const groups = new Map<string, TaggedTransaction[]>();
  for (const { tag, id, description, category, date, amount, accountId, creditCardPayoff } of expenses) {
    if (!tag?.trim()) continue;
    const rows = groups.get(tag) ?? [];
    if (!groups.has(tag)) groups.set(tag, rows);
    rows.push({ id, description, category, date, amount, accountName: creditCardPayoff?.cardName ?? names.get(accountId) ?? null });
  }
  for (const rows of groups.values()) rows.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  return Object.fromEntries(groups);
}

export const normalizeTagSearch = (value: string) => value.trim().normalize('NFKC').toLowerCase();

export function groupTransactionTags(expenses: readonly { tag?: string }[]): TransactionTagGroup[] {
  const counts = new Map<string, number>();
  for (const { tag } of expenses) {
    if (tag?.trim()) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return Array.from(counts, ([name, count]) => ({ name, count }));
}
