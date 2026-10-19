import { PACE_TOLERANCE } from '@/lib/budgetPace';

/** Where one budget (or all of them) stands against an even pace through the year. */
export type PaceStatus = 'over' | 'overPace' | 'onPace' | 'underPace';

/**
 * The same tests the rows and the plan card always made: over budget first,
 * then spending against the share of the budget an even pace would have used
 * by today, within PACE_TOLERANCE of the budget. Kept in one place so the
 * hero, the section headers and each row can never disagree.
 */
export function paceStatus(spent: number, budget: number, fraction: number): PaceStatus {
  if (spent > budget) return 'over';
  const expected = budget * fraction;
  const tol = budget * PACE_TOLERANCE;
  if (spent < expected - tol) return 'underPace';
  if (spent > expected + tol) return 'overPace';
  return 'onPace';
}
