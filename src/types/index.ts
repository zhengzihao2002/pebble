import type { LucideIcon } from 'lucide-react';

/** Every transaction is tied to one of these two accounts, each with its own running balance. */
export type PaymentMethod = 'Cash' | 'Checking';

export interface ExpenseTransaction {
  id: string;
  type: 'expense';
  description: string;
  category: string; // key into CategoryMeta
  tag?: string;
  date: string; // 'YYYY-MM-DD'
  paymentMethod: PaymentMethod;
  amount: number; // always negative
}

export interface IncomeTransaction {
  id: string;
  type: 'income';
  description: string;
  category: 'Standard Income' | 'Side Cash';
  date: string; // 'YYYY-MM-DD'
  paymentMethod: PaymentMethod;
  grossAmount: number;
  netAmount: number;
  amount: number; // = netAmount, always positive
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
  date: string; // free text, e.g. 'Dec 2026'
  iconKey: string; // key into GOAL_ICON_OPTIONS; resolved to a component client-side
  color: string;
}

export interface GoalIconOption {
  key: string;
  icon: LucideIcon;
}
