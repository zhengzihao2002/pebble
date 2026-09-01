import 'server-only';

import { and, asc, desc, eq, isNull, ne, or, lt } from 'drizzle-orm';
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
  account,
} from '@/db/schema';
import type {
  BalanceAdjustment,
  ExpenseTransaction,
  Goal,
  IncomeTransaction,
  RecurringRule,
} from '@/types';
import {
  DEFAULT_CATEGORY_SEED,
  FALLBACK_CATEGORY_COLOR,
  FALLBACK_CATEGORY_ICON_KEY,
  FALLBACK_CATEGORY_NAME,
} from '@/data/seed';
import { generateId } from '@/lib/ids';
import {
  mapBalanceAdjustmentRow,
  mapBudgetRows,
  mapCategoryRow,
  type CategoryItem,
  mapExpenseRow,
  mapGoalRow,
  mapIncomeRow,
  mapRecurringRuleRow,
  mapAccountRow,
  type Account,
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
 *
 * EXCEPTION: getCategories() writes as well as reads. Every other function
 * in this file is pure. See the warning on that function before calling it
 * from anywhere new.
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
 * Every account, closed ones included. Callers filter by status themselves:
 * dropdowns want active only, but transaction DISPLAY needs closed accounts
 * too, since historical rows still reference them.
 */
export async function getAccounts(userId: string): Promise<Account[]> {
  const rows = await db
    .select()
    .from(account)
    .where(eq(account.userId, userId))
    .orderBy(account.sortOrder);

  return rows.map(mapAccountRow);
}

/**
 * The user's stored timezone override, or null when they have not pinned one.
 *
 * Reads only the time_zone column - the rest of user_account is legacy:
 * checking_opening and cash_opening were superseded by per-account balances
 * and zeroed, and are kept only as a record of the original values.
 * Read on every page load by resolveUserTimeZone().
 */
export async function getUserTimeZoneOverride(userId: string): Promise<string | null> {
  const rows = await db
    .select({ timeZone: userAccount.timeZone })
    .from(userAccount)
    .where(eq(userAccount.userId, userId))
    .limit(1);

  return rows[0]?.timeZone ?? null;
}


/**
 * Returns the user's categories, seeding the defaults on first access.
 *
 * Seeding lazily rather than on sign-up means this also backfills accounts
 * created before categories existed, with no migration script and no
 * dependency on the auth provider's lifecycle hooks.
 *
 * onConflictDoNothing makes a concurrent double-seed harmless: the
 * UNIQUE (user_id, name) constraint absorbs the duplicate rather than
 * erroring or creating two of everything.
 *
 * ---------------------------------------------------------------------------
 * WARNING: THIS READ FUNCTION WRITES. It is the only one in this file that
 * does.
 *
 * It must NEVER be called from a statically-rendered Server Component. A
 * static render would execute the seeding once at BUILD time instead of
 * per-user at request time, baking one account's categories into HTML served
 * to everyone.
 *
 * Any Server Component reaching this - directly or through a page's data
 * fetch - MUST declare `export const dynamic = 'force-dynamic'`. As of this
 * writing all six pages under (app)/ do, and the Neon Auth SDK requires it of
 * them independently, so the constraint is satisfied twice over. Calling it
 * from a Server Action is always safe: actions are never statically rendered.
 *
 * The alternative - splitting this into a pure getCategories() plus an
 * explicit ensureCategories() - was considered and rejected. It trades this
 * latent constraint for an active failure mode: any read path that forgot to
 * ensure first would show a real user zero categories and break the expense
 * form. Seeding here is idempotent and self-healing, including for accounts
 * created before categories existed.
 * ---------------------------------------------------------------------------
 */
export async function getCategories(userId: string): Promise<CategoryItem[]> {
  const rows = await db
    .select()
    .from(category)
    .where(eq(category.userId, userId))
    .orderBy(asc(category.sortOrder), asc(category.name));

  if (rows.length > 0) {
    return rows.map(mapCategoryRow);
  }

  const seed = [
    ...DEFAULT_CATEGORY_SEED.map((entry, index) => ({
      id: generateId(),
      userId,
      name: entry.name,
      iconKey: entry.iconKey,
      color: entry.color,
      isSystem: false,
      sortOrder: index,
    })),
    {
      id: generateId(),
      userId,
      name: FALLBACK_CATEGORY_NAME,
      iconKey: FALLBACK_CATEGORY_ICON_KEY,
      color: FALLBACK_CATEGORY_COLOR,
      isSystem: true,
      sortOrder: DEFAULT_CATEGORY_SEED.length,
    },
  ];

  await db.insert(category).values(seed).onConflictDoNothing();

  const seeded = await db
    .select()
    .from(category)
    .where(eq(category.userId, userId))
    .orderBy(asc(category.sortOrder), asc(category.name));

  return seeded.map(mapCategoryRow);
}

/**
 * Manual balance corrections. Fetched only by the pages that render the
 * statement ledger or a balance total - never by Reports.
 */
export async function getBalanceAdjustments(userId: string): Promise<BalanceAdjustment[]> {
  const rows = await db
    .select()
    .from(balanceAdjustment)
    .where(eq(balanceAdjustment.userId, userId))
    .orderBy(desc(balanceAdjustment.transactionDate), desc(balanceAdjustment.id));

  return rows.map(mapBalanceAdjustmentRow);
}

/** Whether the account has any recorded transaction at all. */
export async function hasAnyTransactions(userId: string): Promise<boolean> {
  const [expenseRows, incomeRows] = await Promise.all([
    db.select({ id: expense.id }).from(expense).where(eq(expense.userId, userId)).limit(1),
    db.select({ id: income.id }).from(income).where(eq(income.userId, userId)).limit(1),
  ]);
  return expenseRows.length > 0 || incomeRows.length > 0;
}

/**
 * All rules the user can see. Excludes soft-deleted rows.
 *
 * Ordered active-first (status ascending puts 'active' before 'paused'), then
 * by start date, so the management list leads with what is actually running.
 */
export async function getRecurringRules(userId: string): Promise<RecurringRule[]> {
  const rows = await db
    .select()
    .from(recurringRule)
    .where(and(eq(recurringRule.userId, userId), ne(recurringRule.status, 'deleted')))
    .orderBy(asc(recurringRule.status), asc(recurringRule.startDate), asc(recurringRule.id));

  return rows.map(mapRecurringRuleRow);
}

/**
 * Rules that MIGHT owe an occurrence as of `today`. Read-only.
 *
 * This is the cheap gate on every page load: with no rules, or with every rule
 * already caught up, it is one indexed query returning zero rows and catch-up
 * exits immediately. Deliberately does not compute occurrences - that is the
 * caller's job - because a rule can pass this filter and still owe nothing
 * (an exhausted endCount, or an end date already passed).
 *
 * `today` must come from todayInAppZone(), never getToday(): getToday() returns
 * UTC on Vercel, so a New Jersey evening is already tomorrow server-side and a
 * rule would materialize a day early.
 */
export async function getRulesDueForCatchUp(
  userId: string,
  today: string,
): Promise<RecurringRule[]> {
  const rows = await db
    .select()
    .from(recurringRule)
    .where(
      and(
        eq(recurringRule.userId, userId),
        eq(recurringRule.status, 'active'),
        or(
          isNull(recurringRule.materializedThrough),
          lt(recurringRule.materializedThrough, today),
        ),
      ),
    )
    .orderBy(asc(recurringRule.startDate), asc(recurringRule.id));

  return rows.map(mapRecurringRuleRow);
}

/**
 * A single rule, scoped to its owner.
 *
 * The userId filter is the ownership check for actions that take a rule id
 * from the client. withSessionUser proves WHO is asking; it does not prove
 * WHAT they own. A rule id belonging to another user returns undefined here.
 */
export async function getRecurringRuleById(
  userId: string,
  ruleId: string,
): Promise<RecurringRule | undefined> {
  const rows = await db
    .select()
    .from(recurringRule)
    .where(and(eq(recurringRule.userId, userId), eq(recurringRule.id, ruleId)))
    .limit(1);

  return rows[0] ? mapRecurringRuleRow(rows[0]) : undefined;
}
