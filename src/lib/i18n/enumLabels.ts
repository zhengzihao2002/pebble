import type { Dictionary } from './index';

/**
 * Display labels for values stored in Postgres.
 *
 * ⚠️ ONE-WAY ONLY. These map a stored value to something readable. There is
 * deliberately no inverse function, and there must never be one: the moment a
 * translated label can be turned back into a value, a Chinese string is one
 * refactor away from reaching a CHECK constraint.
 *
 * Takes and returns plain `string` rather than a union type. The stored value
 * arrives from a database row, which can hold anything a past or future
 * schema allowed, so an unknown value falls through to itself and renders
 * as-is. A missing translation shows the English value; it never blanks the
 * row or throws.
 */
export function paymentMethodLabel(d: Dictionary, value: string): string {
  const labels: Record<string, string> = d.enums.paymentMethod;
  return labels[value] ?? value;
}

/**
 * A category name for DISPLAY.
 *
 * Expense category names are user data and pass through untouched. The two
 * income categories are string literals matched by isSideCash() and the income
 * filters in stats.ts, so those get a label while the value stays English.
 *
 * One-way, like paymentMethodLabel: there is no inverse and there must not be.
 */
export function categoryLabel(d: Dictionary, name: string): string {
  const labels: Record<string, string> = d.enums.incomeCategory;
  return labels[name] ?? name;
}

/** A MONTH_NAMES or QUARTER_NAMES value for display. Unknown input (a year
 *  number, say) falls through unchanged. */
export function periodValueLabel(d: Dictionary, value: string): string {
  const months: Record<string, string> = d.months;
  const quarters: Record<string, string> = d.quarters;
  return months[value] ?? quarters[value] ?? value;
}
