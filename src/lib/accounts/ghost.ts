/** The persisted flag is independent of kind, active/hibernated state and preference. */
export interface GhostAccountScope { id: string; isGhost?: boolean }

export function isGhostAccount(account: GhostAccountScope): boolean {
  return account.isGhost === true;
}

export function ghostAccountIds(accounts: readonly GhostAccountScope[]): Set<string> {
  return new Set(accounts.filter(isGhostAccount).map(account => account.id));
}

export function regularAccounts<T extends GhostAccountScope>(accounts: readonly T[]): T[] {
  return accounts.filter(account => !isGhostAccount(account));
}

/** A calculation scope is an allow-list: unknown and ghost account ids stay out.
 * Pass the complete raw arrays only to deliberately scoped account/ledger views. */
export function nonGhostRecords<T extends { accountId: string }>(records: readonly T[], accounts: readonly GhostAccountScope[]): T[] {
  const included = new Set(regularAccounts(accounts).map(account => account.id));
  return records.filter(record => included.has(record.accountId));
}
