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
  icon: LucideIcon;
  color: string;
}

export interface GoalIconOption {
  key: string;
  icon: LucideIcon;
}
