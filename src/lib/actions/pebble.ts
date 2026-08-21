'use server';

import { revalidatePath } from 'next/cache';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { balanceAdjustment, budget, category, expense, goal, income, userAccount } from '@/db/schema';
import { getSessionUserId } from '@/lib/auth/getSessionUser';
import { getBudgets, getCategories, getIncome, getUserAccount, hasAnyTransactions } from '@/lib/data/queries';
import { estimateAnnualIncome } from '@/lib/stats';
import { generateId, generateTransId } from '@/lib/ids';
import type { PaymentMethod } from '@/types';
import type { CategoryItem } from '@/lib/data/mappers';

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

      // Side cash has no gross/net split - it is not taxed, so one amount
      // fills both columns.
      const grossToStore =
        input.category === 'Side Cash' ? input.netAmount : input.grossAmount;

      await db.insert(income).values({
        id: generateTransId(),
        userId,
        description: input.description.trim(),
        category: input.category,
        transactionDate: input.date,
        paymentMethod: input.paymentMethod,
        grossAmount: grossToStore,
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
  | { ok: true; budgets: Record<string, number>; annualIncome: number; categories: CategoryItem[] }
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
    const [budgets, income, categories] = await Promise.all([
      getBudgets(userId),
      getIncome(userId),
      getCategories(userId),
    ]);
    return { ok: true, budgets, annualIncome: estimateAnnualIncome(income), categories };
  } catch (error) {
    console.error('[pebble action] getBudgetModalDataAction', error);
    return { ok: false, error: 'Could not load your budgets. Please try again.' };
  }
}

const MAX_CATEGORY_NAME = 40;

function validateCategoryName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'A category needs a name.';
  if (trimmed.length > MAX_CATEGORY_NAME) return `Category names are limited to ${MAX_CATEGORY_NAME} characters.`;
  return null;
}

/**
 * Loads categories for the settings screen. Also triggers first-access
 * seeding, so a brand-new account opening settings gets its defaults.
 */
export type CategoriesResult =
  | { ok: true; categories: CategoryItem[] }
  | { ok: false; error: string };

export async function getCategoriesAction(): Promise<CategoriesResult> {
  try {
    const userId = await getSessionUserId();
    return { ok: true, categories: await getCategories(userId) };
  } catch (error) {
    console.error('[pebble action] getCategoriesAction', error);
    return { ok: false, error: 'Could not load your categories. Please try again.' };
  }
}

export async function createCategoryAction(input: {
  name: string;
  iconKey: string;
  color: string;
}): Promise<ActionResult> {
  try {
    const userId = await getSessionUserId();

    const nameError = validateCategoryName(input.name);
    if (nameError) return fail(nameError);

    const existing = await getCategories(userId);
    const trimmed = input.name.trim();
    if (existing.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
      return fail(`You already have a category called "${trimmed}".`);
    }

    await db.insert(category).values({
      id: generateId(),
      userId,
      name: trimmed,
      iconKey: input.iconKey,
      color: input.color,
      isSystem: false,
      sortOrder: existing.length,
    });

    revalidateAll();
    return { ok: true };
  } catch (error) {
    return handleUnexpected('createCategoryAction', error);
  }
}

/**
 * Renames and/or restyles a category.
 *
 * expense.category and budget.category store the NAME as text, so a rename
 * has to cascade. neon-http cannot hold an interactive transaction, so these
 * run as separate statements - ordered transactions first, category row last,
 * so a partial failure leaves the old name intact and the whole operation
 * safely retryable rather than half-applied.
 */
export async function updateCategoryAction(input: {
  id: string;
  name: string;
  iconKey: string;
  color: string;
}): Promise<ActionResult> {
  try {
    const userId = await getSessionUserId();

    const nameError = validateCategoryName(input.name);
    if (nameError) return fail(nameError);

    const existing = await getCategories(userId);
    const target = existing.find((c) => c.id === input.id);
    if (!target) return fail('That category no longer exists.');

    const trimmed = input.name.trim();
    const collision = existing.find(
      (c) => c.id !== input.id && c.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (collision) return fail(`You already have a category called "${trimmed}".`);

    if (target.isSystem && trimmed !== target.name) {
      return fail('The fallback category cannot be renamed, but you can change its icon and colour.');
    }

    if (trimmed !== target.name) {
      await db
        .update(expense)
        .set({ category: trimmed })
        .where(and(eq(expense.userId, userId), eq(expense.category, target.name)));

      await db
        .update(budget)
        .set({ category: trimmed })
        .where(and(eq(budget.userId, userId), eq(budget.category, target.name)));
    }

    await db
      .update(category)
      .set({ name: trimmed, iconKey: input.iconKey, color: input.color })
      .where(and(eq(category.userId, userId), eq(category.id, input.id)));

    revalidateAll();
    return { ok: true };
  } catch (error) {
    return handleUnexpected('updateCategoryAction', error);
  }
}

export interface CategoryUsageTransaction {
  id: string;
  description: string;
  date: string;
  amount: number;
}

export interface CategoryUsage {
  transactionCount: number;
  isSystem: boolean;
  transactions: CategoryUsageTransaction[];
}

export type CategoryUsageResult =
  | { ok: true; usage: CategoryUsage }
  | { ok: false; error: string };

/** Move every affected transaction to one destination category. */
export interface BulkReassignPlan {
  mode: 'bulk';
  reassignToName: string;
}

/** Assign each affected transaction its own destination category. */
export interface IndividualReassignPlan {
  mode: 'individual';
  assignments: Record<string, string>;
}

export type CategoryDeletePlan = BulkReassignPlan | IndividualReassignPlan | null;

/**
 * How many expenses reference a category. Drives the delete flow: with zero
 * transactions the category can be removed outright, otherwise the user has
 * to say where those transactions should go.
 */
export async function getCategoryUsageAction(categoryId: string): Promise<CategoryUsageResult> {
  try {
    const userId = await getSessionUserId();
    const existing = await getCategories(userId);
    const target = existing.find((c) => c.id === categoryId);
    if (!target) return { ok: false, error: 'That category no longer exists.' };

    const rows = await db
      .select({
        id: expense.id,
        description: expense.description,
        date: expense.transactionDate,
        amount: expense.amount,
      })
      .from(expense)
      .where(and(eq(expense.userId, userId), eq(expense.category, target.name)))
      .orderBy(desc(expense.transactionDate));

    return {
      ok: true,
      usage: {
        transactionCount: rows.length,
        isSystem: target.isSystem,
        transactions: rows,
      },
    };
  } catch (error) {
    console.error('[pebble action] getCategoryUsageAction', error);
    return { ok: false, error: 'Could not check that category. Please try again.' };
  }
}

/**
 * Deletes a category, reassigning any transactions that used it.
 *
 * Reassignment happens BEFORE the delete so a partial failure never leaves a
 * transaction pointing at a category that no longer exists - which would
 * render with a fallback icon and disappear from budget rollups.
 *
 * The system fallback category can never be deleted.
 */
export async function deleteCategoryAction(input: {
  id: string;
  plan: CategoryDeletePlan;
}): Promise<ActionResult> {
  try {
    const userId = await getSessionUserId();

    const existing = await getCategories(userId);
    const target = existing.find((c) => c.id === input.id);
    if (!target) return fail('That category no longer exists.');
    if (target.isSystem) return fail('The fallback category cannot be deleted.');

    const usage = await db
      .select({ id: expense.id })
      .from(expense)
      .where(and(eq(expense.userId, userId), eq(expense.category, target.name)));

    if (usage.length > 0) {
      const plan = input.plan;
      if (!plan) {
        return fail('Choose where these transactions should go before deleting.');
      }

      const validNames = new Set(
        existing.filter((c) => c.id !== target.id).map((c) => c.name),
      );

      if (plan.mode === 'bulk') {
        if (!validNames.has(plan.reassignToName)) {
          return fail('That destination category no longer exists.');
        }
        await db
          .update(expense)
          .set({ category: plan.reassignToName })
          .where(and(eq(expense.userId, userId), eq(expense.category, target.name)));
      } else {
        // Every affected transaction must be accounted for before anything is
        // written. A partial assignment would leave transactions pointing at a
        // category about to be deleted.
        for (const row of usage) {
          const destination = plan.assignments[row.id];
          if (!destination || !validNames.has(destination)) {
            return fail('Every transaction needs a destination category before deleting.');
          }
        }

        // Grouped by destination so this costs one statement per distinct
        // target rather than one per transaction - neon-http sends each
        // statement as its own HTTP round trip.
        const byDestination = new Map<string, string[]>();
        for (const row of usage) {
          const destination = plan.assignments[row.id];
          const list = byDestination.get(destination) ?? [];
          list.push(row.id);
          byDestination.set(destination, list);
        }

        for (const [destination, ids] of byDestination) {
          await db
            .update(expense)
            .set({ category: destination })
            .where(and(eq(expense.userId, userId), inArray(expense.id, ids)));
        }
      }
    }

    await db
      .delete(budget)
      .where(and(eq(budget.userId, userId), eq(budget.category, target.name)));

    await db
      .delete(category)
      .where(and(eq(category.userId, userId), eq(category.id, input.id)));

    revalidateAll();
    return { ok: true };
  } catch (error) {
    return handleUnexpected('deleteCategoryAction', error);
  }
}

/**
 * Editing a transaction.
 *
 * The date can never change. Changing it would move the transaction to a
 * different statement month, which is indistinguishable from deleting it and
 * creating a new one - and it would silently reshuffle the running balances
 * of every entry between the old and new dates.
 *
 * Amount, gross/net and payment method are locked outside the 13-month
 * window. Payment method counts as amount-affecting: switching Checking to
 * Cash moves money between two independent running balances.
 *
 * Description, category and tag stay editable forever - they carry no money.
 *
 * The window is enforced HERE, not only in the UI: the Reports page shows all
 * history and opens the same detail modal, so old transactions are reachable.
 */
export interface UpdateTransactionInput {
  id: string;
  type: 'expense' | 'income';
  description: string;
  category: string;
  tag?: string;
  date?: string;
  paymentMethod: PaymentMethod;
  amount?: number;
  grossAmount?: number;
  netAmount?: number;
}

export async function updateTransactionAction(
  input: UpdateTransactionInput,
): Promise<ActionResult> {
  try {
    const userId = await getSessionUserId();

    const table = input.type === 'expense' ? expense : income;
    const rows = await db
      .select({ id: table.id, date: table.transactionDate, paymentMethod: table.paymentMethod })
      .from(table)
      .where(and(eq(table.userId, userId), eq(table.id, input.id)))
      .limit(1);

    const current = rows[0];
    if (!current) return fail('That transaction no longer exists.');

    if (!PAYMENT_METHODS.includes(input.paymentMethod)) {
      return fail('Payment method must be Cash or Checking.');
    }

    // Every field except identity is editable at any age. No per-transaction
    // balance is ever stored - computeRecentTransactions rebuilds the whole
    // ledger from the opening balances on each render - so editing a
    // ten-year-old record recalculates exactly as correctly as today's.
    let newDate: string | undefined;
    if (input.date !== undefined && input.date !== current.date) {
      if (!DATE_PATTERN.test(input.date)) {
        return fail('Date must be in YYYY-MM-DD format.');
      }
      newDate = input.date;
    }

    if (input.type === 'expense') {
      if (!input.category.trim()) return fail('An expense needs a category.');

      const patch: Record<string, unknown> = {
        description: input.description.trim(),
        category: input.category,
        tag: input.tag?.trim() ?? '',
        paymentMethod: input.paymentMethod,
      };
      if (newDate) patch.transactionDate = newDate;

      if (input.amount !== undefined) {
        if (!isFiniteNumber(input.amount) || input.amount <= 0) {
          return fail('Expense amount must be a positive number.');
        }
        patch.amount = -Math.abs(input.amount);
      }

      await db.update(expense).set(patch)
        .where(and(eq(expense.userId, userId), eq(expense.id, input.id)));
    } else {
      if (!INCOME_CATEGORIES.includes(input.category)) {
        return fail('Income category must be Standard Income or Side Cash.');
      }

      const patch: Record<string, unknown> = {
        description: input.description.trim(),
        category: input.category,
        paymentMethod: input.paymentMethod,
      };
      if (newDate) patch.transactionDate = newDate;

      if (input.grossAmount !== undefined || input.netAmount !== undefined) {
        if (!isFiniteNumber(input.grossAmount) || input.grossAmount < 0) {
          return fail('Gross amount must be zero or greater.');
        }
        if (!isFiniteNumber(input.netAmount) || input.netAmount < 0) {
          return fail('Net amount must be zero or greater.');
        }
        // Side cash is untaxed, so there is no gross/net split: one amount
        // fills both columns. Enforced here rather than trusting the client,
        // where a stale gross from a form switch could persist.
        const net = input.netAmount;
        patch.grossAmount = input.category === 'Side Cash' ? net : input.grossAmount;
        patch.netAmount = net;
      }

      await db.update(income).set(patch)
        .where(and(eq(income.userId, userId), eq(income.id, input.id)));
    }

    revalidateAll();
    return { ok: true };
  } catch (error) {
    return handleUnexpected('updateTransactionAction', error);
  }
}

/**
 * Deletes a transaction outright, as if it had never been recorded.
 *
 * No balance repair is needed: computeRecentTransactions rebuilds the entire
 * ledger from the stored opening balances on every render, so every running
 * balance after this one corrects itself automatically. Nothing is stored
 * that could go stale.
 */
export async function deleteTransactionAction(input: {
  id: string;
  type: 'expense' | 'income';
}): Promise<ActionResult> {
  try {
    const userId = await getSessionUserId();

    const table = input.type === 'expense' ? expense : income;
    const rows = await db
      .select({ id: table.id })
      .from(table)
      .where(and(eq(table.userId, userId), eq(table.id, input.id)))
      .limit(1);

    if (!rows[0]) return fail('That transaction no longer exists.');

    await db.delete(table).where(and(eq(table.userId, userId), eq(table.id, input.id)));

    revalidateAll();
    return { ok: true };
  } catch (error) {
    return handleUnexpected('deleteTransactionAction', error);
  }
}

/**
 * Records a manual balance correction.
 *
 * Written to balance_adjustment, never to expense or income: an adjustment is
 * a correction, not a real-world transaction, and must not appear in Reports
 * where it would distort spending and income totals.
 *
 * `delta` is the signed change. The caller decides whether the user entered a
 * target balance (delta = target - current) or a direct amount.
 */
export async function createBalanceAdjustmentAction(input: {
  paymentMethod: PaymentMethod;
  delta: number;
  description: string;
  date: string;
}): Promise<ActionResult> {
  try {
    const userId = await getSessionUserId();

    if (!PAYMENT_METHODS.includes(input.paymentMethod)) {
      return fail('Payment method must be Cash or Checking.');
    }
    if (!isFiniteNumber(input.delta) || input.delta === 0) {
      return fail('Enter an amount that actually changes the balance.');
    }
    if (!DATE_PATTERN.test(input.date)) {
      return fail('Date must be in YYYY-MM-DD format.');
    }

    await db.insert(balanceAdjustment).values({
      id: generateTransId(),
      userId,
      description: input.description.trim() || 'Balance adjustment',
      transactionDate: input.date,
      paymentMethod: input.paymentMethod,
      amount: input.delta,
    });

    revalidateAll();
    return { ok: true };
  } catch (error) {
    return handleUnexpected('createBalanceAdjustmentAction', error);
  }
}

export async function deleteBalanceAdjustmentAction(input: { id: string }): Promise<ActionResult> {
  try {
    const userId = await getSessionUserId();

    const rows = await db
      .select({ id: balanceAdjustment.id, date: balanceAdjustment.transactionDate })
      .from(balanceAdjustment)
      .where(and(eq(balanceAdjustment.userId, userId), eq(balanceAdjustment.id, input.id)))
      .limit(1);

    if (!rows[0]) return fail('That adjustment no longer exists.');

    await db
      .delete(balanceAdjustment)
      .where(and(eq(balanceAdjustment.userId, userId), eq(balanceAdjustment.id, input.id)));

    revalidateAll();
    return { ok: true };
  } catch (error) {
    return handleUnexpected('deleteBalanceAdjustmentAction', error);
  }
}

export type BalanceModeResult =
  | { ok: true; hasTransactions: boolean; checkingOpening: number; cashOpening: number }
  | { ok: false; error: string };

/**
 * Tells the settings screen which balance UI to show: opening balances for a
 * brand-new account, manual adjustments once any transaction exists.
 */
export async function getBalanceModeAction(): Promise<BalanceModeResult> {
  try {
    const userId = await getSessionUserId();
    const [hasTransactions, account] = await Promise.all([
      hasAnyTransactions(userId),
      getUserAccount(userId),
    ]);
    return {
      ok: true,
      hasTransactions,
      checkingOpening: account.checkingOpening,
      cashOpening: account.cashOpening,
    };
  } catch (error) {
    console.error('[pebble action] getBalanceModeAction', error);
    return { ok: false, error: 'Could not load your balance settings.' };
  }
}
