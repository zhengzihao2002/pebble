'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { budget, expense, goal, income, userAccount } from '@/db/schema';
import { getSessionUserId } from '@/lib/auth/getSessionUser';
import { getBudgets, getIncome } from '@/lib/data/queries';
import { estimateAnnualIncome } from '@/lib/stats';
import { generateId, generateTransId } from '@/lib/ids';
import type { PaymentMethod } from '@/types';

/**
 * Mutation layer.
 *
 * SECURITY: src/proxy.ts returns early for any request carrying the
 * Next-Action header, so Server Actions are NOT covered by auth middleware.
 * The getSessionUserId() call inside each action is the ONLY thing standing
 * between an unauthenticated POST and a write.
 *
 * Consequently no action accepts a userId parameter. It is always resolved
 * from the session here. Do not add one.
 *
 * Actions return a result object rather than throwing: an uncaught throw in a
 * Server Action surfaces in production as an opaque error digest, which helps
 * nobody. Errors are logged server-side and returned as a message.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

const PAYMENT_METHODS: readonly string[] = ['Cash', 'Checking'];
const INCOME_CATEGORIES: readonly string[] = ['Standard Income', 'Side Cash'];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const MUTATED_ROUTES = ['/dashboard', '/transactions', '/reports', '/budgets', '/goals', '/settings'];

function revalidateAll(): void {
  for (const route of MUTATED_ROUTES) {
    revalidatePath(route, 'layout');
  }
}

function fail(message: string): ActionResult {
  return { ok: false, error: message };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Logs the real error server-side and returns a generic message. Raw Postgres
 * errors can echo query fragments, so they are not sent to the client.
 */
function handleUnexpected(context: string, error: unknown): ActionResult {
  console.error(`[pebble action] ${context}`, error);
  return fail('Something went wrong saving your changes. Please try again.');
}

export interface AddExpenseActionInput {
  type: 'expense';
  description: string;
  date: string;
  paymentMethod: PaymentMethod;
  category: string;
  tag?: string;
  amount: number;
}

export interface AddIncomeActionInput {
  type: 'income';
  description: string;
  date: string;
  paymentMethod: PaymentMethod;
  category: 'Standard Income' | 'Side Cash';
  grossAmount: number;
  netAmount: number;
}

export type AddTransactionActionInput = AddExpenseActionInput | AddIncomeActionInput;

/**
 * Transaction ids are generated in the app, not by the database, because
 * computeRecentTransactions() relies on their timestamp ordering to break
 * ties between same-day entries.
 */
export async function addTransactionAction(
  input: AddTransactionActionInput,
): Promise<ActionResult> {
  try {
    const userId = await getSessionUserId();

    if (!DATE_PATTERN.test(input.date)) {
      return fail('Date must be in YYYY-MM-DD format.');
    }
    if (!PAYMENT_METHODS.includes(input.paymentMethod)) {
      return fail('Payment method must be Cash or Checking.');
    }

    if (input.type === 'expense') {
      if (!isFiniteNumber(input.amount) || input.amount <= 0) {
        return fail('Expense amount must be a positive number.');
      }
      if (!input.category.trim()) {
        return fail('An expense needs a category.');
      }

      await db.insert(expense).values({
        id: generateTransId(),
        userId,
        description: input.description.trim(),
        category: input.category,
        tag: input.tag?.trim() ?? '',
        transactionDate: input.date,
        paymentMethod: input.paymentMethod,
        amount: -Math.abs(input.amount),
      });
    } else {
      if (!INCOME_CATEGORIES.includes(input.category)) {
        return fail('Income category must be Standard Income or Side Cash.');
      }
      if (!isFiniteNumber(input.grossAmount) || input.grossAmount < 0) {
        return fail('Gross amount must be zero or greater.');
      }
      if (!isFiniteNumber(input.netAmount) || input.netAmount < 0) {
        return fail('Net amount must be zero or greater.');
      }

      await db.insert(income).values({
        id: generateTransId(),
        userId,
        description: input.description.trim(),
        category: input.category,
        transactionDate: input.date,
        paymentMethod: input.paymentMethod,
        grossAmount: input.grossAmount,
        netAmount: input.netAmount,
      });
    }

    revalidateAll();
    return { ok: true };
  } catch (error) {
    return handleUnexpected('addTransactionAction', error);
  }
}

export interface AddGoalActionInput {
  name: string;
  target: number;
  current: number;
  date: string;
  iconKey: string;
  color: string;
}

export async function addGoalAction(input: AddGoalActionInput): Promise<ActionResult> {
  try {
    const userId = await getSessionUserId();

    if (!input.name.trim()) {
      return fail('A goal needs a name.');
    }
    if (!isFiniteNumber(input.target) || input.target <= 0) {
      return fail('Target amount must be greater than zero.');
    }
    if (!isFiniteNumber(input.current) || input.current < 0) {
      return fail('Saved amount cannot be negative.');
    }

    await db.insert(goal).values({
      id: generateId(),
      userId,
      name: input.name.trim(),
      currentAmount: input.current,
      targetAmount: input.target,
      targetDate: input.date.trim(),
      iconKey: input.iconKey,
      color: input.color,
    });

    revalidateAll();
    return { ok: true };
  } catch (error) {
    return handleUnexpected('addGoalAction', error);
  }
}

/**
 * Upserts one row per category. A budget set to 0 is deleted rather than
 * stored, keeping "unset" and "explicitly zero" from accumulating as
 * indistinguishable rows.
 */
export async function modifyBudgetsAction(
  budgets: Record<string, number>,
): Promise<ActionResult> {
  try {
    const userId = await getSessionUserId();

    const entries = Object.entries(budgets);
    for (const [category, amount] of entries) {
      if (!category.trim()) {
        return fail('Budget category names cannot be empty.');
      }
      if (!isFiniteNumber(amount) || amount < 0) {
        return fail(`Budget for ${category} must be zero or greater.`);
      }
    }

    for (const [category, amount] of entries) {
      if (amount === 0) {
        await db
          .delete(budget)
          .where(and(eq(budget.userId, userId), eq(budget.category, category)));
        continue;
      }

      await db
        .insert(budget)
        .values({ userId, category, annualAmount: amount })
        .onConflictDoUpdate({
          target: [budget.userId, budget.category],
          set: { annualAmount: amount, updatedAt: new Date().toISOString() },
        });
    }

    revalidateAll();
    return { ok: true };
  } catch (error) {
    return handleUnexpected('modifyBudgetsAction', error);
  }
}

/**
 * Sets OPENING balances - the balance before any recorded transaction.
 * Current balances are derived and must never be written here.
 */
export async function setOpeningBalancesAction(input: {
  checkingOpening: number;
  cashOpening: number;
}): Promise<ActionResult> {
  try {
    const userId = await getSessionUserId();

    if (!isFiniteNumber(input.checkingOpening)) {
      return fail('Checking opening balance must be a number.');
    }
    if (!isFiniteNumber(input.cashOpening)) {
      return fail('Cash opening balance must be a number.');
    }

    await db
      .insert(userAccount)
      .values({
        userId,
        checkingOpening: input.checkingOpening,
        cashOpening: input.cashOpening,
      })
      .onConflictDoUpdate({
        target: userAccount.userId,
        set: {
          checkingOpening: input.checkingOpening,
          cashOpening: input.cashOpening,
          updatedAt: new Date().toISOString(),
        },
      });

    revalidateAll();
    return { ok: true };
  } catch (error) {
    return handleUnexpected('setOpeningBalancesAction', error);
  }
}

export type BudgetModalData =
  | { ok: true; budgets: Record<string, number>; annualIncome: number }
  | { ok: false; error: string };

/**
 * Loads exactly what ModifyBudgetModal needs, on open.
 *
 * The modal is mounted in AppShell (the layout), not in a page, so fetching
 * this in a Server Component would make every page pay for it on every
 * navigation even though the modal is rarely opened.
 *
 * annualIncome is computed server-side so the full income history never
 * crosses the wire - the client only needs the resulting number.
 */
export async function getBudgetModalDataAction(): Promise<BudgetModalData> {
  try {
    const userId = await getSessionUserId();
    const [budgets, income] = await Promise.all([getBudgets(userId), getIncome(userId)]);
    return { ok: true, budgets, annualIncome: estimateAnnualIncome(income) };
  } catch (error) {
    console.error('[pebble action] getBudgetModalDataAction', error);
    return { ok: false, error: 'Could not load your budgets. Please try again.' };
  }
}
