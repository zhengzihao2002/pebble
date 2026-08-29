/**
 * Pebble database schema.
 *
 * HAND-MAINTAINED. Verified against the live Neon database via `drizzle-kit pull`.
 * Do NOT paste raw pull output over this file. Every pull requires these fixes:
 *   1. `.default(')`  ->  `.default('')`   (6 sites: expense.description/category/tag,
 *      income.description/category, goal.target_date)
 *   2. numeric columns need `mode: 'number'` re-applied (see note below)
 *   3. user_id index opclass renders as `date_ops`; correct value is `uuid_ops`
 *   4. pull re-emits all 9 neon_auth tables; only `user` is kept here
 *
 * NEVER run `drizzle-kit push` or `drizzle-kit generate`. Pull (read-only) only.
 * Schema changes are written as reviewable SQL and run manually in the Neon SQL Editor.
 *
 * MONEY: all numeric(12,2) columns use `mode: 'number'`, so Drizzle converts
 * string <-> number at the driver boundary. Caveat: this does NOT apply to computed
 * SQL. `sum(expense.amount)` returns a STRING regardless — convert those by hand.
 *
 * user_id has NO default, deliberately. An insert that omits it must fail loudly
 * rather than silently misattribute financial data.
 */

import {
  pgTable,
  pgSchema,
  index,
  foreignKey,
  primaryKey,
  check,
  unique,
  uuid,
  text,
  boolean,
  integer,
  date,
  numeric,
  timestamp,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const neonAuth = pgSchema('neon_auth');

/** Managed by Neon Auth. Read-only from this app's perspective. */
export const userInNeonAuth = neonAuth.table(
  'user',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    name: text().notNull(),
    email: text().notNull(),
    emailVerified: boolean().notNull(),
    image: text(),
    createdAt: timestamp({ withTimezone: true, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp({ withTimezone: true, mode: 'string' })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    role: text(),
    banned: boolean(),
    banReason: text(),
    banExpires: timestamp({ withTimezone: true, mode: 'string' }),
  },
  (table) => [unique('user_email_key').on(table.email)],
);

/**
 * Scheduled & recurring payment rules. A rule is a TEMPLATE; the transactions
 * it produces are ordinary expense/income rows that carry recurringRuleId +
 * occurrenceDate back to here.
 *
 * NO DEFAULTS except status and the timestamps - those are the only ones that
 * exist in the database. Declaring a .default() Drizzle-side that Postgres does
 * not have would make the column optional in $inferInsert and produce a NOT
 * NULL violation at runtime.
 *
 * `once` is stored as frequency 'once' + endMode 'after' + endCount 1 so the
 * occurrence generator has exactly one code path instead of a special case.
 *
 * Deletion is SOFT (status 'deleted'). A hard delete would strip the rule link
 * off real historical transactions, and recreating an identical rule afterwards
 * would re-materialize its whole past as duplicates from a null high-water mark.
 */
export const recurringRule = pgTable(
  'recurring_rule',
  {
    id: text().primaryKey().notNull(),
    userId: uuid('user_id').notNull(),
    /** 'expense' | 'income' */
    kind: text().notNull(),
    description: text().notNull(),
    category: text().notNull(),
    /** expense only - the income table has no tag column */
    tag: text(),
    paymentMethod: text('payment_method').notNull(),
    /** expense: <= 0. income: the NET amount, >= 0. Mirrors the target table. */
    amount: numeric({ precision: 12, scale: 2, mode: 'number' }).notNull(),
    /** income only, and required there */
    grossAmount: numeric('gross_amount', { precision: 12, scale: 2, mode: 'number' }),
    /** 'once' | 'weekly' | 'biweekly' | 'monthly' | 'yearly' */
    frequency: text().notNull(),
    /** First occurrence AND the anchor: weekday, day-of-month, or month+day. */
    startDate: date('start_date').notNull(),
    /** 'never' | 'after' | 'on' */
    endMode: text('end_mode').notNull(),
    endCount: integer('end_count'),
    endDate: date('end_date'),
    /** 'active' | 'paused' | 'deleted' */
    status: text().default('active').notNull(),
    /**
     * High-water mark. Catch-up only ever examines (materializedThrough, today],
     * so deleting an unwanted materialized transaction is permanent - nothing
     * resurrects it - and no code path can write below the mark, which is what
     * structurally enforces "edits affect future occurrences only".
     */
    materializedThrough: date('materialized_through'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('recurring_rule_user_id_idx').using(
      'btree',
      table.userId.asc().nullsLast().op('uuid_ops'),
    ),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [userInNeonAuth.id],
      name: 'recurring_rule_user_id_fkey',
    }).onDelete('cascade'),
    check('recurring_rule_kind_check', sql`kind = ANY (ARRAY['expense'::text, 'income'::text])`),
    check(
      'recurring_rule_payment_method_check',
      sql`payment_method = ANY (ARRAY['Checking'::text, 'Cash'::text])`,
    ),
    check(
      'recurring_rule_frequency_check',
      sql`frequency = ANY (ARRAY['once'::text, 'weekly'::text, 'biweekly'::text, 'monthly'::text, 'yearly'::text])`,
    ),
    check(
      'recurring_rule_end_mode_check',
      sql`end_mode = ANY (ARRAY['never'::text, 'after'::text, 'on'::text])`,
    ),
    check(
      'recurring_rule_status_check',
      sql`status = ANY (ARRAY['active'::text, 'paused'::text, 'deleted'::text])`,
    ),
    check(
      'recurring_rule_kind_shape_check',
      sql`((kind = 'expense'::text) AND (amount <= (0)::numeric) AND (gross_amount IS NULL))
          OR ((kind = 'income'::text) AND (amount >= (0)::numeric)
              AND (gross_amount IS NOT NULL) AND (gross_amount >= (0)::numeric)
              AND (tag IS NULL))`,
    ),
    check(
      'recurring_rule_end_shape_check',
      sql`((end_mode = 'never'::text) AND (end_count IS NULL) AND (end_date IS NULL))
          OR ((end_mode = 'after'::text) AND (end_count IS NOT NULL) AND (end_count > 0) AND (end_date IS NULL))
          OR ((end_mode = 'on'::text) AND (end_count IS NULL) AND (end_date IS NOT NULL) AND (end_date >= start_date))`,
    ),
    check(
      'recurring_rule_once_check',
      sql`(frequency <> 'once'::text) OR ((end_mode = 'after'::text) AND (end_count = 1))`,
    ),
  ],
);

/** Expenses. `amount` is always <= 0 (enforced by CHECK). */
export const expense = pgTable(
  'expense',
  {
    id: text().primaryKey().notNull(),
    userId: uuid('user_id').notNull(),
    description: text().default('').notNull(),
    category: text().default('').notNull(),
    tag: text().default('').notNull(),
    transactionDate: date('transaction_date').notNull(),
    paymentMethod: text('payment_method').default('Checking').notNull(),
    amount: numeric({ precision: 12, scale: 2, mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    /** Set only on rows materialized from a recurring rule. NULL for hand entry. */
    recurringRuleId: text('recurring_rule_id'),
    /**
     * The rule occurrence this row represents. Immutable identity - distinct from
     * transactionDate, which the user may edit afterwards. (rule, occurrence) is
     * UNIQUE, which is the sole idempotency guard against double materialization.
     */
    occurrenceDate: date('occurrence_date'),
  },
  (table) => [
    index('expense_user_date_idx').using(
      'btree',
      table.userId.asc().nullsLast().op('uuid_ops'),
      table.transactionDate.desc().nullsFirst().op('date_ops'),
    ),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [userInNeonAuth.id],
      name: 'expense_user_id_fkey',
    }).onDelete('cascade'),
    check('expense_amount_check', sql`amount <= (0)::numeric`),
    check(
      'expense_payment_method_check',
      sql`payment_method = ANY (ARRAY['Checking'::text, 'Cash'::text])`,
    ),
    foreignKey({
      columns: [table.recurringRuleId],
      foreignColumns: [recurringRule.id],
      name: 'expense_recurring_rule_id_fkey',
    }).onDelete('set null'),
    /**
     * Postgres treats NULLs as DISTINCT by default, so every hand-entered row
     * is (NULL, NULL) and none of them collide - now or ever.
     */
    unique('expense_recurring_occurrence_uniq').on(table.recurringRuleId, table.occurrenceDate),
    check(
      'expense_recurring_pair_check',
      sql`(recurring_rule_id IS NULL) OR (occurrence_date IS NOT NULL)`,
    ),
  ],
);

/** Income. Deliberately has NO `tag` column - the Add Income form never collects one. */
export const income = pgTable(
  'income',
  {
    id: text().primaryKey().notNull(),
    userId: uuid('user_id').notNull(),
    description: text().default('').notNull(),
    category: text().default('').notNull(),
    transactionDate: date('transaction_date').notNull(),
    paymentMethod: text('payment_method').default('Checking').notNull(),
    grossAmount: numeric('gross_amount', { precision: 12, scale: 2, mode: 'number' }).notNull(),
    netAmount: numeric('net_amount', { precision: 12, scale: 2, mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    /** See the matching columns on `expense`. */
    recurringRuleId: text('recurring_rule_id'),
    occurrenceDate: date('occurrence_date'),
  },
  (table) => [
    index('income_user_date_idx').using(
      'btree',
      table.userId.asc().nullsLast().op('uuid_ops'),
      table.transactionDate.desc().nullsFirst().op('date_ops'),
    ),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [userInNeonAuth.id],
      name: 'income_user_id_fkey',
    }).onDelete('cascade'),
    check(
      'income_amounts_check',
      sql`(gross_amount >= (0)::numeric) AND (net_amount >= (0)::numeric)`,
    ),
    check(
      'income_payment_method_check',
      sql`payment_method = ANY (ARRAY['Checking'::text, 'Cash'::text])`,
    ),
    foreignKey({
      columns: [table.recurringRuleId],
      foreignColumns: [recurringRule.id],
      name: 'income_recurring_rule_id_fkey',
    }).onDelete('set null'),
    unique('income_recurring_occurrence_uniq').on(table.recurringRuleId, table.occurrenceDate),
    check(
      'income_recurring_pair_check',
      sql`(recurring_rule_id IS NULL) OR (occurrence_date IS NOT NULL)`,
    ),
  ],
);

/** Savings goals. `iconKey` is a STRING key into GOAL_ICON_OPTIONS, not a component. */
export const goal = pgTable(
  'goal',
  {
    id: text().primaryKey().notNull(),
    userId: uuid('user_id').notNull(),
    name: text().notNull(),
    currentAmount: numeric('current_amount', { precision: 12, scale: 2, mode: 'number' })
      .default(0)
      .notNull(),
    targetAmount: numeric('target_amount', { precision: 12, scale: 2, mode: 'number' }).notNull(),
    targetDate: text('target_date').default('').notNull(),
    iconKey: text('icon_key').default('Shield').notNull(),
    color: text().default('#1F5A45').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('goal_user_idx').using('btree', table.userId.asc().nullsLast().op('uuid_ops')),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [userInNeonAuth.id],
      name: 'goal_user_id_fkey',
    }).onDelete('cascade'),
    check(
      'goal_amounts_check',
      sql`(current_amount >= (0)::numeric) AND (target_amount > (0)::numeric)`,
    ),
  ],
);

/** Per-user annual budget by category. Composite PK (user_id, category). */
export const budget = pgTable(
  'budget',
  {
    userId: uuid('user_id').notNull(),
    category: text().notNull(),
    annualAmount: numeric('annual_amount', { precision: 12, scale: 2, mode: 'number' })
      .default(0)
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [userInNeonAuth.id],
      name: 'budget_user_id_fkey',
    }).onDelete('cascade'),
    primaryKey({ columns: [table.userId, table.category], name: 'budget_pkey' }),
    check('budget_amount_check', sql`annual_amount >= (0)::numeric`),
  ],
);

/**
 * OPENING balances - the balance before any recorded transaction.
 * Current balance is DERIVED: opening + SUM(transactions for that payment method).
 * Never store a current balance here.
 */
export const userAccount = pgTable(
  'user_account',
  {
    userId: uuid('user_id').primaryKey().notNull(),
    checkingOpening: numeric('checking_opening', { precision: 12, scale: 2, mode: 'number' })
      .default(0)
      .notNull(),
    cashOpening: numeric('cash_opening', { precision: 12, scale: 2, mode: 'number' })
      .default(0)
      .notNull(),
    timeZone: text('time_zone'),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [userInNeonAuth.id],
      name: 'user_account_user_id_fkey',
    }).onDelete('cascade'),
  ],
);

/**
 * Per-user expense category taxonomy. Replaces the hardcoded
 * initialCategoryMeta map in seed.ts, which gave every user the same fixed 15.
 *
 * `name` is the join key: expense.category and budget.category both store the
 * category NAME as text, not an id. A rename therefore has to cascade an
 * UPDATE across those tables inside the same action. UNIQUE (user_id, name)
 * makes that safe - a rename that would collide errors instead of silently
 * merging two categories together.
 *
 * `isSystem` marks the undeletable fallback category (Miscellaneous). It is
 * enforced in the action layer rather than by a database constraint, so the
 * row stays removable by hand if it ever needs to be.
 */
export const category = pgTable(
  'category',
  {
    id: text().primaryKey().notNull(),
    userId: uuid('user_id').notNull(),
    name: text().notNull(),
    iconKey: text('icon_key').default('Home').notNull(),
    color: text().default('#1F5A45').notNull(),
    isSystem: boolean('is_system').default(false).notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('category_user_idx').using('btree', table.userId.asc().nullsLast().op('uuid_ops')),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [userInNeonAuth.id],
      name: 'category_user_id_fkey',
    }).onDelete('cascade'),
    unique('category_user_name_unique').on(table.userId, table.name),
    check('category_name_not_blank', sql`btrim(name) <> ''::text`),
  ],
);

/**
 * Manual balance corrections - "my bank says 1,240 but Pebble says 1,190".
 *
 * Deliberately a SEPARATE table from expense/income, not a flagged row in
 * them. Adjustments must appear in the statement ledger but never in Reports,
 * and Reports classifies with a catch-all else branch: anything that is not an
 * expense is treated as income. A flag would eventually be forgotten by some
 * filter; a separate table cannot reach Reports at all, because it is never in
 * the array Reports receives.
 *
 * amount is signed and has NO check constraint - corrections go both ways.
 */
export const balanceAdjustment = pgTable(
  'balance_adjustment',
  {
    id: text().primaryKey().notNull(),
    userId: uuid('user_id').notNull(),
    description: text().default('').notNull(),
    transactionDate: date('transaction_date').notNull(),
    paymentMethod: text('payment_method').default('Checking').notNull(),
    amount: numeric({ precision: 12, scale: 2, mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('balance_adjustment_user_date_idx').using(
      'btree',
      table.userId.asc().nullsLast().op('uuid_ops'),
      table.transactionDate.desc().nullsFirst().op('date_ops'),
    ),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [userInNeonAuth.id],
      name: 'balance_adjustment_user_id_fkey',
    }).onDelete('cascade'),
    check(
      'balance_adjustment_payment_method_check',
      sql`payment_method = ANY (ARRAY['Checking'::text, 'Cash'::text])`,
    ),
  ],
);

// Row types for the Phase 2 mapping layer.
export type ExpenseRow = typeof expense.$inferSelect;
export type ExpenseInsert = typeof expense.$inferInsert;
export type IncomeRow = typeof income.$inferSelect;
export type IncomeInsert = typeof income.$inferInsert;
export type GoalRow = typeof goal.$inferSelect;
export type GoalInsert = typeof goal.$inferInsert;
export type BudgetRow = typeof budget.$inferSelect;
export type BudgetInsert = typeof budget.$inferInsert;
export type UserAccountRow = typeof userAccount.$inferSelect;
export type UserAccountInsert = typeof userAccount.$inferInsert;
export type CategoryRow = typeof category.$inferSelect;
export type CategoryInsert = typeof category.$inferInsert;
export type BalanceAdjustmentRow = typeof balanceAdjustment.$inferSelect;
export type BalanceAdjustmentInsert = typeof balanceAdjustment.$inferInsert;
export type RecurringRuleRow = typeof recurringRule.$inferSelect;
export type RecurringRuleInsert = typeof recurringRule.$inferInsert;
