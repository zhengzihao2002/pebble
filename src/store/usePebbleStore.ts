import { useMemo } from 'react';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { CategoryMeta, ExpenseTransaction, IncomeTransaction, Goal, PaymentMethod, Transaction } from '@/types';
import { initialCategoryMeta, initialExpenses, initialIncome, initialGoals } from '@/data/seed';
import { generateId, generateTransId } from '@/lib/ids';
import { parseLocalDate } from '@/lib/format';

export type AddExpenseInput = {
  type: 'expense';
  description: string;
  date: string;
  paymentMethod: PaymentMethod;
  category: string;
  tag?: string;
  amount: number; // positive; gets negated when stored
};

export type AddIncomeInput = {
  type: 'income';
  description: string;
  date: string;
  paymentMethod: PaymentMethod;
  category: 'Standard Income' | 'Side Cash';
  grossAmount: number;
  netAmount: number;
};

export type AddTransactionInput = AddExpenseInput | AddIncomeInput;
export type AddGoalInput = Omit<Goal, 'id'>;

interface PebbleState {
  expenses: ExpenseTransaction[];
  income: IncomeTransaction[];
  checkingBalance: number;
  cashBalance: number;
  categoryMeta: CategoryMeta;
  goals: Goal[];
  darkMode: boolean;
  textSize: number;

  addTransaction: (data: AddTransactionInput) => void;
  addGoal: (data: AddGoalInput) => void;
  modifyBudgets: (budgets: Record<string, number>) => void;
  setDarkMode: (value: boolean) => void;
  setTextSize: (value: number) => void;
}

const noopStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

interface PersistedShape {
  expenses: ExpenseTransaction[];
  income: IncomeTransaction[];
  checkingBalance: number;
  cashBalance: number;
  budgets: Record<string, number>;
}

export const usePebbleStore = create<PebbleState>()(
  persist(
    (set) => ({
      expenses: initialExpenses,
      income: initialIncome,
      checkingBalance: 0,
      cashBalance: 0,
      categoryMeta: initialCategoryMeta,
      goals: initialGoals,
      darkMode: false,
      textSize: 100,

      addTransaction: (data) => {
        if (data.type === 'expense') {
          const amt = Math.abs(Number(data.amount));
          const newTxn: ExpenseTransaction = {
            id: generateTransId(), type: 'expense', description: data.description.trim(),
            category: data.category, tag: data.tag || '', date: data.date,
            paymentMethod: data.paymentMethod, amount: -amt,
          };
          set((state) => ({
            expenses: [...state.expenses, newTxn].sort(
              (a, b) => parseLocalDate(b.date).getTime() - parseLocalDate(a.date).getTime()
            ),
            checkingBalance: data.paymentMethod === 'Checking' ? state.checkingBalance - amt : state.checkingBalance,
            cashBalance: data.paymentMethod === 'Cash' ? state.cashBalance - amt : state.cashBalance,
          }));
        } else {
          const net = Number(data.netAmount);
          const newTxn: IncomeTransaction = {
            id: generateTransId(), type: 'income', description: data.description.trim(),
            category: data.category, date: data.date, paymentMethod: data.paymentMethod,
            grossAmount: Number(data.grossAmount), netAmount: net, amount: net,
          };
          set((state) => ({
            income: [...state.income, newTxn].sort(
              (a, b) => parseLocalDate(b.date).getTime() - parseLocalDate(a.date).getTime()
            ),
            checkingBalance: data.paymentMethod === 'Checking' ? state.checkingBalance + net : state.checkingBalance,
            cashBalance: data.paymentMethod === 'Cash' ? state.cashBalance + net : state.cashBalance,
          }));
        }
      },

      addGoal: (data) => {
        set((state) => ({ goals: [...state.goals, { id: generateId(), ...data }] }));
      },

      modifyBudgets: (budgets) => {
        set((state) => {
          const next = { ...state.categoryMeta };
          Object.entries(budgets).forEach(([name, budget]) => {
            if (next[name]) next[name] = { ...next[name], budget };
          });
          return { categoryMeta: next };
        });
      },

      setDarkMode: (value) => set({ darkMode: value }),
      setTextSize: (value) => set({ textSize: value }),
    }),
    {
      name: 'pebble-storage',
      storage: createJSONStorage(() => (typeof window !== 'undefined' ? window.localStorage : noopStorage)),
      partialize: (state): PersistedShape => ({
        expenses: state.expenses,
        income: state.income,
        checkingBalance: state.checkingBalance,
        cashBalance: state.cashBalance,
        budgets: Object.fromEntries(
          Object.entries(state.categoryMeta).map(([name, meta]) => [name, meta.budget])
        ),
      }),
      merge: (persistedState, currentState) => {
        const persisted = (persistedState ?? {}) as Partial<PersistedShape>;
        const categoryMeta = { ...currentState.categoryMeta };
        if (persisted.budgets) {
          Object.entries(persisted.budgets).forEach(([name, budget]) => {
            if (categoryMeta[name]) categoryMeta[name] = { ...categoryMeta[name], budget };
          });
        }
        return {
          ...currentState,
          expenses: persisted.expenses ?? currentState.expenses,
          income: persisted.income ?? currentState.income,
          checkingBalance: persisted.checkingBalance ?? currentState.checkingBalance,
          cashBalance: persisted.cashBalance ?? currentState.cashBalance,
          categoryMeta,
        };
      },
    }
  )
);

// Merged, sorted view — same shape as the original file's single
// `transactions` array, derived here from the two persisted lists. Used by
// any component that needs the combined ledger (modals, dashboard, reports).
export function useTransactions(): Transaction[] {
  const expenses = usePebbleStore((s) => s.expenses);
  const income = usePebbleStore((s) => s.income);
  return useMemo(
    () => [...expenses, ...income].sort(
      (a, b) => parseLocalDate(b.date).getTime() - parseLocalDate(a.date).getTime()
    ),
    [expenses, income]
  );
}
