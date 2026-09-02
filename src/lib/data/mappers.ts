import type {
  ExpenseRow,
  IncomeRow,
  BudgetRow,
  UserAccountRow,
  GoalRow,
  CategoryRow,
  BalanceAdjustmentRow,
  RecurringRuleRow,
  AccountRow,
} from '@/db/schema';
import type {
  BalanceAdjustment,
  ExpenseTransaction,
  IncomeTransaction,
  PaymentMethod,
  Goal,
  RecurringRule,
  RecurringKind,
  RecurringFrequency,
  RecurringEndMode,
  RecurringStatus,
} from '@/types';

/**
 * DB row -> app type conversion.
 *
 * Pure functions, no database access, deliberately NOT marked server-only so
 * they stay unit-testable. The query layer that calls them is server-only.
 *
 * numeric(12,2) columns already arrive as JS numbers because src/db/schema.ts
 * declares them with mode: 'number'. Do NOT add Number() calls here - if a
 * value ever arrives as a string, that means a schema declaration lost its
 * mode and should be fixed there, not patched over here.
 *
 * Aggregates are the exception: sum(), avg() and similar SQL expressions
 * return STRINGS regardless of column mode. Convert those at the call site.
 */

const PAYMENT_METHODS: readonly PaymentMethod[] = ['Cash', 'Checking'];

/**
 * The payment_method column carries a CHECK constraint restricting it to
 * exactly these two values, so this narrowing is backed by a real database
 * guarantee rather than a hopeful cast. Still validated, because a future
 * migration could drop the constraint without anyone updating this file.
 */
function toPaymentMethod(value: string, _rowId: string): PaymentMethod {
  // Pass-through. This column holds an ACCOUNT NAME now, not one of two
  // constrained literals - the CHECK that justified throwing here was dropped
  // when accounts became user-defined. Ownership and validity are enforced on
  // accountId, which is a real foreign key.
  return value;
}

const INCOME_CATEGORIES = ['Standard Income', 'Side Cash'] as const;
type IncomeCategory = (typeof INCOME_CATEGORIES)[number];

/**
 * income.category has NO database CHECK constraint but IS a two-member union
 * in TypeScript. Throwing rather than defaulting is deliberate: silently
 * coercing an unrecognised value to 'Standard Income' would corrupt
 * estimateAnnualIncome(), which filters on exactly that string.
 */
function toIncomeCategory(value: string, rowId: string): IncomeCategory {
  if ((INCOME_CATEGORIES as readonly string[]).includes(value)) {
    return value as IncomeCategory;
  }
  throw new Error(
    `Invalid income category "${value}" on row ${rowId}. Expected one of: ${INCOME_CATEGORIES.join(', ')}.`,
  );
}

export function mapExpenseRow(row: ExpenseRow): ExpenseTransaction {
  return {
    id: row.id,
    type: 'expense',
    description: row.description,
    category: row.category,
    tag: row.tag,
    date: row.transactionDate,
    paymentMethod: toPaymentMethod(row.paymentMethod, row.id),
    accountId: row.accountId,
    amount: row.amount,
    recurringRuleId: row.recurringRuleId ?? undefined,
  };
}

/**
 * `amount` is not a column. It is derived as netAmount so that the Transaction
 * union has a single field every consumer can sum, sign-correct: expenses
 * negative, income positive.
 */
export function mapIncomeRow(row: IncomeRow): IncomeTransaction {
  return {
    id: row.id,
    type: 'income',
    description: row.description,
    category: toIncomeCategory(row.category, row.id),
    date: row.transactionDate,
    paymentMethod: toPaymentMethod(row.paymentMethod, row.id),
    accountId: row.accountId,
    grossAmount: row.grossAmount,
    netAmount: row.netAmount,
    amount: row.netAmount,
    recurringRuleId: row.recurringRuleId ?? undefined,
  };
}

/**
 * Budgets cross the server/client boundary as a plain serializable map.
 * Merging with icons and colors from seed.ts happens client-side.
 */
export function mapBudgetRows(rows: BudgetRow[]): Record<string, number> {
  const budgets: Record<string, number> = {};
  for (const row of rows) {
    budgets[row.category] = row.annualAmount;
  }
  return budgets;
}


export interface Account {
  id: string;
  name: string;
  kind: 'bank' | 'cash';
  last4: string | null;
  status: 'active' | 'hibernated';
  isDefault: boolean;
  /** Preselected in transaction forms. At most one per user. */
  isPreferred: boolean;
  sortOrder: number;
}

/**
 * kind and status are CHECK-constrained in Postgres, so the cast is safe -
 * the database cannot hold a value outside those unions. Cast rather than
 * validate: a runtime check here would be dead code that never fires.
 */
export function mapAccountRow(row: AccountRow): Account {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as 'bank' | 'cash',
    last4: row.last4,
    status: row.status as 'active' | 'hibernated',
    isDefault: row.isDefault,
    isPreferred: row.isPreferred,
    sortOrder: row.sortOrder,
  };
}


/**
 * iconKey stays a string. Resolving it to a LucideIcon here would produce a
 * function, which cannot be passed from a Server Component to a Client
 * Component. Resolution happens at render time via resolveGoalIcon().
 */
export function mapGoalRow(row: GoalRow): Goal {
  return {
    id: row.id,
    name: row.name,
    current: row.currentAmount,
    target: row.targetAmount,
    date: row.targetDate,
    iconKey: row.iconKey,
    color: row.color,
  };
}

/**
 * Serializable category shape crossing the server/client boundary.
 * iconKey stays a string; resolveCategoryIcon() turns it into a component
 * inside the client component that renders it.
 */
export interface CategoryItem {
  id: string;
  name: string;
  iconKey: string;
  color: string;
  isSystem: boolean;
  sortOrder: number;
}

export function mapCategoryRow(row: CategoryRow): CategoryItem {
  return {
    id: row.id,
    name: row.name,
    iconKey: row.iconKey,
    color: row.color,
    isSystem: row.isSystem,
    sortOrder: row.sortOrder,
  };
}

export function mapBalanceAdjustmentRow(row: BalanceAdjustmentRow): BalanceAdjustment {
  return {
    id: row.id,
    type: 'adjustment',
    description: row.description,
    date: row.transactionDate,
    paymentMethod: toPaymentMethod(row.paymentMethod, row.id),
    accountId: row.accountId,
    transferGroupId: row.transferGroupId,
    amount: row.amount,
  };
}

/**
 * Generic narrowing for the recurring_rule text unions.
 *
 * Throws rather than defaulting, following toIncomeCategory: every one of these
 * columns has a database CHECK behind it, so an unexpected value means the
 * constraint was dropped or a migration diverged. Coercing it to a plausible
 * default would let a rule silently fire on the wrong schedule - the failure
 * mode is money moving, so it must be loud.
 */
function toUnion<T extends string>(
  allowed: readonly T[],
  value: string,
  rowId: string,
  column: string,
): T {
  if ((allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  throw new Error(
    `Invalid ${column} "${value}" on recurring_rule ${rowId}. Expected one of: ${allowed.join(', ')}.`,
  );
}

const RECURRING_KINDS: readonly RecurringKind[] = ['expense', 'income'];
const RECURRING_FREQUENCIES: readonly RecurringFrequency[] = [
  'once',
  'weekly',
  'biweekly',
  'monthly',
  'yearly',
];
const RECURRING_END_MODES: readonly RecurringEndMode[] = ['never', 'after', 'on'];
const RECURRING_STATUSES: readonly RecurringStatus[] = ['active', 'paused', 'deleted'];

export function mapRecurringRuleRow(row: RecurringRuleRow): RecurringRule {
  return {
    id: row.id,
    kind: toUnion(RECURRING_KINDS, row.kind, row.id, 'kind'),
    description: row.description,
    category: row.category,
    tag: row.tag,
    paymentMethod: toPaymentMethod(row.paymentMethod, row.id),
    accountId: row.accountId,
    amount: row.amount,
    grossAmount: row.grossAmount,
    frequency: toUnion(RECURRING_FREQUENCIES, row.frequency, row.id, 'frequency'),
    startDate: row.startDate,
    endMode: toUnion(RECURRING_END_MODES, row.endMode, row.id, 'end_mode'),
    endCount: row.endCount,
    endDate: row.endDate,
    status: toUnion(RECURRING_STATUSES, row.status, row.id, 'status'),
    materializedThrough: row.materializedThrough,
  };
}
