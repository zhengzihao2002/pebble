import type { Transaction } from '@/types';

export type ReportType = 'expense' | 'income';
export type PeriodGroup = 'month' | 'quarter' | 'year' | 'all';
export type CategoryGroupMode = 'category' | 'none';
export type SortDir = 'desc' | 'asc';

// What the sort applies to. Kept separate from SortDir so 'newest first' and
// 'highest first' are one field plus one direction, not four enum values.
export type SortField = 'amount' | 'date';

// Persisted in the pebble-ui store. Filter choices are device preferences,
// not financial data - nothing here identifies a transaction or an amount.
export interface ReportFilterPrefs {
  reportType: ReportType;
  periodGroup: PeriodGroup;
  subYear: string;
  subPeriod: string;
  categoryGroup: CategoryGroupMode;
  sortField: SortField;
  sortDir: SortDir;
  filtersExpanded: boolean;
  // The last Expand all / Collapse all choice, not the individual group keys.
  // Those keys are built from the period label and category name, so any filter
  // or rename would orphan them; a boolean survives both.
  groupsExpanded: boolean;
}

export interface ReportCategorySubGroup {
  key: string;
  total: number;
  items: Transaction[];
}

export interface ReportPeriodGroup {
  // Stable and ENGLISH. Used as the React key, as the sort tiebreak, and as
  // half of the `${period}::${category}` expansion key - none of which may
  // change when the language does.
  key: string;
  // What the user sees. Separate from key precisely so translating the header
  // cannot remount every group or reorder the report.
  label: string;
  sortKey: number;
  total: number;
  items?: Transaction[];
  subGroups?: ReportCategorySubGroup[];
}
