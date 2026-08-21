import 'server-only';

import { asc, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { budget, expense, goal, income, userAccount } from '@/db/schema';
import type { ExpenseTransaction, Goal, IncomeTransaction } from '@/types';
import {
  mapBudgetRows,
  mapExpenseRow,
  mapGoalRow,
  mapIncomeRow,
  mapUserAccountRow,
  type OpeningBalances,
} from './mappers';

/**
 * Read layer. server-only: importing this from a client component is a build
 * error, so DATABASE_URL and all query logic stay off the client.
 *
 * INVARIANT: every function takes an explicit userId and every query filters
 * on it. There is no unfiltered read path in this file, and none may be added.
 * A function that returned rows across users would be a cross-account data
 * leak, not a bug to fix later.
 *
 * userId is always resolved from the session by the caller via
 * getSessionUserId() - never accepted from client input.
 */

export async function getExpenses(userId: string): Promise<ExpenseTransaction[]> {
  const rows = await db
    .select()
    .from(expense)
    .where(eq(expense.userId, userId))
    .orderBy(desc(expense.transactionDate), desc(expense.id));

  return rows.map(mapExpenseRow);
}

export async function getIncome(userId: string): Promise<IncomeTransaction[]> {
  const rows = await db
    .select()
    .from(income)
    .where(eq(income.userId, userId))
    .orderBy(desc(income.transactionDate), desc(income.id));

  return rows.map(mapIncomeRow);
}

/**
 * Returns category -> annual budget amount. Categories with no row are absent
 * from the map rather than present with 0, so callers can distinguish "unset"
 * from "deliberately zero" if they ever need to.
 */
export async function getBudgets(userId: string): Promise<Record<string, number>> {
  const rows = await db
    .select()
    .from(budget)
    .where(eq(budget.userId, userId))
    .orderBy(asc(budget.category));

  return mapBudgetRows(rows);
}

export async function getGoals(userId: string): Promise<Goal[]> {
  const rows = await db
    .select()
    .from(goal)
    .where(eq(goal.userId, userId))
    .orderBy(asc(goal.createdAt));

  return rows.map(mapGoalRow);
}

/**
 * OPENING balances. A user who has never set them has no user_account row;
 * that is a normal state, not an error, and maps to zeroes.
 */
export async function getUserAccount(userId: string): Promise<OpeningBalances> {
  const rows = await db
    .select()
    .from(userAccount)
    .where(eq(userAccount.userId, userId))
    .limit(1);

  return mapUserAccountRow(rows[0]);
}

export interface PebbleData {
  expenses: ExpenseTransaction[];
  income: IncomeTransaction[];
  budgets: Record<string, number>;
  goals: Goal[];
  openingBalances: OpeningBalances;
}

/**
 * Convenience aggregate for pages needing most of the dataset. Runs the five
 * queries concurrently rather than sequentially - meaningful over neon-http,
 * where each query is a separate HTTP round trip.
 *
 * Prefer the individual functions on pages that only need one or two.
 */
export async function getAllPebbleData(userId: string): Promise<PebbleData> {
  const [expenses, incomeRows, budgets, goals, openingBalances] = await Promise.all([
    getExpenses(userId),
    getIncome(userId),
    getBudgets(userId),
    getGoals(userId),
    getUserAccount(userId),
  ]);

  return { expenses, income: incomeRows, budgets, goals, openingBalances };
}
