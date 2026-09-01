import type { LucideIcon } from 'lucide-react';

/**
 * LEGACY, and now FREE TEXT. Superseded by accountId, which references the
 * account table. The column still carries the account's NAME as a
 * reconciliation trail, and account names are user data - so this can be
 * "BofA" or anything else the user typed. It is never read for logic and
 * never compared against a literal. Key off accountId instead.
 *
 * The old 'Cash' | 'Checking' union was correct only while a database CHECK
 * enforced it; that constraint was dropped when accounts became user-defined.
 */
export type PaymentMethod = string;

export interface ExpenseTransaction {
  id: string;
  type: 'expense';
  description: string;
  category: string; // key into CategoryMeta
  tag?: string;
  date: string; // 'YYYY-MM-DD'
  paymentMethod: PaymentMethod;
  /** The account this transaction belongs to. Balance derivation keys on this. */
  accountId: string;
  amount: number; // always negative
  /** Set when this row was materialized from a recurring rule. */
  recurringRuleId?: string;
}

export interface IncomeTransaction {
  id: string;
  type: 'income';
  description: string;
  category: 'Standard Income' | 'Side Cash';
  date: string; // 'YYYY-MM-DD'
  paymentMethod: PaymentMethod;
  /** The account this transaction belongs to. Balance derivation keys on this. */
  accountId: string;
  grossAmount: number;
  netAmount: number;
  amount: number; // = netAmount, always positive
  /** Set when this row was materialized from a recurring rule. */
  recurringRuleId?: string;
}

export type Transaction = ExpenseTransaction | IncomeTransaction;

/**
 * A manual balance correction. Deliberately NOT part of the Transaction union:
 * it must never reach the Reports page, which classifies anything that is not
 * an expense as income.
 */
export interface BalanceAdjustment {
  id: string;
  type: 'adjustment';
  description: string;
  date: string; // 'YYYY-MM-DD'
  paymentMethod: PaymentMethod;
  /** The account this adjustment applies to. */
  accountId: string;
  /** Set on both halves of a transfer; null for a standalone adjustment. */
  transferGroupId: string | null;
  amount: number; // signed - corrections go both ways
}

/** Anything that can appear as a row in the statement ledger. */
export type LedgerRecord = Transaction | BalanceAdjustment;

export interface CategoryMetaEntry {
  icon: LucideIcon;
  color: string;
  budget: number; // annual budget; 0 = unset
}

export type CategoryMeta = Record<string, CategoryMetaEntry>;

export interface Goal {
  id: string;
  name: string;
  current: number;
  target: number;
  date: string; // 'YYYY-MM-DD' — GoalModal uses <input type="date">
  iconKey: string; // key into GOAL_ICON_OPTIONS; resolved to a component client-side
  color: string;
}

export interface GoalIconOption {
  key: string;
  icon: LucideIcon;
}

/**
 * Scheduled & recurring payment rule.
 *
 * Nullable fields use `| null` rather than `?`, matching the database exactly,
 * so a row maps across with no optional/undefined conversion layer.
 *
 * The three unions below are duplicated in src/lib/recurring/occurrences.ts,
 * which is deliberately dependency-free. They are structurally identical, so
 * RecurringRule is assignable to RecurrenceSpec with no adapter. If you change
 * a member here, change it there.
 */
export type RecurringKind = 'expense' | 'income';
export type RecurringFrequency = 'once' | 'weekly' | 'biweekly' | 'monthly' | 'yearly';
export type RecurringEndMode = 'never' | 'after' | 'on';
export type RecurringStatus = 'active' | 'paused' | 'deleted';

export interface RecurringRule {
  id: string;
  kind: RecurringKind;
  description: string;
  category: string;
  /** expense only - income has no tag column */
  tag: string | null;
  paymentMethod: PaymentMethod;
  /** The account this rule's transactions are materialized into. */
  accountId: string;
  /** expense: <= 0. income: NET, >= 0. */
  amount: number;
  /** income only */
  grossAmount: number | null;
  frequency: RecurringFrequency;
  startDate: string; // 'YYYY-MM-DD'
  endMode: RecurringEndMode;
  endCount: number | null;
  endDate: string | null; // 'YYYY-MM-DD'
  status: RecurringStatus;
  /** Last date materialized. Catch-up never looks at or below this. */
  materializedThrough: string | null;
}

/** A future occurrence, computed on the fly - never stored. */
export interface UpcomingOccurrence {
  ruleId: string;
  description: string;
  category: string;
  kind: RecurringKind;
  paymentMethod: PaymentMethod;
  amount: number;
  date: string; // 'YYYY-MM-DD'
}
