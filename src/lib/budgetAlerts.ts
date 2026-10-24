/**
 * Annual-budget alerts for the Dashboard: a category that has used 80% of its
 * yearly budget, and the stronger one at 100%.
 *
 * "Spent" is exactly the figure the Needs attention card shows -
 * computeCategorySpent for the current calendar year - so the two never
 * disagree. Pure: the caller passes the zone-aware year.
 */
import type { CategoryMeta, Transaction } from '@/types';
import { computeCategorySpent } from '@/lib/stats';

export type BudgetAlertLevel = 80 | 100;

/** Most alerts shown at once. */
export const MAX_BUDGET_ALERTS = 3;

export interface BudgetAlert {
  /** `budget:${category}:${year}:${level}` - the persisted dismissal id. A new level is a new id, so crossing 100 after dismissing 80 alerts again. */
  id: string;
  category: string;
  year: number;
  level: BudgetAlertLevel;
  spent: number;
  budget: number;
  /** Whole percent used, rounded DOWN so "99%" never reads as "100%" while money is still left. */
  pct: number;
  /** budget - spent: positive left, negative over. */
  left: number;
}

export function budgetAlerts(
  transactions: Transaction[],
  categoryMeta: CategoryMeta,
  year: number,
  dismissed: readonly string[],
): BudgetAlert[] {
  const spentBy = computeCategorySpent(transactions, year);
  const out: BudgetAlert[] = [];
  for (const [category, meta] of Object.entries(categoryMeta)) {
    if (!(meta.budget > 0)) continue;
    const spent = spentBy[category] || 0;
    // In cents, so a budget spent to the cent counts as reached.
    const ratio = Math.round(spent * 100) / Math.round(meta.budget * 100);
    const level: BudgetAlertLevel | null = ratio >= 1 ? 100 : ratio >= 0.8 ? 80 : null;
    if (level === null) continue;
    const id = `budget:${category}:${year}:${level}`;
    if (dismissed.includes(id)) continue;
    out.push({
      id, category, year, level, spent, budget: meta.budget,
      pct: Math.floor(ratio * 100 + 1e-9), left: Math.round((meta.budget - spent) * 100) / 100,
    });
  }
  // Over budget first, then the fullest; the name keeps ties in a fixed order.
  return out
    .sort((a, b) => b.level - a.level || b.pct - a.pct || (a.category < b.category ? -1 : 1))
    .slice(0, MAX_BUDGET_ALERTS);
}
