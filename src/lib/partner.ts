export const PARTNER_PERMISSIONS = ['expenses', 'income', 'amounts', 'notes', 'accounts', 'personalGoals', 'editTags', 'editTransactions', 'deleteTransactions'] as const;
export type PartnerPermission = (typeof PARTNER_PERMISSIONS)[number];
export type PartnerPermissions = Partial<Record<PartnerPermission, boolean>>;
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
  canEditTag: boolean;
  canEdit: boolean;
  canEditNotes: boolean;
  canDelete: boolean;
}
export interface PartnerWorkspaceData {
  pairId: string;
  name: string;
  permissions: PartnerPermissions;
  transactions: SharedTransaction[];
  accounts: { name: string; kind: string }[];
  goals: { name: string; target: number | null; current: number | null }[];
}
export interface JointGoalSummary {
  id: string;
  name: string;
  active: boolean;
  targetCents: number;
  myCents: number;
  partnerCents: number;
}

export type SharedTransactionChange =
  | { kind: 'tag'; tag: string }
  | { kind: 'edit'; title: string; date: string; notes?: string }
  | { kind: 'delete' };
