'use server';

import { revalidatePath } from 'next/cache';
import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import { db } from '@/db';
import {
  balanceAdjustment,
  budget,
  category,
  expense,
  goal,
  income,
  recurringRule,
  userAccount,
} from '@/db/schema';
import { withSessionUser } from '@/lib/actions/withSessionUser';
import { getBalanceAdjustments, getBudgets, getCategories, getExpenses, getGoals, getIncome, getUserAccount, hasAnyTransactions } from '@/lib/data/queries';
import { computeCurrentBalances, estimateAnnualIncome, mergeTransactions } from '@/lib/stats';
import { generateId, generateTransId } from '@/lib/ids';
import type {
  PaymentMethod,
  RecurringEndMode,
  RecurringFrequency,
  RecurringKind,
} from '@/types';
import { addDays, todayInZone } from '@/lib/recurring/occurrences';
import { resolveUserTimeZone } from '@/lib/time/serverTimeZone';
import { FALLBACK_TIME_ZONE } from '@/lib/time/timeZone';
import type { CategoryItem } from '@/lib/data/mappers';
import type { FailureKind } from '@/lib/actions/failureKind';

/**
 * Mutation layer.
 *
 * SECURITY: src/proxy.ts returns early for any request carrying the
 * Next-Action header, so Server Actions are NOT covered by auth middleware.
 * withSessionUser() is the ONLY thing standing between an unauthenticated
 * POST and a write.
 *
 * Every action is therefore exported wrapped in withSessionUser(), in the
 * block at the bottom of this file. The wrapper resolves the session and
 * passes userId into the handler, so a handler cannot run - or be written -
 * without a session check. An export that is not a withSessionUser() call is
 * an unauthenticated write endpoint. Do not add one.
 *
 * No action accepts a userId parameter. It is always resolved from the
 * session. Do not add one.
 *
 * Actions return a result object rather than throwing: an uncaught throw in a
 * Server Action surfaces in production as an opaque error digest, which helps
 * nobody. Errors are logged server-side and returned as a message.
 */

export type ActionResult = { ok: true } | { ok: false; error: string; kind?: FailureKind };

const PAYMENT_METHODS: readonly string[] = ['Cash', 'Checking'];
const INCOME_CATEGORIES: readonly string[] = ['Standard Income', 'Side Cash'];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const MUTATED_ROUTES = ['/dashboard', '/transactions', '/reports', '/budgets', '/goals', '/scheduled', '/settings'];

function revalidateAll(): void {
  for (const route of MUTATED_ROUTES) {
    revalidatePath(route, 'layout');
  }
}

/**
 * Defaults to 'validation' because that is what every current call site is:
 * a rejected input, reported with the specific field problem. A retry of the
 * same input would fail identically, so these must NOT offer "Try again".
 */
function fail(message: string, kind: FailureKind = 'validation'): ActionResult {
  return { ok: false, error: message, kind };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Distinguishes "could not reach the database" from "the database refused
 * this", which the user experiences as two completely different events.
 *
 * The discriminator is NeonDbError.code, the SQLSTATE. A statement the server
 * actually processed and rejected carries one; a connection that never
 * completed - Neon suspended and slow to wake, network gone, fetch rejected -
 * does not. Matched on `name` rather than instanceof: a duplicate copy of the
 * driver in the module graph would break identity, and misclassifying a real
 * outage as an unknown bug is the failure mode worth guarding against.
 *
 * SQLSTATE class 08 is connection exception, 53 insufficient resources, 57
 * operator intervention (includes admin shutdown). All are "the database is
 * not currently able to serve you", not "your data was wrong".
 */
function classifyError(error: unknown): FailureKind {
  const name = (error as { name?: unknown } | null)?.name;

  if (name === 'NeonDbError') {
    const code = (error as { code?: unknown }).code;
    if (typeof code !== 'string') return 'database';
    const sqlStateClass = code.slice(0, 2);
    if (sqlStateClass === '08' || sqlStateClass === '53' || sqlStateClass === '57') return 'database';
    return 'unknown';
  }

  // A rejected fetch surfaces as TypeError before the driver ever sees it.
  if (name === 'TypeError' || name === 'AbortError') return 'database';

  return 'unknown';
}

/**
 * Logs the real error server-side and returns a safe message. Raw Postgres
 * errors can echo query fragments, so they are never sent to the client -
 * only the classification is.
 *
 * The 'database' wording states plainly that nothing was saved. That claim is
 * only honest here, where the error was caught server-side: the request
 * reached this process and the write did not complete. The client-side
 * transport case in callAction.ts cannot claim as much, and does not.
 */
function handleUnexpected(context: string, error: unknown): ActionResult {
  const kind = classifyError(error);
  console.error(`[pebble action] ${context} (${kind})`, error);

  return kind === 'database'
    ? fail("Couldn't reach the database. Your change was not saved.", 'database')
    : fail('Something went wrong saving your changes. Please try again.', 'unknown');
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
async function addTransaction(
  userId: string,
  input: AddTransactionActionInput,
): Promise<ActionResult> {
  try {
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
      // Net above gross would mean more money arrived than was earned. The
      // column checks only constrain each amount independently, so this
      // cross-column rule has to live here. Skipped for Side Cash, where the
      // two columns are deliberately set equal below.
      if (input.category !== 'Side Cash' && input.netAmount > input.grossAmount) {
        return fail('Pay after deductions cannot be more than pay before deductions.');
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

async function addGoal(userId: string, input: AddGoalActionInput): Promise<ActionResult> {
  try {
    if (!input.name.trim()) {
      return fail('A goal needs a name.');
    }
    if (!isFiniteNumber(input.target) || input.target <= 0) {
      return fail('Target amount must be greater than zero.');
    }
    if (!isFiniteNumber(input.current) || input.current < 0) {
      return fail('Saved amount cannot be negative.');
    }
    // target_date is a text column, so nothing at the database level stops a
    // free-text value landing in it. The same pattern guard the transaction
    // actions use is the only thing keeping it a real date.
    if (!DATE_PATTERN.test(input.date.trim())) {
      return fail('Target date must be a valid date.');
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

export interface UpdateGoalActionInput extends AddGoalActionInput {
  id: string;
}

/**
 * Edits a goal, including how much of the balance it has set aside.
 *
 * current_amount is set directly rather than accumulated through a
 * contribution history: a goal holds no real money, it records a share of the
 * one real balance that has been mentally set aside. There is nothing to
 * reconcile, so there is nothing to keep a ledger of.
 *
 * Deliberately imposes no ceiling on current. Allocating past the target is
 * normal (people overshoot), and allocating past the account balance is
 * allowed too - the goals page surfaces that as a negative "unallocated"
 * figure rather than refusing the edit. Warn, never block.
 */
async function updateGoal(userId: string, input: UpdateGoalActionInput): Promise<ActionResult> {
  try {
    // Ownership check before the write: the id arrives from the client, and
    // withSessionUser only guarantees WHO is asking, not WHAT they own.
    const rows = await db
      .select({ id: goal.id })
      .from(goal)
      .where(and(eq(goal.userId, userId), eq(goal.id, input.id)))
      .limit(1);

    if (!rows[0]) return fail('That goal no longer exists.');

    // Same guards as addGoal, kept in step so an edit cannot store a shape the
    // add path would have rejected.
    if (!input.name.trim()) {
      return fail('A goal needs a name.');
    }
    if (!isFiniteNumber(input.target) || input.target <= 0) {
      return fail('Target amount must be greater than zero.');
    }
    if (!isFiniteNumber(input.current) || input.current < 0) {
      return fail('Saved amount cannot be negative.');
    }
    if (!DATE_PATTERN.test(input.date.trim())) {
      return fail('Target date must be a valid date.');
    }

    await db.update(goal).set({
      name: input.name.trim(),
      currentAmount: input.current,
      targetAmount: input.target,
      targetDate: input.date.trim(),
      iconKey: input.iconKey,
      color: input.color,
    }).where(and(eq(goal.userId, userId), eq(goal.id, input.id)));

    revalidateAll();
    return { ok: true };
  } catch (error) {
    return handleUnexpected('updateGoalAction', error);
  }
}

/**
 * Deletes a goal outright.
 *
 * No balance repair is needed and no money moves: the goal only ever recorded
 * a soft claim on the existing balance, so removing it just returns that
 * amount to the unallocated figure.
 */
async function deleteGoal(userId: string, input: { id: string }): Promise<ActionResult> {
  try {
    const rows = await db
      .select({ id: goal.id })
      .from(goal)
      .where(and(eq(goal.userId, userId), eq(goal.id, input.id)))
      .limit(1);

    if (!rows[0]) return fail('That goal no longer exists.');

    await db.delete(goal).where(and(eq(goal.userId, userId), eq(goal.id, input.id)));

    revalidateAll();
    return { ok: true };
  } catch (error) {
    return handleUnexpected('deleteGoalAction', error);
  }
}

/**
 * Upserts one row per category. A budget set to 0 is deleted rather than
 * stored, keeping "unset" and "explicitly zero" from accumulating as
 * indistinguishable rows.
 */
async function modifyBudgets(
  userId: string,
  budgets: Record<string, number>,
): Promise<ActionResult> {
  try {
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
async function setOpeningBalances(
  userId: string,
  input: { checkingOpening: number; cashOpening: number },
): Promise<ActionResult> {
  try {
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
  | { ok: false; error: string; kind?: FailureKind };

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
async function loadBudgetModalData(userId: string): Promise<BudgetModalData> {
  try {
    const [budgets, income, categories] = await Promise.all([
      getBudgets(userId),
      getIncome(userId),
      getCategories(userId),
    ]);
    return { ok: true, budgets, annualIncome: estimateAnnualIncome(income), categories };
  } catch (error) {
    console.error('[pebble action] getBudgetModalDataAction', error);
    return { ok: false, error: "Couldn't reach the database to load your budgets.", kind: classifyError(error) === 'database' ? 'database' : 'unknown' };
  }
}

export type AllocationSummaryResult =
  | { ok: true; totalBalance: number; allocated: number }
  | { ok: false; error: string; kind?: FailureKind };

/**
 * Current total balance and the amount goals have claimed against it, for the
 * overspend check on the transaction save paths.
 *
 * Fetched at save time rather than passed down as props. The transaction
 * modals mount in AppShell, above any page that loads goals, so props would
 * mean new plumbing regardless - and a value read when the modal opened could
 * be stale by the time it is submitted. One extra round trip on a save that
 * already makes one is the cheaper trade.
 *
 * Returns the two raw figures rather than a verdict: the caller knows the
 * transaction's delta, and keeping the arithmetic there means this action does
 * not need to understand adds versus edits.
 */
async function loadAllocationSummary(userId: string): Promise<AllocationSummaryResult> {
  try {
    const [expenses, incomeRows, openingBalances, adjustments, goals] = await Promise.all([
      getExpenses(userId),
      getIncome(userId),
      getUserAccount(userId),
      getBalanceAdjustments(userId),
      getGoals(userId),
    ]);

    const balances = computeCurrentBalances(
      mergeTransactions(expenses, incomeRows),
      openingBalances.checkingOpening,
      openingBalances.cashOpening,
      adjustments,
    );

    return {
      ok: true,
      totalBalance: balances.total,
      allocated: goals.reduce((sum, g) => sum + g.current, 0),
    };
  } catch (error) {
    console.error('[pebble action] getAllocationSummaryAction', error);
    return { ok: false, error: "Couldn't check your goal allocations.", kind: classifyError(error) === 'database' ? 'database' : 'unknown' };
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
  | { ok: false; error: string; kind?: FailureKind };

async function loadCategories(userId: string): Promise<CategoriesResult> {
  try {
    return { ok: true, categories: await getCategories(userId) };
  } catch (error) {
    console.error('[pebble action] getCategoriesAction', error);
    return { ok: false, error: "Couldn't reach the database to load your categories.", kind: classifyError(error) === 'database' ? 'database' : 'unknown' };
  }
}

async function createCategory(
  userId: string,
  input: { name: string; iconKey: string; color: string },
): Promise<ActionResult> {
  try {
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
async function updateCategory(
  userId: string,
  input: { id: string; name: string; iconKey: string; color: string },
): Promise<ActionResult> {
  try {
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

      // recurring_rule.category stores the NAME too, so it has to cascade with
      // the others. Without this a rule keeps stamping the OLD name onto every
      // transaction it materializes - and those rows then vanish from the
      // category breakdown chart while still counting in totals. Silent, and
      // only visible weeks later. Soft-deleted rules are included so a later
      // undelete cannot resurrect a stale name.
      await db
        .update(recurringRule)
        .set({ category: trimmed })
        .where(and(eq(recurringRule.userId, userId), eq(recurringRule.category, target.name)));
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
  | { ok: false; error: string; kind?: FailureKind };

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
async function loadCategoryUsage(
  userId: string,
  categoryId: string,
): Promise<CategoryUsageResult> {
  try {
    const existing = await getCategories(userId);
    const target = existing.find((c) => c.id === categoryId);
    if (!target) return { ok: false, error: 'That category no longer exists.', kind: 'notFound' };

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
    return { ok: false, error: "Couldn't check that category.", kind: classifyError(error) === 'database' ? 'database' : 'unknown' };
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
async function deleteCategory(
  userId: string,
  input: { id: string; plan: CategoryDeletePlan },
): Promise<ActionResult> {
  try {
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

    // Recurring rules are forward-looking instructions, not history, so they
    // cannot be left pointing at a category that is about to disappear.
    //
    // Bulk reassign: the user has already named one destination for everything
    // in this category, so applying it to rules matches their intent.
    // Otherwise: refuse. Silently repointing a rule at the fallback category
    // would misfile every FUTURE payment it creates, indefinitely and
    // invisibly - much worse than making the user decide now.
    const referencingRules = await db
      .select({ id: recurringRule.id, description: recurringRule.description })
      .from(recurringRule)
      .where(
        and(
          eq(recurringRule.userId, userId),
          eq(recurringRule.category, target.name),
          ne(recurringRule.status, 'deleted'),
        ),
      );

    if (referencingRules.length > 0) {
      const plan = input.plan;

      if (plan && plan.mode === 'bulk') {
        const stillValid = existing.some(
          (c) => c.id !== target.id && c.name === plan.reassignToName,
        );
        if (!stillValid) return fail('That destination category no longer exists.');

        await db
          .update(recurringRule)
          .set({ category: plan.reassignToName })
          .where(
            and(
              eq(recurringRule.userId, userId),
              eq(recurringRule.category, target.name),
              ne(recurringRule.status, 'deleted'),
            ),
          );
      } else {
        const names = referencingRules.map((r) => r.description).join(', ');
        return fail(
          `These scheduled payments still use this category: ${names}. Update or remove them first.`,
        );
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

async function updateTransaction(
  userId: string,
  input: UpdateTransactionInput,
): Promise<ActionResult> {
  try {
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
        // Net above gross would mean more money arrived than was earned. The
        // column checks constrain each amount independently, so this
        // cross-column rule has to live here. Skipped for Side Cash, where the
        // two columns are deliberately set equal just below.
        if (input.category !== 'Side Cash' && input.netAmount > input.grossAmount) {
          return fail('Pay after deductions cannot be more than pay before deductions.');
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
async function deleteTransaction(
  userId: string,
  input: { id: string; type: 'expense' | 'income' },
): Promise<ActionResult> {
  try {
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
async function createBalanceAdjustment(
  userId: string,
  input: {
    paymentMethod: PaymentMethod;
    delta: number;
    description: string;
    date: string;
  },
): Promise<ActionResult> {
  try {
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

async function deleteBalanceAdjustment(
  userId: string,
  input: { id: string },
): Promise<ActionResult> {
  try {
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
  | { ok: false; error: string; kind?: FailureKind };


/* ---------------------------------------------------------------------------
 * Scheduled & recurring payment rules
 *
 * A rule is a TEMPLATE. The transactions it produces are ordinary expense /
 * income rows, materialized by runRecurringCatchUp() on page load.
 *
 * These handlers NEVER write materializedThrough. That is the high-water mark
 * catch-up uses, and it only ever moves forward - which is precisely what makes
 * "editing a rule affects future occurrences only" structural rather than
 * remembered. There is no code path here that can rewrite history.
 * ------------------------------------------------------------------------- */

const RECURRING_FREQUENCIES: readonly string[] = ['once', 'weekly', 'biweekly', 'monthly', 'yearly'];
const RECURRING_END_MODES: readonly string[] = ['never', 'after', 'on'];

/** Guard against a typo like 5000 occurrences of a weekly rule. */
const MAX_END_COUNT = 1000;

export interface RecurringRuleActionInput {
  kind: RecurringKind;
  description: string;
  /** Expense: a category name owned by the user. Income: Standard Income | Side Cash. */
  category: string;
  /** Expense only - the income table has no tag column. */
  tag?: string;
  paymentMethod: PaymentMethod;
  /**
   * POSITIVE MAGNITUDE, always. Expense amounts are negated here so the form
   * never has to reason about sign. For income this is the NET amount.
   */
  amount: number;
  /** Income only, and required there. */
  grossAmount?: number;
  frequency: RecurringFrequency;
  startDate: string;
  endMode: RecurringEndMode;
  endCount?: number | null;
  endDate?: string | null;
  /**
   * CREATE ONLY. False (default) starts the rule from today, ignoring past
   * occurrences - the safe default, since a rule with a start date years back
   * would otherwise materialize history the user most likely already imported.
   * True materializes every occurrence since startDate.
   */
  backfill?: boolean;
}

export interface UpdateRecurringRuleActionInput extends RecurringRuleActionInput {
  id: string;
}

interface NormalizedRule {
  kind: RecurringKind;
  description: string;
  category: string;
  tag: string | null;
  paymentMethod: PaymentMethod;
  amount: number;
  grossAmount: number | null;
  frequency: RecurringFrequency;
  startDate: string;
  endMode: RecurringEndMode;
  endCount: number | null;
  endDate: string | null;
}

/**
 * Validates and normalizes rule input.
 *
 * Mirrors every database CHECK on recurring_rule so a bad shape is reported as
 * a readable message rather than a raw constraint violation. The CHECKs remain
 * the real guarantee; this is the friendly layer in front of them.
 */
async function normalizeRuleInput(
  userId: string,
  input: RecurringRuleActionInput,
): Promise<{ ok: true; values: NormalizedRule } | { ok: false; error: string; kind?: FailureKind }> {
  const description = input.description.trim();
  if (!description) return { ok: false, error: 'A scheduled payment needs a description.' };

  if (input.kind !== 'expense' && input.kind !== 'income') {
    return { ok: false, error: 'Select whether this is an expense or income.' };
  }
  if (!PAYMENT_METHODS.includes(input.paymentMethod)) {
    return { ok: false, error: 'Select a valid payment method.' };
  }
  if (!RECURRING_FREQUENCIES.includes(input.frequency)) {
    return { ok: false, error: 'Select a valid frequency.' };
  }
  if (!RECURRING_END_MODES.includes(input.endMode)) {
    return { ok: false, error: 'Select a valid end condition.' };
  }
  if (!DATE_PATTERN.test(input.startDate)) {
    return { ok: false, error: 'Start date must be in YYYY-MM-DD format.' };
  }
  if (!isFiniteNumber(input.amount) || input.amount <= 0) {
    return { ok: false, error: 'Amount must be greater than zero.' };
  }

  // End condition: exactly one shape, fully specified.
  let endCount: number | null = null;
  let endDate: string | null = null;

  if (input.endMode === 'after') {
    const count = input.endCount;
    if (!isFiniteNumber(count) || !Number.isInteger(count) || count < 1) {
      return { ok: false, error: 'Number of payments must be a whole number of at least 1.' };
    }
    if (count > MAX_END_COUNT) {
      return { ok: false, error: `Number of payments cannot exceed ${MAX_END_COUNT}.` };
    }
    endCount = count;
  } else if (input.endMode === 'on') {
    const date = input.endDate?.trim() ?? '';
    if (!DATE_PATTERN.test(date)) {
      return { ok: false, error: 'End date must be in YYYY-MM-DD format.' };
    }
    if (date < input.startDate) {
      return { ok: false, error: 'End date cannot be before the start date.' };
    }
    endDate = date;
  }

  // 'once' is stored as a one-shot so the occurrence generator has exactly one
  // code path. Enforced by CHECK too; normalized here so the form need not know.
  let frequency = input.frequency;
  let endMode = input.endMode;
  if (frequency === 'once') {
    endMode = 'after';
    endCount = 1;
    endDate = null;
  }

  if (input.kind === 'income') {
    if (!INCOME_CATEGORIES.includes(input.category)) {
      return { ok: false, error: 'Income must be Standard Income or Side Cash.' };
    }
    const gross = input.grossAmount;
    if (!isFiniteNumber(gross) || gross <= 0) {
      return { ok: false, error: 'Gross amount must be greater than zero.' };
    }
    if (input.amount > gross) {
      return { ok: false, error: 'Net amount cannot be more than the gross amount.' };
    }
    return {
      ok: true,
      values: {
        kind: 'income',
        description,
        category: input.category,
        // The income table has no tag column, and a CHECK enforces NULL here.
        tag: null,
        paymentMethod: input.paymentMethod,
        amount: input.amount,
        grossAmount: gross,
        frequency,
        startDate: input.startDate,
        endMode,
        endCount,
        endDate,
      },
    };
  }

  // Expense: the category must actually belong to this user. expense.category
  // stores the NAME as text, so an unrecognised name would silently drop the
  // transaction out of the category breakdown chart while still counting in
  // totals - a bug that is very hard to spot after the fact.
  const categoryName = input.category.trim();
  const owned = await db
    .select({ name: category.name })
    .from(category)
    .where(and(eq(category.userId, userId), eq(category.name, categoryName)))
    .limit(1);

  if (!owned[0]) return { ok: false, error: 'Select a valid category.' };

  return {
    ok: true,
    values: {
      kind: 'expense',
      description,
      category: categoryName,
      tag: input.tag?.trim() || null,
      paymentMethod: input.paymentMethod,
      // Stored negative, matching expense.amount and its CHECK (amount <= 0).
      amount: -Math.abs(input.amount),
      grossAmount: null,
      frequency,
      startDate: input.startDate,
      endMode,
      endCount,
      endDate,
    },
  };
}

async function createRecurringRule(
  userId: string,
  input: RecurringRuleActionInput,
): Promise<ActionResult> {
  try {
    const normalized = await normalizeRuleInput(userId, input);
    if (!normalized.ok) return fail(normalized.error);

    // A start date in the past would otherwise backfill on the next page load.
    // Setting the mark to yesterday starts the rule from today instead. Because
    // the mark only ever moves forward, this is a create-time decision that a
    // later edit cannot accidentally reverse.
    // Falls back only if the cookie is somehow absent during an action, which
    // should not happen - the user has the app open by definition. Worst case
    // the rule starts a day off, not a wrongly dated transaction.
    const today = todayInZone((await resolveUserTimeZone()) ?? FALLBACK_TIME_ZONE);
    const materializedThrough =
      input.backfill === true || normalized.values.startDate >= today
        ? null
        : addDays(today, -1);

    await db.insert(recurringRule).values({
      id: generateId(),
      userId,
      ...normalized.values,
      materializedThrough,
    });

    revalidateAll();
    return { ok: true };
  } catch (error) {
    return handleUnexpected('createRecurringRuleAction', error);
  }
}

/**
 * Edits a rule. Future occurrences only - already-materialized transactions are
 * historical fact and are never rewritten.
 *
 * Changing the schedule can produce occurrence dates that collide with rows
 * already materialized for this rule. That is safe: catch-up inserts with
 * ON CONFLICT (recurring_rule_id, occurrence_date) DO NOTHING, so a collision
 * is skipped rather than duplicated or overwritten.
 */
async function updateRecurringRule(
  userId: string,
  input: UpdateRecurringRuleActionInput,
): Promise<ActionResult> {
  try {
    // Ownership check before the write: the id arrives from the client, and
    // withSessionUser only guarantees WHO is asking, not WHAT they own.
    const rows = await db
      .select({ id: recurringRule.id, kind: recurringRule.kind, status: recurringRule.status })
      .from(recurringRule)
      .where(and(eq(recurringRule.userId, userId), eq(recurringRule.id, input.id)))
      .limit(1);

    const existing = rows[0];
    if (!existing || existing.status === 'deleted') {
      return fail('That scheduled payment no longer exists.');
    }

    // Expense history lives in `expense`, income history in `income`. Switching
    // kind would orphan every row already materialized from this rule.
    if (existing.kind !== input.kind) {
      return fail('A scheduled payment cannot be switched between expense and income. Delete it and create a new one.');
    }

    const normalized = await normalizeRuleInput(userId, input);
    if (!normalized.ok) return fail(normalized.error);

    // materializedThrough is deliberately absent from this SET clause.
    await db
      .update(recurringRule)
      .set({ ...normalized.values, updatedAt: new Date().toISOString() })
      .where(and(eq(recurringRule.userId, userId), eq(recurringRule.id, input.id)));

    revalidateAll();
    return { ok: true };
  } catch (error) {
    return handleUnexpected('updateRecurringRuleAction', error);
  }
}

/**
 * Pause or resume. Pausing removes the rule from catch-up while preserving
 * materializedThrough, so resuming does NOT fill in the paused period - it
 * simply carries on from today.
 */
async function setRecurringRuleStatus(
  userId: string,
  input: { id: string; status: 'active' | 'paused' },
): Promise<ActionResult> {
  try {
    if (input.status !== 'active' && input.status !== 'paused') {
      return fail('Invalid status.');
    }

    const rows = await db
      .select({ id: recurringRule.id, status: recurringRule.status })
      .from(recurringRule)
      .where(and(eq(recurringRule.userId, userId), eq(recurringRule.id, input.id)))
      .limit(1);

    if (!rows[0] || rows[0].status === 'deleted') {
      return fail('That scheduled payment no longer exists.');
    }

    // Resuming after a long pause must not backfill the gap. The mark is left
    // alone, then advanced to today so catch-up skips the paused period.
    const patch =
      input.status === 'active'
        ? {
            status: 'active',
            materializedThrough: todayInZone((await resolveUserTimeZone()) ?? FALLBACK_TIME_ZONE),
            updatedAt: new Date().toISOString(),
          }
        : { status: 'paused', updatedAt: new Date().toISOString() };

    await db
      .update(recurringRule)
      .set(patch)
      .where(and(eq(recurringRule.userId, userId), eq(recurringRule.id, input.id)));

    revalidateAll();
    return { ok: true };
  } catch (error) {
    return handleUnexpected('setRecurringRuleStatusAction', error);
  }
}

/**
 * SOFT delete. The row stays, hidden everywhere and excluded from catch-up.
 *
 * A hard delete would fire ON DELETE SET NULL and strip the rule link off real
 * historical transactions, and recreating an identical rule afterwards would
 * re-materialize its entire past from a null high-water mark. Neither is
 * possible this way. Transactions already created are always left in place -
 * they are historical fact, not a pending schedule.
 */
async function deleteRecurringRule(
  userId: string,
  input: { id: string },
): Promise<ActionResult> {
  try {
    const rows = await db
      .select({ id: recurringRule.id, status: recurringRule.status })
      .from(recurringRule)
      .where(and(eq(recurringRule.userId, userId), eq(recurringRule.id, input.id)))
      .limit(1);

    if (!rows[0] || rows[0].status === 'deleted') {
      return fail('That scheduled payment no longer exists.');
    }

    await db
      .update(recurringRule)
      .set({ status: 'deleted', updatedAt: new Date().toISOString() })
      .where(and(eq(recurringRule.userId, userId), eq(recurringRule.id, input.id)));

    revalidateAll();
    return { ok: true };
  } catch (error) {
    return handleUnexpected('deleteRecurringRuleAction', error);
  }
}

/**
 * Tells the settings screen which balance UI to show: opening balances for a
 * brand-new account, manual adjustments once any transaction exists.
 */
async function loadBalanceMode(userId: string): Promise<BalanceModeResult> {
  try {
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
    return { ok: false, error: "Couldn't reach the database to load your balance settings.", kind: classifyError(error) === 'database' ? 'database' : 'unknown' };
  }
}

/* -------------------------------------------------------------------------
 * Exported actions
 *
 * Every action is exported from here, and only from here, wrapped in
 * withSessionUser(). The wrapper resolves the session and hands userId to the
 * handler, so a handler cannot run - or be written - without a session check.
 *
 * This list is the audit surface for that invariant: an export that is not a
 * withSessionUser() call is a bug, and is visible at a glance.
 *
 * ---------------------------------------------------------------------- */

export const addTransactionAction = withSessionUser(addTransaction);
export const addGoalAction = withSessionUser(addGoal);
export const updateGoalAction = withSessionUser(updateGoal);
export const deleteGoalAction = withSessionUser(deleteGoal);
export const getAllocationSummaryAction = withSessionUser(loadAllocationSummary);
export const setOpeningBalancesAction = withSessionUser(setOpeningBalances);
export const getCategoriesAction = withSessionUser(loadCategories);
export const updateTransactionAction = withSessionUser(updateTransaction);
export const deleteTransactionAction = withSessionUser(deleteTransaction);
export const createBalanceAdjustmentAction = withSessionUser(createBalanceAdjustment);
export const deleteBalanceAdjustmentAction = withSessionUser(deleteBalanceAdjustment);
export const modifyBudgetsAction = withSessionUser(modifyBudgets);
export const getBudgetModalDataAction = withSessionUser(loadBudgetModalData);
export const createCategoryAction = withSessionUser(createCategory);
export const updateCategoryAction = withSessionUser(updateCategory);
export const getCategoryUsageAction = withSessionUser(loadCategoryUsage);
export const deleteCategoryAction = withSessionUser(deleteCategory);
export const getBalanceModeAction = withSessionUser(loadBalanceMode);
export const createRecurringRuleAction = withSessionUser(createRecurringRule);
export const updateRecurringRuleAction = withSessionUser(updateRecurringRule);
export const setRecurringRuleStatusAction = withSessionUser(setRecurringRuleStatus);
export const deleteRecurringRuleAction = withSessionUser(deleteRecurringRule);
