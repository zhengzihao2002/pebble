/**
 * Safety locks: per-user switches that DISABLE risky buttons, so they cannot
 * be pressed by accident. Stored with the other preferences in the browser
 * and not enforced by the server - a guard against accidents, not security.
 */
export const SAFETY_LOCK_KEYS = ['deletePebbleAccount', 'deleteAccounts', 'deleteTransactions', 'deleteCategories'] as const;
export type SafetyLockKey = (typeof SAFETY_LOCK_KEYS)[number];
export type SafetyLocks = Record<SafetyLockKey, boolean>;

export const DEFAULT_SAFETY_LOCKS: SafetyLocks = {
  deletePebbleAccount: true,
  deleteAccounts: false,
  deleteTransactions: false,
  deleteCategories: false,
};

/** A lock missing from older saved settings takes ITS default, not "off". */
export function isLocked(locks: Partial<SafetyLocks> | null | undefined, key: SafetyLockKey): boolean {
  const value = locks?.[key];
  return typeof value === 'boolean' ? value : DEFAULT_SAFETY_LOCKS[key];
}
