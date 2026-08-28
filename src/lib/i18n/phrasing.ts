import type { Dictionary } from './index';
import { t } from './index';
import { formatCurrency } from '@/lib/format';

/**
 * "X over budget" / "Y left", or "X over target" / "Y to go" - the same
 * over/under phrasing that was independently concatenated in three places
 * (BudgetSummaryCard, BudgetCategoryCard, GoalCard). One function so the
 * three cannot drift, and so a fourth call site does not reinvent it again.
 *
 * `kind` picks the vocabulary: budgets are "over/left", goals are "past
 * target/to go" - different words in English, and no guarantee they'd split
 * the same way in Chinese, which is why this takes a kind rather than trying
 * to share one template between two different meanings.
 */
export function overUnderLabel(
  d: Dictionary,
  kind: 'budget' | 'goal',
  actual: number,
  limit: number,
): string {
  const over = actual > limit;
  const diff = formatCurrency(Math.abs(actual - limit));
  if (kind === 'budget') {
    return over
      ? t(d.phrasing.overBudget, { amount: diff })
      : t(d.phrasing.leftBudget, { amount: diff });
  }
  return over
    ? t(d.phrasing.pastTarget, { amount: diff })
    : t(d.phrasing.toGo, { amount: diff });
}
