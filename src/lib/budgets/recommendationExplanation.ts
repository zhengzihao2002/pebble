import type { BudgetRecommendation } from './recommendations';

export type RecommendationAdjustment = {
  kind: 'keep' | 'limitCut' | 'seasonal' | 'spike' | 'round' | 'cap';
  from: number;
  delta: number;
  to: number;
};

/** Trace the existing decision rules; never replace them with a cosmetic formula. */
export function recommendationAdjustments(r: BudgetRecommendation, current: number): RecommendationAdjustment[] {
  const c = r.calculation;
  if (!c) return [];
  const steps: RecommendationAdjustment[] = [];
  let amount = c.withBuffer;
  const step = (kind: RecommendationAdjustment['kind'], next: number) => {
    if (Math.round(next * 100) === Math.round(amount * 100)) return;
    steps.push({ kind, from: amount, delta: (Math.round(next * 100) - Math.round(amount * 100)) / 100, to: next });
    amount = next;
  };
  if (c.keepCurrent) step('keep', current);
  else {
    if (c.minimumAnnual !== null && amount < c.minimumAnnual) {
      step(r.reason === 'seasonalSpending' ? 'seasonal' : r.reason === 'unusualSpike' ? 'spike' : 'limitCut', c.minimumAnnual);
    }
    // An unchanged current budget preserves cents, exactly as the recommender does.
    if (amount !== current) step('round', Math.ceil(amount - 1e-7));
    step('cap', Math.min(9_999_999_999, amount));
  }
  return steps;
}
