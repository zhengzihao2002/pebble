import type { CategoryMeta } from '@/types';
import { initialCategoryMeta } from '@/data/seed';

/**
 * Rebuilds the CategoryMeta map from static app metadata plus DB budgets.
 *
 * CLIENT-SIDE ONLY. initialCategoryMeta holds LucideIcon values, which are
 * functions and cannot cross the Server -> Client Component boundary. Server
 * Components pass the plain Record<string, number> of budgets; the client
 * shell calls this to reassemble the icon-bearing map.
 *
 * Icons and colors are fixed app metadata and never come from the database.
 * Categories absent from `budgets` keep their seed default of 0.
 */
export function buildCategoryMeta(budgets: Record<string, number>): CategoryMeta {
  const merged: CategoryMeta = {};

  for (const [name, meta] of Object.entries(initialCategoryMeta)) {
    merged[name] = { ...meta, budget: budgets[name] ?? 0 };
  }

  return merged;
}
