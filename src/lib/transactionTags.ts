export const MAX_TAG_NAME_LENGTH = 50;

export interface TransactionTagGroup {
  name: string;
  count: number;
}

export function groupTransactionTags(expenses: readonly { tag?: string }[]): TransactionTagGroup[] {
  const counts = new Map<string, number>();
  for (const { tag } of expenses) {
    if (tag?.trim()) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return Array.from(counts, ([name, count]) => ({ name, count }));
}
