import type { BalanceAdjustment, CreditCardPayoff, RecurringFrequency } from '@/types';

export const PARTNER_VIEW_PERMISSIONS = ['expenses', 'income', 'amounts', 'notes', 'accounts', 'personalGoals', 'budgets', 'scheduled'] as const;
export const PARTNER_ADD_PERMISSIONS = ['addTransactions', 'addPersonalGoals', 'addAccounts', 'addBudgets', 'addScheduled'] as const;
export const PARTNER_EDIT_PERMISSIONS = ['editTransactions', 'editTags', 'editPersonalGoals', 'editAccounts', 'editBudgets', 'editScheduled'] as const;
export const PARTNER_PERMISSIONS = [...PARTNER_VIEW_PERMISSIONS, ...PARTNER_ADD_PERMISSIONS, ...PARTNER_EDIT_PERMISSIONS] as const;
export type PartnerPermission = (typeof PARTNER_PERMISSIONS)[number];
export type PartnerPermissions = Partial<Record<PartnerPermission, boolean>>;
// A running balance would reveal withheld income or spending by subtraction.
export const PARTNER_BALANCE_PERMISSIONS = { accounts: true, expenses: true, income: true, amounts: true } as const;
export function canSeePartnerBalances(permissions: PartnerPermissions) {
  return Object.keys(PARTNER_BALANCE_PERMISSIONS).every(key => permissions[key as PartnerPermission] === true);
}

export const INCOME_SHARING_KEYS = ['income:Standard Income', 'income:Side Cash'] as const;

export interface SharingCategory { id: string; name: string }
export interface PartnerSettingsData {
  pairId: string | null;
  configured: boolean;
  partnerConfigured: boolean;
  partnerName: string | null;
  inviteExpires: string | null;
  permissions: PartnerPermissions;
  sharedCategories: string[];
  categories: SharingCategory[];
  viewingPartner: boolean;
}

export interface SharedTransaction {
  id: string;
  kind: 'expense' | 'income';
  date: string;
  title: string;
  category: string;
  amount: number | null;
  notes: string | null;
  tag: string;
  accountName: string | null;
  accountId: string | null;
  grossAmount: number | null;
  creditCardPayoff?: CreditCardPayoff | null;
  canEditTag: boolean;
  canEdit: boolean;
  notesVisible: boolean;
  hidden: boolean;
}
export interface PartnerWorkspaceAccess {
  accessVersion: string;
  name: string;
  permissions: PartnerPermissions;
}

export interface PartnerWorkspaceData extends PartnerWorkspaceAccess {
  pairId: string;
  transactions: SharedTransaction[];
  adjustments: BalanceAdjustment[];
  /** Shared annual planning date, without exposing the owner's preferences. */
  budgetToday: string | null;
  censoredBudget: { amount: number; budgetedSpending: number; unbudgetedSpending: number } | null;
  canEstimateBudgetIncome: boolean;
  accounts: { id: string; name: string; kind: 'bank' | 'cash' | 'credit'; status: 'active' | 'hibernated'; editable: boolean }[];
  goals: { id: string; name: string; target: number | null; current: number | null; date: string; iconKey: string; color: string }[];
  categories: { id: string; name: string; iconKey: string; color: string; isSystem: boolean; sortOrder: number }[];
  budgets: { id: string; name: string; amount: number }[];
  scheduled: { id: string; kind: 'expense' | 'income'; title: string; date: string; amount: number | null; frequency: RecurringFrequency; paused: boolean; category: string; accountId: string | null;
    accountName: string | null; endMode: 'never' | 'after' | 'on'; endCount: number | null; endDate: string | null; materializedThrough: string | null }[];
  entryAccounts: { id: string; name: string }[];
  entryCategories: SharingCategory[];
  entryIncome: string[];
  budgetCategories: SharingCategory[];
}
export type SharedTransactionChange =
  | { kind: 'tag'; tag: string }
  | { kind: 'edit'; title: string; date: string; notes?: string };

type LedgerEntryFields = { id: string; type: 'expense' | 'income'; accountId: string; categoryId: string;
  title: string; date: string; amount: number; gross: number; notes?: string };

export type PartnerCreation =
  | ({ kind: 'transaction' } & LedgerEntryFields)
  | ({ kind: 'schedule'; frequency: RecurringFrequency } & LedgerEntryFields)
  | { kind: 'goal'; id: string; name: string; target?: number; date: string; edit?: boolean }
  | { kind: 'account'; id: string; name: string; accountKind: 'bank' | 'cash'; last4?: string; edit?: boolean }
  | { kind: 'budget'; categoryId: string; target: number; edit?: boolean }
  | { kind: 'scheduleEdit'; id: string; title: string };

export interface PartnerInboxItem {
  id: string;
  operation: 'add' | 'edit';
  resource: 'transaction' | 'goal' | 'account' | 'budget' | 'scheduled';
  label: string;
  createdAt: string;
  expiresAt: string;
  guestName: string | null;
}
