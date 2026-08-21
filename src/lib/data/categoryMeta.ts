import type { CategoryMeta } from '@/types';
import type { CategoryItem } from './mappers';
import { resolveCategoryIcon } from './icons';

/**
 * Builds the CategoryMeta map from the user's own categories plus their
 * budgets.
 *
 * CLIENT-SIDE ONLY. Category icons are LucideIcon values - functions, which
 * cannot cross the Server -> Client Component boundary. Server Components
 * pass the serializable CategoryItem[] (carrying iconKey as a string) and the
 * plain budgets map; this reassembles the icon-bearing structure here.
 *
 * Ordering follows sortOrder from the query, so Object.keys() preserves the
 * order the user sees in settings.
 */
export function buildCategoryMeta(
  categories: CategoryItem[],
  budgets: Record<string, number>,
): CategoryMeta {
  const merged: CategoryMeta = {};

  for (const item of categories) {
    merged[item.name] = {
      icon: resolveCategoryIcon(item.iconKey),
      color: item.color,
      budget: budgets[item.name] ?? 0,
    };
  }

  return merged;
}
