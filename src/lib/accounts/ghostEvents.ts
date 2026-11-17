import { clearAllQuickPicks } from '@/lib/quickPicks';

/** Client data scopes change immediately when an account enters or leaves ghost mode. */
export const ACCOUNT_SCOPE_CHANGED_EVENT = 'pebble:account-scope-changed';
export interface AccountScopeChangedDetail { accountId: string; isGhost: boolean }

export function notifyAccountScopeChanged(accountId: string, isGhost: boolean): void {
  clearAllQuickPicks();
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<AccountScopeChangedDetail>(ACCOUNT_SCOPE_CHANGED_EVENT, {
    detail: { accountId, isGhost },
  }));
}
