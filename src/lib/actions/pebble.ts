'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { db, neonSql } from '@/db';
import {
  account,
  balanceAdjustment,
  budget,
  category,
  expense,
  goal,
  income,
  recurringRule,
  userAccount,
  userInNeonAuth,
} from '@/db/schema';
import { withSessionUser } from '@/lib/actions/withSessionUser';
import { getBalanceAdjustments, getBudgets, getCategories, getExpenses, getGoals, getIncome, hasAnyTransactions, getAccounts } from '@/lib/data/queries';
import { computeCurrentBalances, mergeTransactions } from '@/lib/stats';
import { estimateAnnualIncomeTrailing12, type AnnualIncomeEstimate } from '@/lib/analysis/annualIncome';
import { isYmd } from '@/lib/recurring/occurrences';
import { generateId, generateTransId } from '@/lib/ids';
import { addToGoalGuarded } from '@/lib/data/goalAllocation';
import { userWriteLockStatement } from '@/lib/data/userWriteLock';
import { getSessionLocations, type SessionLocation } from '@/lib/data/sessionLocation';
import type {
  PaymentMethod,
  RecurringEndMode,
  RecurringFrequency,
  RecurringKind,
} from '@/types';
import { addDays, todayInZone } from '@/lib/recurring/occurrences';
import { resolveUserTimeZone } from '@/lib/time/serverTimeZone';
import { FALLBACK_TIME_ZONE } from '@/lib/time/timeZone';
import type { CategoryItem, Account } from '@/lib/data/mappers';
import type { FailureKind } from '@/lib/actions/failureKind';
import type { ServerErrorCode } from '@/lib/actions/errorCodes';
import { isValidTimeZone } from '@/lib/time/timeZone';
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

export type ActionResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      kind?: FailureKind;
      /**
       * Machine-readable identifier for this failure, added incrementally
       * (Phase 3d). Absent means "not yet converted" - the client falls back
       * to `error`, the server's own English string, which is always present
       * and always safe to show. Purely additive: every existing fail(...)
       * call site keeps compiling and keeps working exactly as before.
       */
      code?: ServerErrorCode;
      /**
       * Raw, UNTRANSLATED values referenced by the code's template - a
       * category name, a list of rule descriptions. Never pre-formatted or
       * pre-joined here: a list is joined with a locale-appropriate
       * separator on the CLIENT, in translateActionError(), because English
       * and Chinese join lists differently and the server has no business
       * deciding that.
       */
      params?: Record<string, string | string[]>;
    };

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
function fail(
  message: string,
  kind: FailureKind = 'validation',
  code?: ServerErrorCode,
  params?: Record<string, string | string[]>,
): ActionResult {
  return { ok: false, error: message, kind, code, params };
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
 *
 * The real NeonDbError can also arrive nested under `.cause` on an outer
 * error (name "Error") rather than as the top-level error itself. Checked
 * two levels deep - error, error.cause, error.cause.cause - matching what has
 * actually been observed, not walked to arbitrary depth.
 */
function classifyDbErrorLike(error: unknown): FailureKind | null {
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

  return null;
}

function classifyError(error: unknown): FailureKind {
  const direct = classifyDbErrorLike(error);
  if (direct !== null) return direct;

  const cause = (error as { cause?: unknown } | null)?.cause;
  if (cause !== undefined && cause !== null) {
    const fromCause = classifyDbErrorLike(cause);
    if (fromCause !== null) return fromCause;

    const nestedCause = (cause as { cause?: unknown } | null)?.cause;
    if (nestedCause !== undefined && nestedCause !== null) {
      const fromNestedCause = classifyDbErrorLike(nestedCause);
      if (fromNestedCause !== null) return fromNestedCause;
    }
  }

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
    ? fail("Couldn't reach the database. Your change was not saved.", 'database', 'action.databaseUnreachable')
    : fail('Something went wrong saving your changes. Please try again.', 'unknown', 'action.unknownError');
}

export interface AddExpenseActionInput {
  type: 'expense';
  description: string;
  date: string;
  accountId: string;
  category: string;
  tag?: string;
  amount: number;
}

export interface AddIncomeActionInput {
  type: 'income';
  description: string;
  date: string;
  accountId: string;
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
      return fail('Date must be in YYYY-MM-DD format.', 'validation', 'validation.dateFormat');
    }

    // Ownership check before any write: the id arrives from the client, and
    // withSessionUser guarantees WHO is asking, not WHAT they own.
    //
    // Active only. A closed account is settled at zero permanently and takes
    // no new activity - editing an EXISTING transaction on one is handled
    // separately, where the account is shown locked rather than selectable.
    const owned = await db
      .select({ id: account.id, status: account.status, name: account.name })
      .from(account)
      .where(and(eq(account.userId, userId), eq(account.id, input.accountId)))
      .limit(1);

    const targetAccount = owned[0];
    if (!targetAccount || targetAccount.status !== 'active') {
      return fail('That account no longer exists.', 'validation', 'notFound.account');
    }

    if (input.type === 'expense') {
      if (!isFiniteNumber(input.amount) || input.amount <= 0) {
        return fail('Expense amount must be a positive number.', 'validation', 'validation.expenseAmountPositive');
      }
      if (!input.category.trim()) {
        return fail('An expense needs a category.', 'validation', 'validation.expenseCategoryRequired');
      }

      await db.insert(expense).values({
        id: generateTransId(),
        userId,
        accountId: targetAccount.id,
        description: input.description.trim(),
        category: input.category,
        tag: input.tag?.trim() ?? '',
        transactionDate: input.date,
        // Legacy reconciliation trail only - carries the account name now
        // that accounts are user-defined. Never read for logic.
        paymentMethod: targetAccount.name,
        amount: -Math.abs(input.amount),
      });
    } else {
      if (!INCOME_CATEGORIES.includes(input.category)) {
        return fail('Income category must be Standard Income or Side Cash.', 'validation', 'validation.incomeCategory');
      }
      if (!isFiniteNumber(input.grossAmount) || input.grossAmount < 0) {
        return fail('Gross amount must be zero or greater.', 'validation', 'validation.grossAmountNonNegative');
      }
      if (!isFiniteNumber(input.netAmount) || input.netAmount < 0) {
        return fail('Net amount must be zero or greater.', 'validation', 'validation.netAmountNonNegative');
      }
      // Net above gross would mean more money arrived than was earned. The
      // column checks only constrain each amount independently, so this
      // cross-column rule has to live here. Skipped for Side Cash, where the
      // two columns are deliberately set equal below.
      if (input.category !== 'Side Cash' && input.netAmount > input.grossAmount) {
        return fail('Pay after deductions cannot be more than pay before deductions.', 'validation', 'validation.netExceedsGross');
      }

      // Side cash has no gross/net split - it is not taxed, so one amount
      // fills both columns.
      const grossToStore =
        input.category === 'Side Cash' ? input.netAmount : input.grossAmount;

      await db.insert(income).values({
        id: generateTransId(),
        userId,
        accountId: targetAccount.id,
        description: input.description.trim(),
        category: input.category,
        transactionDate: input.date,
        paymentMethod: targetAccount.name,
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
      return fail('A goal needs a name.', 'validation', 'validation.goalNameRequired');
    }
    if (!isFiniteNumber(input.target) || input.target <= 0) {
      return fail('Target amount must be greater than zero.', 'validation', 'validation.goalTargetPositive');
    }
    if (!isFiniteNumber(input.current) || input.current < 0) {
      return fail('Saved amount cannot be negative.', 'validation', 'validation.goalSavedNonNegative');
    }
    // target_date is a text column, so nothing at the database level stops a
    // free-text value landing in it. The same pattern guard the transaction
    // actions use is the only thing keeping it a real date.
    if (!DATE_PATTERN.test(input.date.trim())) {
      return fail('Target date must be a valid date.', 'validation', 'validation.goalDateInvalid');
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

    if (!rows[0]) return fail('That goal no longer exists.', 'validation', 'notFound.goal');

    // Same guards as addGoal, kept in step so an edit cannot store a shape the
    // add path would have rejected.
    if (!input.name.trim()) {
      return fail('A goal needs a name.', 'validation', 'validation.goalNameRequired');
    }
    if (!isFiniteNumber(input.target) || input.target <= 0) {
      return fail('Target amount must be greater than zero.', 'validation', 'validation.goalTargetPositive');
    }
    if (!isFiniteNumber(input.current) || input.current < 0) {
      return fail('Saved amount cannot be negative.', 'validation', 'validation.goalSavedNonNegative');
    }
    if (!DATE_PATTERN.test(input.date.trim())) {
      return fail('Target date must be a valid date.', 'validation', 'validation.goalDateInvalid');
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

    if (!rows[0]) return fail('That goal no longer exists.', 'validation', 'notFound.goal');

    await db.delete(goal).where(and(eq(goal.userId, userId), eq(goal.id, input.id)));

    revalidateAll();
    return { ok: true };
  } catch (error) {
    return handleUnexpected('deleteGoalAction', error);
  }
}

export interface AddToGoalActionInput {
  id: string;
  /** Dollars, at most two decimal places. */
  amount: number;
}

// Matches formatCurrency, which is pinned to en-US: these are real dollars.
function usd(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

/**
 * Adds to how much a goal has set aside, without rewriting its total.
 *
 * Unlike updateGoal ("warn, never block"), this REFUSES: the amount must fit
 * within Unallocated and must not take the goal past its target. Both rules
 * are enforced inside the database, in one transaction behind a per-user
 * lock (src/lib/data/goalAllocation.ts), so two saves at the same moment
 * cannot both spend the same unallocated money. The reads after a refusal
 * only EXPLAIN it - they never decide it.
 */
async function addToGoal(userId: string, input: AddToGoalActionInput): Promise<ActionResult> {
  try {
    if (!isFiniteNumber(input.amount) || input.amount <= 0) {
      return fail('Enter an amount greater than zero, in dollars and cents.', 'validation', 'validation.goalAddAmountInvalid');
    }
    const cents = Math.round(input.amount * 100);
    if (cents <= 0 || Math.abs(input.amount * 100 - cents) > 1e-6) {
      return fail('Enter an amount greater than zero, in dollars and cents.', 'validation', 'validation.goalAddAmountInvalid');
    }

    const updated = await addToGoalGuarded(userId, input.id, (cents / 100).toFixed(2));
    if (updated) {
      revalidateAll();
      return { ok: true };
    }

    // Refused. Work out why from fresh figures - same order as the rules.
    const rows = await db
      .select({ current: goal.currentAmount, target: goal.targetAmount })
      .from(goal)
      .where(and(eq(goal.userId, userId), eq(goal.id, input.id)))
      .limit(1);
    const row = rows[0];
    if (!row) return fail('That goal no longer exists.', 'validation', 'notFound.goal');

    const remainingCents = Math.round(row.target * 100) - Math.round(row.current * 100);
    if (remainingCents <= 0) {
      return fail('This goal has already reached its target.', 'validation', 'validation.goalAlreadyFull');
    }
    if (cents > remainingCents) {
      const amount = usd(remainingCents / 100);
      return fail(`That is more than this goal still needs (${amount}).`, 'validation', 'validation.goalAddExceedsTarget', { amount });
    }

    const summary = await loadAllocationSummary(userId);
    const availableCents = summary.ok
      ? Math.max(0, Math.round(summary.totalBalance * 100) - Math.round(summary.allocated * 100))
      : 0;
    const amount = usd(availableCents / 100);
    return fail(`Not enough unallocated money. You have ${amount} available.`, 'validation', 'validation.goalInsufficientFunds', { amount });
  } catch (error) {
    return handleUnexpected('addToGoalAction', error);
  }
}

export interface SessionLocationsSuccess { ok: true; locations: SessionLocation[] }
export type SessionLocationsResult =
  | SessionLocationsSuccess
  | { ok: false; error: string; kind?: FailureKind; code?: ServerErrorCode };

/** The signed-in user's recorded session locations - never anyone else's. */
async function loadSessionLocations(userId: string): Promise<SessionLocationsResult> {
  try {
    return { ok: true, locations: await getSessionLocations(userId) };
  } catch (error) {
    console.error('[pebble action] getSessionLocationsAction', error);
    return { ok: false, error: "Couldn't load session locations.", kind: classifyError(error) === 'database' ? 'database' : 'unknown', code: 'loader.sessionLocationsFailed' };
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
        return fail('Budget category names cannot be empty.', 'validation', 'validation.budgetCategoryNameRequired');
      }
      if (!isFiniteNumber(amount) || amount < 0) {
        // category is USER DATA - passed as a param, never baked into the
        // template. The client interpolates it back in, untranslated, the
        // same way categoryLabel()'s callers already treat category names.
        return fail(
          `Budget for ${category} must be zero or greater.`,
          'validation',
          'validation.budgetAmountNonNegative',
          { category },
        );
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


async function setTimeZoneOverride(
  userId: string,
  zone: string | null,
): Promise<ActionResult> {
  try {
    if (zone !== null && !isValidTimeZone(zone)) {
      return fail('That timezone is not recognized.', 'validation', 'validation.timeZoneInvalid');
    }

    await db
      .insert(userAccount)
      .values({
        userId,
        timeZone: zone,
      })
      .onConflictDoUpdate({
        target: userAccount.userId,
        set: {
          timeZone: zone,
          updatedAt: new Date().toISOString(),
        },
      });

    revalidateAll();
    return { ok: true };
  } catch (error) {
    return handleUnexpected('setTimeZoneOverrideAction', error);
  }
}

export type BudgetModalData =
  | {
      ok: true;
      budgets: Record<string, number>;
      annualIncome: number;
      incomeMonths: number;
      incomeMonthsLabel: string;
      categories: CategoryItem[];
      /**
       * Net amount of the most recent Standard Income transaction, for the
       * client's "import latest" convenience button in the manual income
       * estimate. Null when there is no Standard Income on record. Side Cash
       * is excluded, matching every other income figure in this dialog.
       */
      latestStandardIncomeNet: number | null;
    }
  | { ok: false; error: string; kind?: FailureKind; code?: ServerErrorCode };

/**
 * Loads exactly what ModifyBudgetModal needs, on open.
 *
 * The modal is mounted in AppShell (the layout), not in a page, so fetching
 * this in a Server Component would make every page pay for it on every
 * navigation even though the modal is rarely opened.
 *
 * annualIncome is computed server-side so the full income history never
 * crosses the wire - the client only needs the resulting number.
 *
 * `today` comes FROM THE CLIENT, resolved from the browser's own IANA zone.
 * It is not read here: getToday() returns container-local time, which is UTC
 * on Vercel, so a New Jersey evening is already tomorrow server-side and the
 * trailing-12-month window would be off by a day. Untrusted input, so it is
 * validated below; an invalid value skips the estimate rather than guessing.
 *
 * Expenses are fetched only to detect recording gaps: a stretch of 3+ months
 * with no transactions of ANY kind is time the user was not recording and is
 * excluded from the denominator. Income alone cannot distinguish "no pay that
 * month" from "not using Pebble that month".
 */
async function loadBudgetModalData(userId: string, today: string): Promise<BudgetModalData> {
  try {
    const [budgets, income, expenses, categories] = await Promise.all([
      getBudgets(userId),
      getIncome(userId),
      getExpenses(userId),
      getCategories(userId),
    ]);
    // Same calculation the Analysis page uses, pinned to a trailing 12 months
    // because this dialog has no period selector. The two agreed only by
    // accident before: this used months CONTAINING income as the denominator,
    // which reports double for anyone paid every other month.
    const estimate = isYmd(today)
      ? estimateAnnualIncomeTrailing12(mergeTransactions(expenses, income), today)
      // Typed explicitly so a future field on AnnualIncomeEstimate fails the
      // build here rather than silently omitting itself from this branch.
      : ({ annual: null, monthlyAverage: null, recordedMonths: 0, monthsLabel: '' } satisfies AnnualIncomeEstimate);

    // Most recent Standard Income row, by date, for the client's manual
    // "import latest" button. A reduce rather than a full sort: this only
    // ever needs the single latest row, not an ordering of all of them.
    // Same-day ties resolve to whichever row the array happens to return
    // first - acceptable here, since this only pre-fills a field the user
    // can still edit, unlike a figure used as a source of truth.
    const standardIncome = income.filter((t) => t.category === 'Standard Income');
    const latestStandardIncomeNet = standardIncome.length > 0
      ? standardIncome.reduce((latest, t) => (t.date > latest.date ? t : latest)).netAmount
      : null;

    return {
      ok: true,
      budgets,
      annualIncome: estimate.annual ?? 0,
      incomeMonths: estimate.recordedMonths,
      incomeMonthsLabel: estimate.monthsLabel,
      categories,
      latestStandardIncomeNet,
    };
  } catch (error) {
    console.error('[pebble action] getBudgetModalDataAction', error);
    return { ok: false, error: "Couldn't reach the database to load your budgets.", kind: classifyError(error) === 'database' ? 'database' : 'unknown', code: 'loader.budgetModalFailed' };
  }
}

export type AllocationSummaryResult =
  | { ok: true; totalBalance: number; allocated: number }
  | { ok: false; error: string; kind?: FailureKind; code?: ServerErrorCode };

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
    const [expenses, incomeRows, adjustments, goals, accounts] = await Promise.all([
      getExpenses(userId),
      getIncome(userId),
      getBalanceAdjustments(userId),
      getGoals(userId),
      getAccounts(userId),
    ]);

    const balances = computeCurrentBalances(
      mergeTransactions(expenses, incomeRows),
      accounts,
      adjustments,
    );

    return {
      ok: true,
      totalBalance: balances.total,
      allocated: goals.reduce((sum, g) => sum + g.current, 0),
    };
  } catch (error) {
    console.error('[pebble action] getAllocationSummaryAction', error);
    return { ok: false, error: "Couldn't check your goal allocations.", kind: classifyError(error) === 'database' ? 'database' : 'unknown', code: 'loader.allocationSummaryFailed' };
  }
}

const MAX_CATEGORY_NAME = 40;

interface CategoryNameError {
  error: string;
  code: ServerErrorCode;
  params?: Record<string, string>;
}

/**
 * Returns an object rather than a bare string, unlike every OTHER validator
 * in this file, so it can carry a code alongside the message. Its two call
 * sites (createCategory, updateCategory) unpack both onto fail().
 */
function validateCategoryName(name: string): CategoryNameError | null {
  const trimmed = name.trim();
  if (!trimmed) {
    return { error: 'A category needs a name.', code: 'validation.categoryNameRequired' };
  }
  if (trimmed.length > MAX_CATEGORY_NAME) {
    return {
      error: `Category names are limited to ${MAX_CATEGORY_NAME} characters.`,
      code: 'validation.categoryNameTooLong',
      // MAX_CATEGORY_NAME is a CONSTANT, not user data - passed as a param
      // anyway so a future change to the limit needs no dictionary edit.
      params: { max: String(MAX_CATEGORY_NAME) },
    };
  }
  return null;
}

/**
 * Loads categories for the settings screen. Also triggers first-access
 * seeding, so a brand-new account opening settings gets its defaults.
 */
export type CategoriesResult =
  | { ok: true; categories: CategoryItem[] }
  | { ok: false; error: string; kind?: FailureKind; code?: ServerErrorCode };

async function loadCategories(userId: string): Promise<CategoriesResult> {
  try {
    return { ok: true, categories: await getCategories(userId) };
  } catch (error) {
    console.error('[pebble action] getCategoriesAction', error);
    return { ok: false, error: "Couldn't reach the database to load your categories.", kind: classifyError(error) === 'database' ? 'database' : 'unknown', code: 'loader.categoriesFailed' };
  }
}

async function createCategory(
  userId: string,
  input: { name: string; iconKey: string; color: string },
): Promise<ActionResult> {
  try {
    const nameError = validateCategoryName(input.name);
    if (nameError) return fail(nameError.error, 'validation', nameError.code, nameError.params);

    const existing = await getCategories(userId);
    const trimmed = input.name.trim();
    if (existing.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
      // trimmed is USER DATA - the category name being attempted. Passed as a
      // param, never baked into the template.
      return fail(`You already have a category called "${trimmed}".`, 'validation', 'validation.categoryNameDuplicate', { name: trimmed });
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
    if (nameError) return fail(nameError.error, 'validation', nameError.code, nameError.params);

    const existing = await getCategories(userId);
    const target = existing.find((c) => c.id === input.id);
    if (!target) return fail('That category no longer exists.', 'validation', 'notFound.category');

    const trimmed = input.name.trim();
    const collision = existing.find(
      (c) => c.id !== input.id && c.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (collision) return fail(`You already have a category called "${trimmed}".`, 'validation', 'validation.categoryNameDuplicate', { name: trimmed });

    if (target.isSystem && trimmed !== target.name) {
      return fail('The fallback category cannot be renamed, but you can change its icon and colour.', 'validation', 'validation.categoryFallbackCannotRename');
    }

    const categoryUpdate = db
      .update(category)
      .set({ name: trimmed, iconKey: input.iconKey, color: input.color })
      .where(and(eq(category.userId, userId), eq(category.id, input.id)));

    if (trimmed !== target.name) {
      // ONE transaction (batch). Transactions, budgets and rules store the
      // category NAME, so a rename cascades to all of them - and a failure
      // part-way used to leave transactions under a name no category had,
      // dropping them out of every category list and breakdown.
      //
      // recurring_rule.category included: without it a rule keeps stamping
      // the OLD name onto every transaction it materializes. Soft-deleted
      // rules too, so a later undelete cannot resurrect a stale name.
      await db.batch([
        db.update(expense)
          .set({ category: trimmed })
          .where(and(eq(expense.userId, userId), eq(expense.category, target.name))),
        db.update(budget)
          .set({ category: trimmed })
          .where(and(eq(budget.userId, userId), eq(budget.category, target.name))),
        db.update(recurringRule)
          .set({ category: trimmed })
          .where(and(eq(recurringRule.userId, userId), eq(recurringRule.category, target.name))),
        categoryUpdate,
      ]);
    } else {
      await categoryUpdate;
    }

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
  | { ok: false; error: string; kind?: FailureKind; code?: ServerErrorCode };

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
    if (!target) return { ok: false, error: 'That category no longer exists.', kind: 'notFound', code: 'notFound.category' };

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
    return { ok: false, error: "Couldn't check that category.", kind: classifyError(error) === 'database' ? 'database' : 'unknown', code: 'loader.categoryUsageFailed' };
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
    if (!target) return fail('That category no longer exists.', 'validation', 'notFound.category');
    if (target.isSystem) return fail('The fallback category cannot be deleted.', 'validation', 'validation.categoryFallbackCannotDelete');

    const plan = input.plan;
    const validNames = new Set(existing.filter((c) => c.id !== target.id).map((c) => c.name));

    // READ everything, CHECK everything, and only then WRITE - in one
    // transaction. The earlier version reassigned transactions first and only
    // afterwards refused over scheduled payments, leaving them moved while the
    // category survived.
    const [usage, referencingRules] = await Promise.all([
      db.select({ id: expense.id })
        .from(expense)
        .where(and(eq(expense.userId, userId), eq(expense.category, target.name))),
      // Recurring rules are forward-looking instructions, not history, so they
      // cannot be left pointing at a category that is about to disappear.
      db.select({ id: recurringRule.id, description: recurringRule.description })
        .from(recurringRule)
        .where(and(
          eq(recurringRule.userId, userId),
          eq(recurringRule.category, target.name),
          ne(recurringRule.status, 'deleted'),
        )),
    ]);

    if (usage.length > 0) {
      if (!plan) {
        return fail('Choose where these transactions should go before deleting.', 'validation', 'validation.categoryDeleteChooseDestination');
      }
      if (plan.mode === 'bulk') {
        if (!validNames.has(plan.reassignToName)) {
          return fail('That destination category no longer exists.', 'validation', 'notFound.categoryDestination');
        }
      } else {
        // Every affected transaction must be accounted for before anything is
        // written: a partial assignment would leave transactions pointing at
        // a category about to be deleted.
        for (const row of usage) {
          const destination = plan.assignments[row.id];
          if (!destination || !validNames.has(destination)) {
            return fail('Every transaction needs a destination category before deleting.', 'validation', 'validation.categoryDeleteAllNeedDestination');
          }
        }
      }
    }

    // Bulk reassign: the user named one destination for everything in this
    // category, so it applies to rules too. Otherwise refuse: silently
    // repointing a rule at the fallback would misfile every FUTURE payment it
    // creates, indefinitely and invisibly.
    if (referencingRules.length > 0) {
      if (!plan || plan.mode !== 'bulk') {
        // ⚠️ ARRAY PARAM, deliberately NOT pre-joined: Chinese joins a list
        // with 、, a display decision the client makes (translateActionError).
        const names = referencingRules.map((r) => r.description);
        return fail(
          `These scheduled payments still use this category: ${names.join(', ')}. Update or remove them first.`,
          'validation',
          'validation.categoryRulesStillUse',
          { names },
        );
      }
      if (!validNames.has(plan.reassignToName)) {
        return fail('That destination category no longer exists.', 'validation', 'notFound.categoryDestination');
      }
    }

    // Every check passed. ONE transaction: reassign, repoint rules, drop the
    // category's budgets, delete it. All or nothing.
    const writes: unknown[] = [];
    if (usage.length > 0 && plan) {
      if (plan.mode === 'bulk') {
        writes.push(db.update(expense)
          .set({ category: plan.reassignToName })
          .where(and(eq(expense.userId, userId), eq(expense.category, target.name))));
      } else {
        // Grouped by destination: one statement per distinct target rather
        // than one per transaction.
        const byDestination = new Map<string, string[]>();
        for (const row of usage) {
          const destination = plan.assignments[row.id];
          const list = byDestination.get(destination) ?? [];
          list.push(row.id);
          byDestination.set(destination, list);
        }
        for (const [destination, ids] of byDestination) {
          writes.push(db.update(expense)
            .set({ category: destination })
            .where(and(eq(expense.userId, userId), inArray(expense.id, ids))));
        }
      }
    }
    if (referencingRules.length > 0 && plan && plan.mode === 'bulk') {
      writes.push(db.update(recurringRule)
        .set({ category: plan.reassignToName })
        .where(and(
          eq(recurringRule.userId, userId),
          eq(recurringRule.category, target.name),
          ne(recurringRule.status, 'deleted'),
        )));
    }
    writes.push(db.delete(budget).where(and(eq(budget.userId, userId), eq(budget.category, target.name))));
    writes.push(db.delete(category).where(and(eq(category.userId, userId), eq(category.id, input.id))));

    await db.batch(writes as unknown as Parameters<typeof db.batch>[0]);

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
  /** Target account. Locked to its current value on a closed account. */
  accountId: string;
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
      .select({ id: table.id, date: table.transactionDate, accountId: table.accountId })
      .from(table)
      .where(and(eq(table.userId, userId), eq(table.id, input.id)))
      .limit(1);

    const current = rows[0];
    if (!current) return fail('That transaction no longer exists.', 'validation', 'notFound.transaction');

    // The account the row currently sits on, and the one being requested.
    // Both matter: a CLOSED account freezes the amount and the account itself,
    // while date, description, category and tag stay editable.
    //
    // Enforced HERE, not only in the UI. The modal disables those fields, but
    // a disabled input is a courtesy - this is the guarantee.
    const currentAccountRows = await db
      .select({ id: account.id, status: account.status, name: account.name })
      .from(account)
      .where(and(eq(account.userId, userId), eq(account.id, current.accountId)))
      .limit(1);

    const currentAccount = currentAccountRows[0];
    const onHibernatedAccount = currentAccount?.status === 'hibernated';

    if (onHibernatedAccount) {
      if (input.accountId !== current.accountId) {
        return fail(
          'A transaction on a closed account cannot be moved to another account.',
          'validation',
          'validation.closedAccountLocked',
        );
      }
      // Amount is frozen: changing it would move a closed account off zero,
      // and a closed account must contribute exactly what it contributed the
      // day it was closed. Rejected outright rather than silently ignored, so
      // a client that sends one is told why.
      const sendsAmount = input.type === 'expense'
        ? input.amount !== undefined
        : (input.grossAmount !== undefined || input.netAmount !== undefined);
      if (sendsAmount) {
        return fail(
          'The amount of a transaction on a closed account cannot be changed.',
          'validation',
          'validation.closedAccountLocked',
        );
      }
    }

    // Ownership check on the requested account. Skipped when unchanged on a
    // closed account, which the branch above already validated.
    const targetRows = await db
      .select({ id: account.id, status: account.status, name: account.name })
      .from(account)
      .where(and(eq(account.userId, userId), eq(account.id, input.accountId)))
      .limit(1);

    const targetAccount = targetRows[0];
    if (!targetAccount || (!onHibernatedAccount && targetAccount.status !== 'active')) {
      return fail('That account no longer exists.', 'validation', 'notFound.account');
    }

    // Every field except identity is editable at any age. No per-transaction
    // balance is ever stored - computeRecentTransactions rebuilds the whole
    // ledger from the opening balances on each render - so editing a
    // ten-year-old record recalculates exactly as correctly as today's.
    let newDate: string | undefined;
    if (input.date !== undefined && input.date !== current.date) {
      if (!DATE_PATTERN.test(input.date)) {
        return fail('Date must be in YYYY-MM-DD format.', 'validation', 'validation.dateFormat');
      }
      newDate = input.date;
    }

    if (input.type === 'expense') {
      if (!input.category.trim()) return fail('An expense needs a category.', 'validation', 'validation.expenseCategoryRequired');

      const patch: Record<string, unknown> = {
        description: input.description.trim(),
        category: input.category,
        tag: input.tag?.trim() ?? '',
        accountId: targetAccount.id,
        paymentMethod: targetAccount.name,
      };
      if (newDate) patch.transactionDate = newDate;

      if (input.amount !== undefined) {
        if (!isFiniteNumber(input.amount) || input.amount <= 0) {
          return fail('Expense amount must be a positive number.', 'validation', 'validation.expenseAmountPositive');
        }
        patch.amount = -Math.abs(input.amount);
      }

      await db.update(expense).set(patch)
        .where(and(eq(expense.userId, userId), eq(expense.id, input.id)));
    } else {
      if (!INCOME_CATEGORIES.includes(input.category)) {
        return fail('Income category must be Standard Income or Side Cash.', 'validation', 'validation.incomeCategory');
      }

      const patch: Record<string, unknown> = {
        description: input.description.trim(),
        category: input.category,
        accountId: targetAccount.id,
        paymentMethod: targetAccount.name,
      };
      if (newDate) patch.transactionDate = newDate;

      if (input.grossAmount !== undefined || input.netAmount !== undefined) {
        if (!isFiniteNumber(input.grossAmount) || input.grossAmount < 0) {
          return fail('Gross amount must be zero or greater.', 'validation', 'validation.grossAmountNonNegative');
        }
        if (!isFiniteNumber(input.netAmount) || input.netAmount < 0) {
          return fail('Net amount must be zero or greater.', 'validation', 'validation.netAmountNonNegative');
        }
        // Net above gross would mean more money arrived than was earned. The
        // column checks constrain each amount independently, so this
        // cross-column rule has to live here. Skipped for Side Cash, where the
        // two columns are deliberately set equal just below.
        if (input.category !== 'Side Cash' && input.netAmount > input.grossAmount) {
          return fail('Pay after deductions cannot be more than pay before deductions.', 'validation', 'validation.netExceedsGross');
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
 * No balance repair is needed: computeCurrentBalances re-derives everything
 * from the stored records on every render, so removing one simply removes its
 * contribution. Nothing stored can go stale.
 *
 * A transaction on a HIBERNATED account cannot be deleted at all - the guard
 * is below, not a compensating adjustment. An offset on the same account
 * would leave the balance exactly as it was, making the deletion a no-op that
 * merely hides the row: worse than refusing, because it looks like something
 * happened.
 */
async function deleteTransaction(
  userId: string,
  input: { id: string; type: 'expense' | 'income' },
): Promise<ActionResult> {
  try {
    const table = input.type === 'expense' ? expense : income;
    const rows = await db
      .select({ id: table.id, accountId: table.accountId })
      .from(table)
      .where(and(eq(table.userId, userId), eq(table.id, input.id)))
      .limit(1);

    const target = rows[0];
    if (!target) return fail('That transaction no longer exists.', 'validation', 'notFound.transaction');

    const accountRows = await db
      .select({ status: account.status })
      .from(account)
      .where(and(eq(account.userId, userId), eq(account.id, target.accountId)))
      .limit(1);

    if (accountRows[0]?.status === 'hibernated') {
      return fail(
        'This account is hibernated. Wake it first to delete transactions.',
        'validation',
        'validation.hibernatedNoDelete',
      );
    }

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
    accountId: string;
    delta: number;
    description: string;
    date: string;
  },
): Promise<ActionResult> {
  try {
    if (!isFiniteNumber(input.delta) || input.delta === 0) {
      return fail('Enter an amount that actually changes the balance.', 'validation', 'validation.adjustmentAmountRequired');
    }
    if (!DATE_PATTERN.test(input.date)) {
      return fail('Date must be in YYYY-MM-DD format.', 'validation', 'validation.dateFormat');
    }

    // Ownership check: the id arrives from the client, and withSessionUser
    // guarantees WHO is asking, not WHAT they own. Closed accounts are
    // rejected too - they are settled at zero permanently.
    const owned = await db
      .select({ id: account.id, status: account.status, name: account.name })
      .from(account)
      .where(and(eq(account.userId, userId), eq(account.id, input.accountId)))
      .limit(1);

    const target = owned[0];
    if (!target || target.status !== 'active') {
      return fail('That account no longer exists.', 'validation', 'notFound.account');
    }

    await db.insert(balanceAdjustment).values({
      id: generateTransId(),
      userId,
      accountId: target.id,
      description: input.description.trim() || 'Balance adjustment',
      transactionDate: input.date,
      // Legacy reconciliation trail only - carries the account name now that
      // accounts are user-defined. Never read for logic.
      paymentMethod: target.name,
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
      .select({ id: balanceAdjustment.id, group: balanceAdjustment.transferGroupId })
      .from(balanceAdjustment)
      .where(and(eq(balanceAdjustment.userId, userId), eq(balanceAdjustment.id, input.id)))
      .limit(1);

    const row = rows[0];
    if (!row) return fail('That adjustment no longer exists.', 'validation', 'notFound.adjustment');

    // A transfer is TWO rows sharing transfer_group_id. Deleting only the one
    // clicked used to leave the other half behind, creating or destroying
    // money (see the column's comment in schema.ts). Both halves now go, in
    // one statement. Standalone adjustments (no group) are unchanged.
    await db
      .delete(balanceAdjustment)
      .where(row.group
        ? and(eq(balanceAdjustment.userId, userId), eq(balanceAdjustment.transferGroupId, row.group))
        : and(eq(balanceAdjustment.userId, userId), eq(balanceAdjustment.id, input.id)));

    revalidateAll();
    return { ok: true };
  } catch (error) {
    return handleUnexpected('deleteBalanceAdjustmentAction', error);
  }
}


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
  /** The account this rule materializes into. Must be active and owned. */
  accountId: string;
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
  accountId: string;
  /** Legacy reconciliation trail - the account's name. Never read for logic. */
  paymentMethod: string;
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
): Promise<
  | { ok: true; values: NormalizedRule }
  | { ok: false; error: string; kind?: FailureKind; code?: ServerErrorCode; params?: Record<string, string | string[]> }
> {
  const description = input.description.trim();
  if (!description) return { ok: false, error: 'A scheduled payment needs a description.', code: 'validation.ruleDescriptionRequired' };

  if (input.kind !== 'expense' && input.kind !== 'income') {
    return { ok: false, error: 'Select whether this is an expense or income.', code: 'validation.ruleKindRequired' };
  }
  // Ownership check: the id arrives from the client. Active only - a rule
  // materializing into a closed account would give it a non-zero balance on
  // the next catch-up, which closeAccount() also guards against from its side.
  const ownedAccount = await db
    .select({ id: account.id, status: account.status, name: account.name })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.id, input.accountId)))
    .limit(1);

  const ruleAccount = ownedAccount[0];
  if (!ruleAccount || ruleAccount.status !== 'active') {
    return { ok: false, error: 'That account no longer exists.', code: 'notFound.account' };
  }
  if (!RECURRING_FREQUENCIES.includes(input.frequency)) {
    return { ok: false, error: 'Select a valid frequency.', code: 'validation.ruleFrequency' };
  }
  if (!RECURRING_END_MODES.includes(input.endMode)) {
    return { ok: false, error: 'Select a valid end condition.', code: 'validation.ruleEndMode' };
  }
  if (!DATE_PATTERN.test(input.startDate)) {
    return { ok: false, error: 'Start date must be in YYYY-MM-DD format.', code: 'validation.ruleStartDateFormat' };
  }
  if (!isFiniteNumber(input.amount) || input.amount <= 0) {
    return { ok: false, error: 'Amount must be greater than zero.', code: 'validation.ruleAmountPositive' };
  }

  // End condition: exactly one shape, fully specified.
  let endCount: number | null = null;
  let endDate: string | null = null;

  if (input.endMode === 'after') {
    const count = input.endCount;
    if (!isFiniteNumber(count) || !Number.isInteger(count) || count < 1) {
      return { ok: false, error: 'Number of payments must be a whole number of at least 1.', code: 'validation.ruleEndCountInteger' };
    }
    if (count > MAX_END_COUNT) {
      // MAX_END_COUNT is a CONSTANT, passed as a param so a future change to
      // the limit needs no dictionary edit - same pattern as MAX_CATEGORY_NAME.
      return {
        ok: false,
        error: `Number of payments cannot exceed ${MAX_END_COUNT}.`,
        code: 'validation.ruleEndCountMax',
        params: { max: String(MAX_END_COUNT) },
      };
    }
    endCount = count;
  } else if (input.endMode === 'on') {
    const date = input.endDate?.trim() ?? '';
    if (!DATE_PATTERN.test(date)) {
      return { ok: false, error: 'End date must be in YYYY-MM-DD format.', code: 'validation.ruleEndDateFormat' };
    }
    if (date < input.startDate) {
      return { ok: false, error: 'End date cannot be before the start date.', code: 'validation.ruleEndDateBeforeStart' };
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
      return { ok: false, error: 'Income must be Standard Income or Side Cash.', code: 'validation.ruleIncomeCategory' };
    }
    const gross = input.grossAmount;
    if (!isFiniteNumber(gross) || gross <= 0) {
      return { ok: false, error: 'Gross amount must be greater than zero.', code: 'validation.ruleGrossAmountPositive' };
    }
    if (input.amount > gross) {
      return { ok: false, error: 'Net amount cannot be more than the gross amount.', code: 'validation.ruleNetExceedsGross' };
    }
    return {
      ok: true,
      values: {
        kind: 'income',
        description,
        category: input.category,
        // The income table has no tag column, and a CHECK enforces NULL here.
        tag: null,
        accountId: ruleAccount.id,
        paymentMethod: ruleAccount.name,
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

  if (!owned[0]) return { ok: false, error: 'Select a valid category.', code: 'validation.ruleCategoryInvalid' };

  return {
    ok: true,
    values: {
      kind: 'expense',
      description,
      category: categoryName,
      tag: input.tag?.trim() || null,
      accountId: ruleAccount.id,
      paymentMethod: ruleAccount.name,
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
    if (!normalized.ok) return fail(normalized.error, 'validation', normalized.code, normalized.params);

    // A start date in the past would otherwise backfill on the next page load.
    // Setting the mark to yesterday starts the rule from today instead. Because
    // the mark only ever moves forward, this is a create-time decision that a
    // later edit cannot accidentally reverse.
    // Falls back only if the cookie is somehow absent during an action, which
    // should not happen - the user has the app open by definition. Worst case
    // the rule starts a day off, not a wrongly dated transaction.
    const today = todayInZone((await resolveUserTimeZone(userId)) ?? FALLBACK_TIME_ZONE);
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
      return fail('That scheduled payment no longer exists.', 'validation', 'notFound.recurringRule');
    }

    // Expense history lives in `expense`, income history in `income`. Switching
    // kind would orphan every row already materialized from this rule.
    if (existing.kind !== input.kind) {
      return fail('A scheduled payment cannot be switched between expense and income. Delete it and create a new one.', 'validation', 'validation.ruleKindLocked');
    }

    const normalized = await normalizeRuleInput(userId, input);
    if (!normalized.ok) return fail(normalized.error, 'validation', normalized.code, normalized.params);

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
      return fail('Invalid status.', 'validation', 'validation.ruleStatusInvalid');
    }

    const rows = await db
      .select({ id: recurringRule.id, status: recurringRule.status })
      .from(recurringRule)
      .where(and(eq(recurringRule.userId, userId), eq(recurringRule.id, input.id)))
      .limit(1);

    if (!rows[0] || rows[0].status === 'deleted') {
      return fail('That scheduled payment no longer exists.', 'validation', 'notFound.recurringRule');
    }

    // Resuming after a long pause must not backfill the gap. The mark is left
    // alone, then advanced to today so catch-up skips the paused period.
    const patch =
      input.status === 'active'
        ? {
            status: 'active',
            materializedThrough: todayInZone((await resolveUserTimeZone(userId)) ?? FALLBACK_TIME_ZONE),
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
/** A schedule is hard-deleted when nothing was ever created from it; otherwise soft-deleted. */
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
      return fail('That scheduled payment no longer exists.', 'validation', 'notFound.recurringRule');
    }

    // A rule is hard-deleted when nothing was ever created from it. One that
    // has produced expense or income rows stays as a soft delete, because
    // those rows still point back to it. One transaction under the write
    // lock, so catch-up cannot materialize an occurrence between the check
    // and the delete. If step 1 removes the row, step 2 matches nothing.
    const id = input.id;
    await neonSql.transaction(
      [
        userWriteLockStatement(userId),
        neonSql`DELETE FROM recurring_rule
                 WHERE user_id = ${userId}::uuid AND id = ${id}
                   AND NOT EXISTS (SELECT 1 FROM expense WHERE user_id = ${userId}::uuid AND recurring_rule_id = ${id})
                   AND NOT EXISTS (SELECT 1 FROM income WHERE user_id = ${userId}::uuid AND recurring_rule_id = ${id})`,
        neonSql`UPDATE recurring_rule SET status = 'deleted', updated_at = now()
                 WHERE user_id = ${userId}::uuid AND id = ${id} AND status <> 'deleted'`,
      ],
      { isolationLevel: 'ReadCommitted' },
    );

    revalidateAll();
    return { ok: true };
  } catch (error) {
    return handleUnexpected('deleteRecurringRuleAction', error);
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

/**
 * Imports up to 500 parsed bank rows, each with its own account. WRITE PATH,
 * inserts only. Everything is checked first (nothing written if any row
 * fails): every account used is this user's and active, real calendar dates,
 * amounts above zero with at most 2 decimals, spending in an existing
 * category, money in as Standard Income or Side Cash. Then ONE ReadCommitted
 * transaction: the write lock, then one INSERT ... SELECT FROM unnest(...)
 * per (table, account) group.
 *
 * Ids: one timestamp per import plus a base-36 counter, never containing '_'
 * (that marks legacy imports in compareSameDayIds). Rows are sorted by date,
 * file order kept for ties. Expenses are stored negative; money in has
 * gross = net, like Side Cash.
 */
async function importTransactions(
  userId: string,
  input: {
    rows: { date: string; description: string; amount: number; kind: 'expense' | 'income'; category: string; accountId: string; tag?: string }[];
  },
): Promise<ActionResult> {
  try {
    const rows = Array.isArray(input?.rows) ? input.rows : [];
    if (rows.length < 1 || rows.length > 500) {
      return fail('An import needs between 1 and 500 rows.', 'validation', 'validation.importInvalid');
    }

    const wanted = [...new Set(rows.map((r) => r?.accountId))];
    if (!wanted.every((a) => typeof a === 'string' && a !== '')) {
      return fail('One of the rows is not valid.', 'validation', 'validation.importInvalid');
    }
    const owned = await db
      .select({ id: account.id, status: account.status, name: account.name })
      .from(account)
      .where(and(eq(account.userId, userId), inArray(account.id, wanted as string[])));
    const accountById = new Map(owned.map((a) => [a.id, a]));
    if (wanted.some((a) => accountById.get(a as string)?.status !== 'active')) {
      return fail('That account no longer exists.', 'validation', 'notFound.account');
    }

    const known = new Set((await getCategories(userId)).map((c) => c.name));
    const clean: { date: string; description: string; cents: number; kind: 'expense' | 'income'; category: string; accountId: string; tag: string; order: number }[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const raw = Number(r?.amount);
      const cents = Math.round(raw * 100);
      const ok =
        typeof r?.date === 'string' && DATE_PATTERN.test(r.date) &&
        isFiniteNumber(raw) && cents > 0 && Math.abs(raw * 100 - cents) < 1e-6 &&
        (r.kind === 'expense' || r.kind === 'income') &&
        typeof r.category === 'string' &&
        (r.kind === 'expense' ? known.has(r.category) : (INCOME_CATEGORIES as readonly string[]).includes(r.category));
      if (!ok) return fail('One of the rows is not valid.', 'validation', 'validation.importInvalid');
      const [y, m, d] = r.date.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d));
      if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
        return fail('One of the rows has an invalid date.', 'validation', 'validation.importInvalid');
      }
      clean.push({
        date: r.date,
        description: String(r.description ?? '').trim().slice(0, 200),
        cents,
        kind: r.kind,
        category: r.category,
        accountId: r.accountId,
        tag: r.kind === 'expense' ? String(r.tag ?? '').trim().slice(0, 50) : '',
        order: i,
      });
    }

    clean.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.order - b.order));
    const stamp = generateTransId().split('-')[0];
    const withIds = clean.map((r, i) => ({ r, id: `${stamp}-${i.toString(36).padStart(4, '0')}` }));

    const statements = [userWriteLockStatement(userId)];
    for (const kind of ['expense', 'income'] as const) {
      for (const accId of wanted as string[]) {
        const picked = withIds.filter((x) => x.r.kind === kind && x.r.accountId === accId);
        if (picked.length === 0) continue;
        const target = accountById.get(accId)!;
        const ids = picked.map((x) => x.id);
        const descs = picked.map((x) => x.r.description);
        const cats = picked.map((x) => x.r.category);
        const dates = picked.map((x) => x.r.date);
        const amts = picked.map((x) => (x.r.cents / 100).toFixed(2));
        const tags = picked.map((x) => x.r.tag);
        if (kind === 'expense') {
          statements.push(neonSql`INSERT INTO expense
              (id, user_id, description, category, tag, transaction_date, payment_method, account_id, amount)
            SELECT r.id, ${userId}::uuid, r.description, r.category, r.tag, r.date::date, ${target.name}, ${target.id}, -(r.amount)
              FROM unnest(${ids}::text[], ${descs}::text[], ${cats}::text[], ${dates}::text[], ${amts}::numeric[], ${tags}::text[])
                   AS r(id, description, category, date, amount, tag)`);
        } else {
          statements.push(neonSql`INSERT INTO income
              (id, user_id, description, category, transaction_date, payment_method, account_id, gross_amount, net_amount)
            SELECT r.id, ${userId}::uuid, r.description, r.category, r.date::date, ${target.name}, ${target.id}, r.amount, r.amount
              FROM unnest(${ids}::text[], ${descs}::text[], ${cats}::text[], ${dates}::text[], ${amts}::numeric[])
                   AS r(id, description, category, date, amount)`);
        }
      }
    }
    await neonSql.transaction(statements, { isolationLevel: 'ReadCommitted' });

    revalidateAll();
    return { ok: true };
  } catch (error) {
    return handleUnexpected('importTransactionsAction', error);
  }
}

export const importTransactionsAction = withSessionUser(importTransactions);
export const addGoalAction = withSessionUser(addGoal);
export const updateGoalAction = withSessionUser(updateGoal);
export const deleteGoalAction = withSessionUser(deleteGoal);
export const addToGoalAction = withSessionUser(addToGoal);
export const getSessionLocationsAction = withSessionUser(loadSessionLocations);
export const getAllocationSummaryAction = withSessionUser(loadAllocationSummary);
export const getCategoriesAction = withSessionUser(loadCategories);
export const updateTransactionAction = withSessionUser(updateTransaction);
export const deleteTransactionAction = withSessionUser(deleteTransaction);
/**
 * Moves money between two accounts.
 *
 * TWO balance_adjustment rows, not a dedicated record type: adjustments are
 * already excluded from Reports (a transfer is not spending or income),
 * already render in the statement, and already flow through the balance
 * derivation. A separate table would mean teaching every one of those paths a
 * fourth record type to reproduce properties this one already has.
 *
 * BALANCE-NEUTRAL BY CONSTRUCTION: the source row is -amount and the
 * destination +amount, so the pair always sums to zero. The user's total
 * cannot move, only its distribution.
 *
 * Both rows share a transferGroupId so a delete can remove them together.
 * Written in one batch(): half a transfer would create or destroy money.
 *
 * Both accounts must be ACTIVE. A transfer is new activity, and hibernation
 * means an account takes none.
 */
async function createTransfer(
  userId: string,
  input: { fromAccountId: string; toAccountId: string; amount: number; description: string; date: string },
): Promise<ActionResult> {
  try {
    if (input.fromAccountId === input.toAccountId) {
      return fail('Choose two different accounts.', 'validation', 'validation.transferSameAccount');
    }
    if (!isFiniteNumber(input.amount) || input.amount <= 0) {
      return fail('Transfer amount must be greater than zero.', 'validation', 'validation.transferAmountPositive');
    }
    if (!DATE_PATTERN.test(input.date)) {
      return fail('Date must be in YYYY-MM-DD format.', 'validation', 'validation.dateFormat');
    }

    // Ownership check on both ids - they arrive from the client.
    const rows = await db
      .select({ id: account.id, status: account.status, name: account.name })
      .from(account)
      .where(and(eq(account.userId, userId), inArray(account.id, [input.fromAccountId, input.toAccountId])));

    const source = rows.find((r) => r.id === input.fromAccountId);
    const destination = rows.find((r) => r.id === input.toAccountId);

    if (!source || !destination) {
      return fail('That account no longer exists.', 'validation', 'notFound.account');
    }
    if (source.status !== 'active' || destination.status !== 'active') {
      return fail('Both accounts must be active to transfer between them.', 'validation', 'validation.transferInactiveAccount');
    }

    const groupId = generateId();
    const magnitude = Math.abs(input.amount);
    const note = input.description.trim();

    await db.batch([
      db.insert(balanceAdjustment).values({
        id: generateTransId(),
        userId,
        accountId: source.id,
        transferGroupId: groupId,
        description: note || `Transfer to ${destination.name}`,
        transactionDate: input.date,
        paymentMethod: source.name,
        amount: -magnitude,
      }),
      db.insert(balanceAdjustment).values({
        id: generateTransId(),
        userId,
        accountId: destination.id,
        transferGroupId: groupId,
        description: note || `Transfer from ${source.name}`,
        transactionDate: input.date,
        paymentMethod: destination.name,
        amount: magnitude,
      }),
    ]);

    revalidateAll();
    return { ok: true };
  } catch (error) {
    return handleUnexpected('createTransferAction', error);
  }
}

export const createBalanceAdjustmentAction = withSessionUser(createBalanceAdjustment);
export const createTransferAction = withSessionUser(createTransfer);
export const deleteBalanceAdjustmentAction = withSessionUser(deleteBalanceAdjustment);
export const modifyBudgetsAction = withSessionUser(modifyBudgets);
export const getBudgetModalDataAction = withSessionUser(loadBudgetModalData);
export const createCategoryAction = withSessionUser(createCategory);
export const updateCategoryAction = withSessionUser(updateCategory);
export const getCategoryUsageAction = withSessionUser(loadCategoryUsage);
export const deleteCategoryAction = withSessionUser(deleteCategory);
export const createRecurringRuleAction = withSessionUser(createRecurringRule);
export const updateRecurringRuleAction = withSessionUser(updateRecurringRule);
export const setRecurringRuleStatusAction = withSessionUser(setRecurringRuleStatus);
export const deleteRecurringRuleAction = withSessionUser(deleteRecurringRule);

/* ------------------------------------------------------------------------
 * Accounts
 * ---------------------------------------------------------------------- */

export interface CreateAccountInput {
  name: string;
  kind: 'bank' | 'cash';
  /** Exactly 4 digits when kind is 'bank'; ignored otherwise. */
  last4: string;
}

/**
 * Validation mirrors the database CHECKs deliberately. The constraints are the
 * real guard - this layer exists to turn a constraint violation into a
 * translated message instead of an opaque 500.
 */
async function createAccount(userId: string, input: CreateAccountInput): Promise<ActionResult> {
  try {
    const name = input.name.trim();
    if (!name) {
      return fail('An account needs a name.', 'validation', 'validation.accountNameRequired');
    }
    if (name.length > 40) {
      return fail('That account name is too long.', 'validation', 'validation.accountNameTooLong');
    }
    if (input.kind !== 'bank' && input.kind !== 'cash') {
      return fail('Choose an account type.', 'validation', 'validation.accountKindInvalid');
    }

    const last4 = input.kind === 'bank' ? input.last4.trim() : null;
    if (input.kind === 'bank' && !/^[0-9]{4}$/.test(last4 ?? '')) {
      return fail('Enter the last 4 digits of the account number.', 'validation', 'validation.accountLast4Invalid');
    }

    // The partial unique index (active accounts only) is what actually
    // enforces this; checking first turns a 23505 into a usable message.
    // A closed account may share the name - that is the point of the index.
    const existing = await db
      .select({ id: account.id })
      .from(account)
      .where(and(eq(account.userId, userId), eq(account.name, name), eq(account.status, 'active')))
      .limit(1);

    if (existing[0]) {
      return fail('You already have an account with that name.', 'validation', 'validation.accountNameDuplicate');
    }

    const rows = await db
      .select({ sortOrder: account.sortOrder })
      .from(account)
      .where(eq(account.userId, userId));
    const nextSort = rows.reduce((max, r) => Math.max(max, r.sortOrder), -1) + 1;

    await db.insert(account).values({
      id: generateId(),
      userId,
      name,
      kind: input.kind,
      last4,
      // Every account starts at zero. A starting balance is recorded as a
      // dated balance adjustment instead, so nothing moves the total without
      // a visible row explaining it.
      sortOrder: nextSort,
    });

    revalidateAll();
    return { ok: true };
  } catch (error) {
    return handleUnexpected('createAccountAction', error);
  }
}

/**
 * Hibernates an account: frozen, but not gone.
 *
 * The balance is KEPT and still counts toward the total - hibernation says
 * "I have stopped using this", not "this is settled at zero". No new
 * transactions may be charged to it, and its existing transactions have their
 * amount and account locked and cannot be deleted. Date, description,
 * category and tag stay editable.
 *
 * Reversible, which is why the name stays reserved by the unique index.
 */
async function hibernateAccount(userId: string, accountId: string): Promise<ActionResult> {
  try {
    const rows = await db
      .select({ id: account.id, status: account.status, isDefault: account.isDefault })
      .from(account)
      .where(and(eq(account.userId, userId), eq(account.id, accountId)))
      .limit(1);

    const target = rows[0];
    if (!target) return fail('That account no longer exists.', 'validation', 'notFound.account');
    if (target.isDefault) {
      return fail('The default Checking and Cash accounts cannot be hibernated.', 'validation', 'validation.accountDefaultCannotClose');
    }
    if (target.status === 'hibernated') {
      return fail('That account is already hibernated.', 'validation', 'validation.accountAlreadyClosed');
    }

    // Active rules would keep materializing transactions into a frozen
    // account on every catch-up. Blocked rather than auto-paused: a rule
    // that pauses itself is a silent state change.
    const liveRules = await db
      .select({ id: recurringRule.id })
      .from(recurringRule)
      .where(and(
        eq(recurringRule.userId, userId),
        eq(recurringRule.accountId, accountId),
        ne(recurringRule.status, 'deleted'),
      ));

    if (liveRules.length > 0) {
      return fail(
        'This account still has scheduled payments. Delete or move them first.',
        'validation',
        'validation.accountHasRules',
      );
    }

    const hibernated = await db
      .update(account)
      // isPreferred cleared with it: a preselected account that rejects new
      // transactions would be broken by construction.
      .set({ status: 'hibernated', isPreferred: false, updatedAt: new Date().toISOString() })
      .where(and(
        eq(account.userId, userId),
        eq(account.id, accountId),
        // Re-checked by the database AT THE MOMENT OF WRITING: a scheduled
        // payment created in another tab after the check above must not end
        // up on a frozen account, where catch-up would keep adding to it.
        sql`NOT EXISTS (SELECT 1 FROM recurring_rule r WHERE r.user_id = ${userId}::uuid AND r.account_id = ${accountId} AND r.status <> 'deleted')`,
      ))
      .returning({ id: account.id });

    if (hibernated.length === 0) {
      return fail(
        'This account still has scheduled payments. Delete or move them first.',
        'validation',
        'validation.accountHasRules',
      );
    }

    revalidateAll();
    return { ok: true };
  } catch (error) {
    return handleUnexpected('hibernateAccountAction', error);
  }
}

/** Returns a hibernated account to active use. */
async function wakeAccount(userId: string, accountId: string): Promise<ActionResult> {
  try {
    const rows = await db
      .select({ id: account.id, status: account.status })
      .from(account)
      .where(and(eq(account.userId, userId), eq(account.id, accountId)))
      .limit(1);

    const target = rows[0];
    if (!target) return fail('That account no longer exists.', 'validation', 'notFound.account');
    if (target.status !== 'hibernated') {
      return fail('That account is not hibernated.', 'validation', 'validation.accountNotHibernated');
    }

    await db
      .update(account)
      .set({ status: 'active', updatedAt: new Date().toISOString() })
      .where(and(eq(account.userId, userId), eq(account.id, accountId)));

    revalidateAll();
    return { ok: true };
  } catch (error) {
    return handleUnexpected('wakeAccountAction', error);
  }
}

/**
 * Deletes an account outright - zero trace, row and all.
 *
 * REQUIRES THE ACCOUNT TO BE COMPLETELY EMPTY: no expenses, no income, no
 * balance adjustments, no recurring rules of any status. Moving records out
 * is a separate, explicit operation the user performs first.
 *
 * That precondition is what makes this safe. Nothing references the row, so
 * ON DELETE RESTRICT can never fire and no financial history can be orphaned
 * or cascade-deleted. A delete that silently took transactions with it would
 * be indistinguishable from data loss.
 */
async function deleteAccount(userId: string, accountId: string): Promise<ActionResult> {
  try {
    const rows = await db
      .select({ id: account.id, isDefault: account.isDefault })
      .from(account)
      .where(and(eq(account.userId, userId), eq(account.id, accountId)))
      .limit(1);

    const target = rows[0];
    if (!target) return fail('That account no longer exists.', 'validation', 'notFound.account');
    if (target.isDefault) {
      return fail('The default Checking and Cash accounts cannot be deleted.', 'validation', 'validation.accountDefaultCannotClose');
    }

    const [expenses, incomeRows, adjustments, rules] = await Promise.all([
      db.select({ id: expense.id }).from(expense).where(and(eq(expense.userId, userId), eq(expense.accountId, accountId))).limit(1),
      db.select({ id: income.id }).from(income).where(and(eq(income.userId, userId), eq(income.accountId, accountId))).limit(1),
      db.select({ id: balanceAdjustment.id }).from(balanceAdjustment).where(and(eq(balanceAdjustment.userId, userId), eq(balanceAdjustment.accountId, accountId))).limit(1),
      db.select({ id: recurringRule.id }).from(recurringRule).where(and(eq(recurringRule.userId, userId), eq(recurringRule.accountId, accountId))).limit(1),
    ]);

    if (expenses[0] || incomeRows[0] || adjustments[0] || rules[0]) {
      return fail(
        'This account still has records. Move them to another account first.',
        'validation',
        'validation.accountNotEmpty',
      );
    }

    await db.delete(account).where(and(eq(account.userId, userId), eq(account.id, accountId)));

    revalidateAll();
    return { ok: true };
  } catch (error) {
    return handleUnexpected('deleteAccountAction', error);
  }
}

export const setTimeZoneOverrideAction = withSessionUser(setTimeZoneOverride);
export type AccountsResult =
  | { ok: true; accounts: Account[] }
  | { ok: false; error: string; kind?: FailureKind; code?: ServerErrorCode };

/**
 * Active accounts for a transaction form's picker.
 *
 * Closed accounts are excluded: they cannot receive new activity. An EDIT of
 * a transaction already on a closed account is handled by the caller, which
 * shows that account as a locked, non-selectable value.
 */
async function loadAccounts(userId: string): Promise<AccountsResult> {
  try {
    const accounts = await getAccounts(userId);
    return { ok: true, accounts: accounts.filter((a) => a.status === 'active') };
  } catch (error) {
    console.error('[pebble action] getAccountsAction', error);
    return {
      ok: false,
      error: "Couldn't reach the database to load your accounts.",
      kind: classifyError(error) === 'database' ? 'database' : 'unknown',
      code: 'loader.accountsFailed',
    };
  }
}

export const createAccountAction = withSessionUser(createAccount);
export const getAccountsAction = withSessionUser(loadAccounts);

export type SearchTransactionsResult =
  | {
      ok: true;
      transactions: ReturnType<typeof mergeTransactions>;
      categories: Awaited<ReturnType<typeof getCategories>>;
      budgets: Awaited<ReturnType<typeof getBudgets>>;
    }
  | { ok: false; error: string; kind?: FailureKind; code?: ServerErrorCode };

/**
 * Every expense and income row, plus the categories and budgets the detail
 * dialog needs, for the command palette's search. READ ONLY. The palette
 * calls it at most once per session, on the first keystroke, and keeps the
 * result in memory only. Recurring catch-up is not run here: the next page
 * load does that.
 */
async function loadSearchTransactions(userId: string): Promise<SearchTransactionsResult> {
  try {
    const [expenseRows, incomeRows, categoryRows, budgetMap] = await Promise.all([
      getExpenses(userId),
      getIncome(userId),
      getCategories(userId),
      getBudgets(userId),
    ]);
    return { ok: true, transactions: mergeTransactions(expenseRows, incomeRows), categories: categoryRows, budgets: budgetMap };
  } catch (error) {
    console.error('[pebble action] getSearchTransactionsAction', error);
    return {
      ok: false,
      error: "Couldn't reach the database to search your transactions.",
      kind: classifyError(error) === 'database' ? 'database' : 'unknown',
      code: 'loader.searchFailed',
    };
  }
}

export const getSearchTransactionsAction = withSessionUser(loadSearchTransactions);
/**
 * Moves records from one account to another.
 *
 * ALL FOUR record types move: expenses, income, balance adjustments and
 * recurring rules. Deletion requires an account to be empty of every one of
 * them, so a move that skipped any would leave the account undeletable with
 * nothing on screen explaining why.
 *
 * The destination must be ACTIVE. Hibernation means no new activity, and
 * arriving records are activity. The SOURCE may be hibernated - emptying a
 * hibernated account is exactly how it becomes deletable.
 *
 * batch() runs every statement in one transaction. A partial move would
 * scatter records across two accounts with no indication anything failed.
 */
async function moveAccountRecords(
  userId: string,
  input: { fromAccountId: string; toAccountId: string; transactionIds?: string[] },
): Promise<ActionResult> {
  try {
    if (input.fromAccountId === input.toAccountId) {
      return fail('Choose a different destination account.', 'validation', 'validation.moveSameAccount');
    }

    // Ownership checks on both ids - they arrive from the client.
    const rows = await db
      .select({ id: account.id, status: account.status, name: account.name })
      .from(account)
      .where(and(
        eq(account.userId, userId),
        inArray(account.id, [input.fromAccountId, input.toAccountId]),
      ));

    const source = rows.find((r) => r.id === input.fromAccountId);
    const destination = rows.find((r) => r.id === input.toAccountId);

    if (!source || !destination) {
      return fail('That account no longer exists.', 'validation', 'notFound.account');
    }
    if (destination.status !== 'active') {
      return fail('Records can only be moved into an active account.', 'validation', 'validation.moveDestinationInactive');
    }

    // A partial move names transaction ids; a full move takes everything,
    // including recurring rules. Rules are deliberately NOT selectable
    // individually - a rule is a schedule, not a record in the list.
    const partial = input.transactionIds !== undefined && input.transactionIds.length > 0;

    const patch = { accountId: destination.id, paymentMethod: destination.name };

    const statements = partial
      ? [
          db.update(expense).set(patch).where(and(
            eq(expense.userId, userId),
            eq(expense.accountId, source.id),
            inArray(expense.id, input.transactionIds!),
          )),
          db.update(income).set(patch).where(and(
            eq(income.userId, userId),
            eq(income.accountId, source.id),
            inArray(income.id, input.transactionIds!),
          )),
          db.update(balanceAdjustment).set(patch).where(and(
            eq(balanceAdjustment.userId, userId),
            eq(balanceAdjustment.accountId, source.id),
            inArray(balanceAdjustment.id, input.transactionIds!),
          )),
        ]
      : [
          db.update(expense).set(patch).where(and(eq(expense.userId, userId), eq(expense.accountId, source.id))),
          db.update(income).set(patch).where(and(eq(income.userId, userId), eq(income.accountId, source.id))),
          db.update(balanceAdjustment).set(patch).where(and(eq(balanceAdjustment.userId, userId), eq(balanceAdjustment.accountId, source.id))),
          db.update(recurringRule).set({ ...patch, updatedAt: new Date().toISOString() })
            .where(and(eq(recurringRule.userId, userId), eq(recurringRule.accountId, source.id))),
        ];

    await db.batch(statements as unknown as Parameters<typeof db.batch>[0]);

    revalidateAll();
    return { ok: true };
  } catch (error) {
    return handleUnexpected('moveAccountRecordsAction', error);
  }
}

export const hibernateAccountAction = withSessionUser(hibernateAccount);
export interface AccountUsageRecord {
  id: string;
  /** 'expense' | 'income' | 'adjustment' - the table the row lives in. */
  kind: 'expense' | 'income' | 'adjustment';
  description: string;
  date: string;
  amount: number;
}

export interface AccountUsage {
  records: AccountUsageRecord[];
  /** Rules are counted, not listed: a schedule is not a row in the ledger. */
  ruleCount: number;
}

export type AccountUsageResult =
  | { ok: true; usage: AccountUsage }
  | { ok: false; error: string; kind?: FailureKind; code?: ServerErrorCode };

/**
 * Everything attached to an account, for the move flow.
 *
 * All four record types are counted because deletion requires the account to
 * be empty of every one of them. Rules are returned as a COUNT rather than a
 * list: they are schedules, not ledger rows, and are not individually
 * selectable in a partial move.
 */
async function loadAccountUsage(userId: string, accountId: string): Promise<AccountUsageResult> {
  try {
    const [expenses, incomeRows, adjustments, rules] = await Promise.all([
      db.select({ id: expense.id, description: expense.description, date: expense.transactionDate, amount: expense.amount })
        .from(expense).where(and(eq(expense.userId, userId), eq(expense.accountId, accountId)))
        .orderBy(desc(expense.transactionDate)),
      db.select({ id: income.id, description: income.description, date: income.transactionDate, amount: income.netAmount })
        .from(income).where(and(eq(income.userId, userId), eq(income.accountId, accountId)))
        .orderBy(desc(income.transactionDate)),
      db.select({ id: balanceAdjustment.id, description: balanceAdjustment.description, date: balanceAdjustment.transactionDate, amount: balanceAdjustment.amount })
        .from(balanceAdjustment).where(and(eq(balanceAdjustment.userId, userId), eq(balanceAdjustment.accountId, accountId)))
        .orderBy(desc(balanceAdjustment.transactionDate)),
      db.select({ id: recurringRule.id })
        .from(recurringRule).where(and(eq(recurringRule.userId, userId), eq(recurringRule.accountId, accountId))),
    ]);

    const records: AccountUsageRecord[] = [
      ...expenses.map((r) => ({ ...r, kind: 'expense' as const })),
      ...incomeRows.map((r) => ({ ...r, kind: 'income' as const })),
      ...adjustments.map((r) => ({ ...r, kind: 'adjustment' as const })),
    ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

    return { ok: true, usage: { records, ruleCount: rules.length } };
  } catch (error) {
    console.error('[pebble action] getAccountUsageAction', error);
    return {
      ok: false,
      error: "Couldn't check that account.",
      kind: classifyError(error) === 'database' ? 'database' : 'unknown',
      code: 'loader.accountUsageFailed',
    };
  }
}

export const moveAccountRecordsAction = withSessionUser(moveAccountRecords);
export const getAccountUsageAction = withSessionUser(loadAccountUsage);

export interface AccountDeletionBalanceRow {
  accountId: string;
  name: string;
  before: number;
  /** null = this account is the one being deleted. */
  after: number | null;
}

export interface AccountDeletionPreview {
  accountName: string;
  counts: { expenses: number; income: number; adjustments: number; transfers: number; rules: number };
  /** Every row pointing at the account - the tripwire the delete re-checks. */
  recordTotal: number;
  /** The account itself first, then every OTHER account whose balance changes. */
  balances: AccountDeletionBalanceRow[];
  /** Names of accounts on the far side of transfers that will be removed. */
  transferAccounts: string[];
  totalBefore: number;
  totalAfter: number;
  allocated: number;
}

export type AccountDeletionPreviewResult =
  | { ok: true; preview: AccountDeletionPreview }
  | { ok: false; error: string; kind?: FailureKind; code?: ServerErrorCode };

/**
 * Fresh figures for the delete dialog. Balances use the same rule as
 * computeCurrentBalances (signed amounts on this user's accounts), in cents.
 * "After" removes the account's own rows AND both halves of every transfer
 * touching it - exactly what deleteAccountWithRecords deletes.
 */
async function loadAccountDeletionPreview(userId: string, accountId: string): Promise<AccountDeletionPreviewResult> {
  try {
    const [accts, exp, inc, adj, rules, goals] = await Promise.all([
      db.select({ id: account.id, name: account.name }).from(account).where(eq(account.userId, userId)),
      db.select({ accountId: expense.accountId, amount: expense.amount }).from(expense).where(eq(expense.userId, userId)),
      db.select({ accountId: income.accountId, amount: income.netAmount }).from(income).where(eq(income.userId, userId)),
      db.select({ accountId: balanceAdjustment.accountId, amount: balanceAdjustment.amount, group: balanceAdjustment.transferGroupId })
        .from(balanceAdjustment).where(eq(balanceAdjustment.userId, userId)),
      db.select({ id: recurringRule.id }).from(recurringRule)
        .where(and(eq(recurringRule.userId, userId), eq(recurringRule.accountId, accountId))),
      db.select({ current: goal.currentAmount }).from(goal).where(eq(goal.userId, userId)),
    ]);

    const target = accts.find((a) => a.id === accountId);
    if (!target) return { ok: false, error: 'That account no longer exists.', kind: 'validation', code: 'notFound.account' };

    const cents = (n: number) => Math.round(n * 100);
    const groups = new Set(adj.filter((r) => r.accountId === accountId && r.group).map((r) => r.group as string));
    const before = new Map<string, number>();
    const after = new Map<string, number>();
    accts.forEach((a) => {
      before.set(a.id, 0);
      if (a.id !== accountId) after.set(a.id, 0);
    });
    const add = (m: Map<string, number>, id: string, amount: number) => {
      const current = m.get(id);
      if (current !== undefined) m.set(id, current + cents(amount));
    };
    exp.forEach((r) => { add(before, r.accountId, r.amount); if (r.accountId !== accountId) add(after, r.accountId, r.amount); });
    inc.forEach((r) => { add(before, r.accountId, r.amount); if (r.accountId !== accountId) add(after, r.accountId, r.amount); });
    adj.forEach((r) => {
      add(before, r.accountId, r.amount);
      const removed = r.accountId === accountId || (r.group !== null && groups.has(r.group));
      if (!removed) add(after, r.accountId, r.amount);
    });

    const onAccount = <T extends { accountId: string }>(list: T[]) => list.filter((r) => r.accountId === accountId);
    const counts = {
      expenses: onAccount(exp).length,
      income: onAccount(inc).length,
      adjustments: onAccount(adj).filter((r) => !r.group).length,
      transfers: groups.size,
      rules: rules.length,
    };
    const recordTotal = counts.expenses + counts.income + onAccount(adj).length + counts.rules;
    const nameOf = (id: string) => accts.find((a) => a.id === id)?.name ?? '';
    const total = (m: Map<string, number>) => [...m.values()].reduce((s, v) => s + v, 0) / 100;

    const balances: AccountDeletionBalanceRow[] = [
      { accountId, name: target.name, before: (before.get(accountId) ?? 0) / 100, after: null },
      ...accts
        .filter((a) => a.id !== accountId && before.get(a.id) !== after.get(a.id))
        .map((a) => ({ accountId: a.id, name: a.name, before: (before.get(a.id) ?? 0) / 100, after: (after.get(a.id) ?? 0) / 100 })),
    ];
    const transferAccounts = [...new Set(
      adj.filter((r) => r.group !== null && groups.has(r.group) && r.accountId !== accountId).map((r) => nameOf(r.accountId)),
    )];

    return {
      ok: true,
      preview: {
        accountName: target.name,
        counts,
        recordTotal,
        balances,
        transferAccounts,
        totalBefore: total(before),
        totalAfter: total(after),
        allocated: goals.reduce((s, g) => s + cents(g.current), 0) / 100,
      },
    };
  } catch (error) {
    console.error('[pebble action] getAccountDeletionPreviewAction', error);
    return { ok: false, error: "Couldn't check this account.", kind: classifyError(error) === 'database' ? 'database' : 'unknown', code: 'loader.accountDeletionPreviewFailed' };
  }
}

/**
 * TRIPWIRE for the account deletes below. Counts every row pointing at the
 * account and, if it differs from what the user reviewed, divides by zero -
 * SQLSTATE 22012 - which aborts the WHOLE transaction: nothing moves, nothing
 * is deleted. Plain SQL has no RAISE, and this keeps the check inside the
 * same locked transaction as the writes, where it cannot go stale.
 * isTripwire() recognises that exact failure.
 */
function recordCountTripwire(userId: string, accountId: string, expected: number) {
  return neonSql`
    SELECT 1 / (CASE WHEN
        (SELECT count(*) FROM expense WHERE user_id = ${userId}::uuid AND account_id = ${accountId})
      + (SELECT count(*) FROM income WHERE user_id = ${userId}::uuid AND account_id = ${accountId})
      + (SELECT count(*) FROM balance_adjustment WHERE user_id = ${userId}::uuid AND account_id = ${accountId})
      + (SELECT count(*) FROM recurring_rule WHERE user_id = ${userId}::uuid AND account_id = ${accountId})
      = ${expected} THEN 1 ELSE 0 END) AS unchanged
  `;
}

function isTripwire(error: unknown): boolean {
  let e: unknown = error;
  for (let i = 0; i < 3 && e; i++) {
    const code = (e as { code?: unknown }).code;
    const message = String((e as { message?: unknown }).message ?? '');
    if (code === '22012' || message.includes('division by zero')) return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

const ACCOUNT_CHANGED = 'This account changed while you were reviewing it. Check the updated details and try again.';

/**
 * Deletes an account AND every record in it, as if none had ever existed.
 *
 * This DELIBERATELY relaxes deleteAccount's "must be empty" rule, and only
 * behind the dialog's preview, typed name and countdown. Everything happens
 * in ONE transaction behind the per-user lock: the tripwire, both halves of
 * every transfer touching the account (the far side's balance changes, and
 * the preview says so), its other adjustments, expenses, income, recurring
 * rules, and finally the account. ON DELETE RESTRICT still guards the last
 * statement: if anything were missed, the database refuses and it all rolls
 * back. The typed name is re-checked here so a stray retry cannot fire it.
 */
async function deleteAccountWithRecords(
  userId: string,
  input: { accountId: string; confirmName: string; expectedRecordCount: number },
): Promise<ActionResult> {
  try {
    const rows = await db
      .select({ id: account.id, name: account.name, isDefault: account.isDefault })
      .from(account)
      .where(and(eq(account.userId, userId), eq(account.id, input.accountId)))
      .limit(1);
    const target = rows[0];
    if (!target) return fail('That account no longer exists.', 'validation', 'notFound.account');
    if (target.isDefault) {
      return fail('The default Checking and Cash accounts cannot be deleted.', 'validation', 'validation.accountDefaultCannotClose');
    }
    if (typeof input.confirmName !== 'string' || input.confirmName.trim() !== target.name.trim()) {
      return fail('The name you typed does not match this account.', 'validation', 'validation.accountDeleteNameMismatch');
    }
    if (!Number.isInteger(input.expectedRecordCount) || input.expectedRecordCount < 0) {
      return fail(ACCOUNT_CHANGED, 'validation', 'validation.accountChangedSinceReview');
    }

    const a = target.id;
    const results = await neonSql.transaction(
      [
        userWriteLockStatement(userId),
        recordCountTripwire(userId, a, input.expectedRecordCount),
        neonSql`DELETE FROM balance_adjustment WHERE user_id = ${userId}::uuid AND transfer_group_id IN (
          SELECT transfer_group_id FROM balance_adjustment
          WHERE user_id = ${userId}::uuid AND account_id = ${a} AND transfer_group_id IS NOT NULL)`,
        neonSql`DELETE FROM balance_adjustment WHERE user_id = ${userId}::uuid AND account_id = ${a}`,
        neonSql`DELETE FROM expense WHERE user_id = ${userId}::uuid AND account_id = ${a}`,
        neonSql`DELETE FROM income WHERE user_id = ${userId}::uuid AND account_id = ${a}`,
        neonSql`DELETE FROM recurring_rule WHERE user_id = ${userId}::uuid AND account_id = ${a}`,
        neonSql`DELETE FROM account WHERE user_id = ${userId}::uuid AND id = ${a} AND is_default = false RETURNING id`,
      ],
      { isolationLevel: 'ReadCommitted' },
    );
    const deleted = results[results.length - 1] as unknown;
    if (!Array.isArray(deleted) || deleted.length !== 1) {
      return fail('That account no longer exists.', 'validation', 'notFound.account');
    }

    revalidateAll();
    return { ok: true };
  } catch (error) {
    if (isTripwire(error)) return fail(ACCOUNT_CHANGED, 'validation', 'validation.accountChangedSinceReview');
    return handleUnexpected('deleteAccountWithRecordsAction', error);
  }
}

/**
 * Moves every record and scheduled payment to another ACTIVE account, then
 * deletes the now-empty account - one transaction behind the per-user lock,
 * with the same tripwire. Nothing is lost and the total balance is unchanged.
 */
async function moveAndDeleteAccount(
  userId: string,
  input: { accountId: string; toAccountId: string; expectedRecordCount: number },
): Promise<ActionResult> {
  try {
    if (input.accountId === input.toAccountId) {
      return fail('Choose a different destination account.', 'validation', 'validation.moveSameAccount');
    }
    const rows = await db
      .select({ id: account.id, status: account.status, name: account.name, isDefault: account.isDefault })
      .from(account)
      .where(and(eq(account.userId, userId), inArray(account.id, [input.accountId, input.toAccountId])));
    const source = rows.find((r) => r.id === input.accountId);
    const destination = rows.find((r) => r.id === input.toAccountId);
    if (!source || !destination) return fail('That account no longer exists.', 'validation', 'notFound.account');
    if (source.isDefault) {
      return fail('The default Checking and Cash accounts cannot be deleted.', 'validation', 'validation.accountDefaultCannotClose');
    }
    if (destination.status !== 'active') {
      return fail('Records can only be moved into an active account.', 'validation', 'validation.moveDestinationInactive');
    }
    if (!Number.isInteger(input.expectedRecordCount) || input.expectedRecordCount < 0) {
      return fail(ACCOUNT_CHANGED, 'validation', 'validation.accountChangedSinceReview');
    }

    const from = source.id;
    const to = destination.id;
    const toName = destination.name;
    const results = await neonSql.transaction(
      [
        userWriteLockStatement(userId),
        recordCountTripwire(userId, from, input.expectedRecordCount),
        neonSql`UPDATE expense SET account_id = ${to}, payment_method = ${toName} WHERE user_id = ${userId}::uuid AND account_id = ${from}`,
        neonSql`UPDATE income SET account_id = ${to}, payment_method = ${toName} WHERE user_id = ${userId}::uuid AND account_id = ${from}`,
        neonSql`UPDATE balance_adjustment SET account_id = ${to}, payment_method = ${toName} WHERE user_id = ${userId}::uuid AND account_id = ${from}`,
        neonSql`UPDATE recurring_rule SET account_id = ${to}, payment_method = ${toName}, updated_at = now() WHERE user_id = ${userId}::uuid AND account_id = ${from}`,
        neonSql`DELETE FROM account WHERE user_id = ${userId}::uuid AND id = ${from} AND is_default = false RETURNING id`,
      ],
      { isolationLevel: 'ReadCommitted' },
    );
    const deleted = results[results.length - 1] as unknown;
    if (!Array.isArray(deleted) || deleted.length !== 1) {
      return fail('That account no longer exists.', 'validation', 'notFound.account');
    }

    revalidateAll();
    return { ok: true };
  } catch (error) {
    if (isTripwire(error)) return fail(ACCOUNT_CHANGED, 'validation', 'validation.accountChangedSinceReview');
    return handleUnexpected('moveAndDeleteAccountAction', error);
  }
}

export const getAccountDeletionPreviewAction = withSessionUser(loadAccountDeletionPreview);
export const deleteAccountWithRecordsAction = withSessionUser(deleteAccountWithRecords);
export const moveAndDeleteAccountAction = withSessionUser(moveAndDeleteAccount);

/**
 * Deletes the signed-in user's Pebble account and EVERYTHING they own.
 *
 * Neon Auth's own delete-user endpoint is disabled (it answers 404), so the
 * user row is deleted here. Every Pebble table - and Neon's sessions and
 * sign-in records - references neon_auth."user" ON DELETE CASCADE (verified
 * against the live database), so ONE statement removes every row carrying
 * this user's id and nothing else: no path exists to another user's data.
 *
 * The id comes from the session (withSessionUser), never from the browser.
 * The typed email must match exactly. One transaction behind the per-user
 * lock; any failure rolls it all back. The browser's sign-in cookies are
 * cleared here because Neon, which would normally do it, is not involved.
 */
async function deletePebbleAccount(userId: string, input: { confirmEmail: string }): Promise<ActionResult> {
  try {
    const rows = await db
      .select({ email: userInNeonAuth.email })
      .from(userInNeonAuth)
      .where(eq(userInNeonAuth.id, userId))
      .limit(1);
    const me = rows[0];
    if (!me) return fail('Your account could not be found.', 'validation', 'notFound.user');
    if (typeof input.confirmEmail !== 'string'
      || input.confirmEmail.trim().toLowerCase() !== me.email.trim().toLowerCase()) {
      return fail('The email you typed does not match your account.', 'validation', 'validation.deleteAccountEmailMismatch');
    }

    const results = await neonSql.transaction(
      [
        userWriteLockStatement(userId),
        neonSql`DELETE FROM neon_auth."user" WHERE id = ${userId}::uuid RETURNING id`,
      ],
      { isolationLevel: 'ReadCommitted' },
    );
    const deleted = results[1] as unknown;
    if (!Array.isArray(deleted) || deleted.length !== 1) {
      return fail('Your account could not be found.', 'validation', 'notFound.user');
    }

    // Expire every auth cookie on this browser. Secure matches the
    // __Secure- names Neon Auth uses.
    const jar = await cookies();
    for (const c of jar.getAll()) {
      if (/neon-auth|better-auth/i.test(c.name)) {
        jar.set(c.name, '', { path: '/', maxAge: 0, secure: true, httpOnly: true, sameSite: 'lax' });
      }
    }
    return { ok: true };
  } catch (error) {
    return handleUnexpected('deletePebbleAccountAction', error);
  }
}

export const deletePebbleAccountAction = withSessionUser(deletePebbleAccount);
/**
 * Sets the account that transaction forms preselect.
 *
 * The clear and the set run in ONE batch(): a partial failure would either
 * leave two preferred accounts (which the unique index refuses outright, so
 * the whole thing would fail) or none at all.
 *
 * Hibernated accounts cannot be preferred - preselecting an account that
 * rejects new transactions would be broken by construction.
 *
 * Passing the currently-preferred account clears the preference, so the star
 * is a toggle rather than a one-way switch.
 */
async function setPreferredAccount(userId: string, accountId: string): Promise<ActionResult> {
  try {
    const rows = await db
      .select({ id: account.id, status: account.status, isPreferred: account.isPreferred })
      .from(account)
      .where(and(eq(account.userId, userId), eq(account.id, accountId)))
      .limit(1);

    const target = rows[0];
    if (!target) return fail('That account no longer exists.', 'validation', 'notFound.account');
    if (target.status !== 'active') {
      return fail('A hibernated account cannot be the preferred one.', 'validation', 'validation.preferredMustBeActive');
    }

    const clear = db
      .update(account)
      .set({ isPreferred: false, updatedAt: new Date().toISOString() })
      .where(and(eq(account.userId, userId), eq(account.isPreferred, true)));

    if (target.isPreferred) {
      // Toggling the current preference off leaves none, and forms fall back
      // to the first account as they did before any preference existed.
      await clear;
    } else {
      await db.batch([
        clear,
        db.update(account)
          .set({ isPreferred: true, updatedAt: new Date().toISOString() })
          .where(and(eq(account.userId, userId), eq(account.id, accountId))),
      ]);
    }

    revalidateAll();
    return { ok: true };
  } catch (error) {
    return handleUnexpected('setPreferredAccountAction', error);
  }
}

export const wakeAccountAction = withSessionUser(wakeAccount);
export const setPreferredAccountAction = withSessionUser(setPreferredAccount);
export const deleteAccountAction = withSessionUser(deleteAccount);
