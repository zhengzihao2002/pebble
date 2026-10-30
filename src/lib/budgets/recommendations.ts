import type { Transaction } from '@/types';
import type { CategoryItem } from '@/lib/data/mappers';

/** Reasons are dictionary keys, never user-facing English. */
export type BudgetRecommendationReason =
  | 'noHistory' | 'limitedHistory' | 'newBudget' | 'steadySpending'
  | 'risingSpending' | 'fallingSpending' | 'unusedRoom'
  | 'seasonalSpending' | 'unusualSpike';

export interface BudgetRecommendation {
  categoryId: string;
  /** Proposed annual amount, rounded UP to whole dollars like the budget editor. */
  amount: number;
  /** Relative to the current budget, not relative to actual spending. Null means a new budget. */
  changePercent: number | null;
  reason: BudgetRecommendationReason;
  confidence: 'low' | 'medium' | 'high';
  sampleMonths: number;
  /** Annualized spending before the 10% allowance. Null without observations. */
  baselineAnnual: number | null;
  recentAnnual: number | null;
  bufferPercent: number;
  /** A non-recurring outlier omitted from the recurring run-rate, explicitly disclosed. */
  excludedSpikeAmount: number;
  trendPercent: number | null;
  windowStart: string;
  windowEnd: string;
}

export interface AnnualRecommendationInput {
  transactions: readonly Transaction[];
  categories: readonly CategoryItem[];
  currentAmounts: Readonly<Record<string, number>>;
  today: string;
}

const BUFFER = 10;
const MAX_ANNUAL = 9_999_999_999;
const monthIndex = (date: string) => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;
const monthLabel = (index: number) => `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`;
const mean = (values: readonly number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
const median = (values: readonly number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length ? (sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2) : 0;
};
const annualAmount = (amount: number) => Math.min(MAX_ANNUAL, Math.max(0, Math.ceil(amount - 1e-7)));
const validDate = (date: string) => /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(date);

/**
 * Clock-free, explainable planning suggestions. These are optional starting
 * points, not forecasts or promises. Only COMPLETE months are used. A partial
 * first recording month, the current month, dormant stretches and unobserved
 * trailing months cannot masquerade as zero spending.
 *
 * Twelve fully observed months and a full category history are required for
 * decreases. Concentrated/seasonal categories never get a suggested decrease;
 * a large purchase is not assumed to recur twelve times next year. Even with
 * strong evidence, a decrease is limited to 20% for the user to review.
 */
export function recommendAnnualBudgets({ transactions, categories, currentAmounts, today }: AnnualRecommendationInput): BudgetRecommendation[] {
  if (!validDate(today)) throw new Error('A calendar date is required for budget recommendations.');
  const currentMonth = monthIndex(today);
  const lastComplete = currentMonth - 1;
  const recorded = transactions.filter((t) => validDate(t.date) && t.date < `${today.slice(0, 7)}-01` && Number.isFinite(t.amount) && Math.abs(t.amount) <= MAX_ANNUAL + 0.99);
  const earliest = recorded.reduce<string | null>((first, t) => first === null || t.date < first ? t.date : first, null);
  const firstComplete = earliest ? monthIndex(earliest) + (earliest.slice(8, 10) === '01' ? 0 : 1) : currentMonth;
  const windowStart = Math.max(lastComplete - 11, firstComplete);
  const activity = new Set(recorded.map((t) => monthIndex(t.date)));
  const active = [...activity].filter((m) => m >= windowStart && m <= lastComplete).sort((a, b) => a - b);
  const observed = new Set(active);
  // A quiet month between recorded months counts; a dormant quarter does not.
  for (let i = 1; i < active.length; i++) {
    if (active[i] - active[i - 1] <= 3) for (let m = active[i - 1] + 1; m < active[i]; m++) observed.add(m);
  }
  const observedMonths = [...observed].sort((a, b) => a - b);
  const fullYear = observedMonths.length === 12 && windowStart === lastComplete - 11;
  const fresh = activity.has(lastComplete);

  return categories.map((category) => {
    const current = Number.isFinite(currentAmounts[category.id]) ? Math.min(MAX_ANNUAL, Math.max(0, currentAmounts[category.id])) : 0;
    const expenses = recorded.filter((t) => t.type === 'expense' && t.amount < 0 && t.category === category.name);
    const firstCategoryMonth = expenses.reduce((first, t) => Math.min(first, monthIndex(t.date)), Infinity);
    const months = observedMonths.filter((m) => m >= firstCategoryMonth);
    const totals = new Map(months.map((m) => [m, 0]));
    for (const t of expenses) {
      const m = monthIndex(t.date);
      if (totals.has(m)) totals.set(m, totals.get(m)! + Math.round(-t.amount * 100));
    }
    const values = months.map((m) => totals.get(m)! / 100);
    const total = values.reduce((a, b) => a + b, 0);
    const baseline = values.length ? total / values.length * 12 : null;
    const result = (reason: BudgetRecommendationReason, amount = current, details: Partial<BudgetRecommendation> = {}): BudgetRecommendation => {
      const rounded = amount === current ? current : annualAmount(amount);
      return {
        categoryId: category.id, amount: rounded,
        changePercent: current > 0 ? Math.round((rounded - current) / current * 1000) / 10 : null,
        reason, confidence: 'low', sampleMonths: months.length,
        baselineAnnual: baseline === null ? null : Math.round(baseline * 100) / 100,
        recentAnnual: null, bufferPercent: BUFFER, excludedSpikeAmount: 0,
        trendPercent: null,
        windowStart: monthLabel(months[0] ?? Math.min(windowStart, lastComplete)),
        windowEnd: monthLabel(months[months.length - 1] ?? lastComplete),
        ...details,
      };
    };
    if (total === 0) return result('noHistory');
    // Do not annualize a new category's first bill or stale recording history.
    if (months.length < 3 || !fresh) return result('limitedHistory');

    const positives = values.filter((v) => v > 0);
    const typical = median(positives);
    const max = Math.max(...values);
    const peakMonth = months[values.indexOf(max)];
    const peakTransactions = expenses.filter((t) => monthIndex(t.date) === peakMonth);
    const biggest = peakTransactions.reduce<Transaction | null>((found, t) => !found || t.amount < found.amount ? t : found, null);
    const oneOff = biggest && !biggest.recurringRuleId ? -biggest.amount : 0;
    // The same large bill in the same month of another year is seasonal,
    // rather than an outlier to discard. Keep it in the annual allowance.
    const repeatingAnnualPeak = oneOff > 0 && expenses.some((t) => {
      const distance = peakMonth - monthIndex(t.date);
      return distance >= 12 && distance % 12 === 0 && -t.amount >= oneOff * 0.75 && -t.amount <= oneOff * 1.25;
    });
    const unusualSpike = !repeatingAnnualPeak && positives.length >= 6 && typical > 0
      && max > typical * 3 && oneOff >= max * 0.7 && oneOff > typical * 3;
    if (unusualSpike) {
      const recurringAnnual = Math.max(0, total - oneOff) / months.length * 12;
      // A one-off cannot justify cutting a planned budget. Show the excluded
      // amount so the user can put it back if it WILL recur next year.
      return result('unusualSpike', Math.max(current, recurringAnnual * (1 + BUFFER / 100)), {
        confidence: 'medium', excludedSpikeAmount: Math.round(oneOff * 100) / 100,
        baselineAnnual: Math.round(recurringAnnual * 100) / 100,
      });
    }

    const average = mean(values);
    const variation = average > 0 ? Math.sqrt(mean(values.map((v) => (v - average) ** 2))) / average : 0;
    const seasonal = repeatingAnnualPeak || positives.length < 3 || (months.length >= 6 && (positives.length <= 3 || (variation > 0.8 && max / total > 0.35)));
    if (seasonal) {
      // A complete annual cycle can fund the observed annual expense plus
      // room; a partial cycle cannot predict what remains of the year.
      const proposed = fullYear ? Math.max(current, total * (1 + BUFFER / 100)) : current;
      return result('seasonalSpending', proposed, { confidence: fullYear ? 'medium' : 'low' });
    }

    const canDecrease = fullYear && months.length === 12;
    const lastSix = Array.from({ length: 6 }, (_, i) => lastComplete - 5 + i);
    const contiguousSix = lastSix.every((m) => observed.has(m) && totals.has(m));
    let trend: number | null = null;
    let recentAnnual: number | null = null;
    let direction: 'up' | 'down' | null = null;
    if (contiguousSix) {
      const previous = lastSix.slice(0, 3).map((m) => totals.get(m)! / 100);
      const recent = lastSix.slice(3).map((m) => totals.get(m)! / 100);
      const before = mean(previous);
      const now = mean(recent);
      if (before > 0) {
        trend = Math.round((now - before) / before * 1000) / 10;
        recentAnnual = now * 12;
        if (trend >= 15 && recent.every((v) => v > median(previous) * 1.1)) direction = 'up';
        if (trend <= -15 && recent.every((v) => v < median(previous) * 0.9) && recent.every((v) => v > 0)) direction = 'down';
      }
    }
    const confidence = canDecrease ? 'high' : 'medium';
    const details = { confidence, trendPercent: trend, recentAnnual: recentAnnual === null ? null : Math.round(recentAnnual * 100) / 100 } as const;
    const runRate = direction && recentAnnual !== null ? recentAnnual * 0.7 + baseline! * 0.3 : baseline!;
    const target = runRate * (1 + BUFFER / 100);
    if (current === 0) return result('newBudget', target, details);
    if (target > current * 1.05) return result(direction === 'up' ? 'risingSpending' : 'steadySpending', target, details);
    if (target < current * 0.95) {
      if (!canDecrease) return result('limitedHistory', current, { ...details, confidence: 'low' });
      return result(direction === 'down' ? 'fallingSpending' : 'unusedRoom', Math.max(current * 0.8, target), details);
    }
    return result('steadySpending', current, details);
  });
}
