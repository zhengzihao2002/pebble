import type { Transaction } from '@/types';

export type ReportType = 'expense' | 'income';
export type PeriodGroup = 'month' | 'quarter' | 'year' | 'all';
export type CategoryGroupMode = 'category' | 'none';
export type SortDir = 'desc' | 'asc';

// What the sort applies to. Kept separate from SortDir so 'newest first' and
// 'highest first' are one field plus one direction, not four enum values.
export type SortField = 'amount' | 'date';

export interface ReportCategorySubGroup {
  key: string;
  total: number;
  items: Transaction[];
}

export interface ReportPeriodGroup {
  key: string;
  sortKey: number;
  total: number;
  items?: Transaction[];
  subGroups?: ReportCategorySubGroup[];
}
