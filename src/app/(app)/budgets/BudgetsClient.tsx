'use client';

import { useMemo, useState } from 'react';
import type { Transaction } from '@/types';
import type { CategoryItem } from '@/lib/data/mappers';
import { computeCategorySpent } from '@/lib/stats';
import { buildCategoryMeta } from '@/lib/data/categoryMeta';
import { estimateAnnualIncomeTrailing12 } from '@/lib/analysis/annualIncome';
import { usePebbleStore } from '@/store/usePebbleStore';
import { BudgetPlanCard } from '@/components/budgets/BudgetPlanCard';
import { BudgetRows } from '@/components/budgets/BudgetRows';
import { UnbudgetedList } from '@/components/budgets/UnbudgetedList';
import { IncomeControl, MANUAL_FREQUENCY_MULTIPLIER } from '@/components/budgets/IncomeControl';
import type { BudgetEntry } from '@/components/budgets/types';
import { budgetHistoryThroughToday } from '@/lib/budgets/spendingProjection';
import type { BudgetHistory } from '@/components/budgets/BudgetDetails';
import type { AnnualBudgetContext } from '@/lib/budgets/annualTypes';
import { AnnualPlanEntry } from '@/components/budgets/AnnualPlanEntry';

interface BudgetsClientProps {
  transactions: Transaction[];
  categories: CategoryItem[];
  budgets: Record<string, number>;
  annualContext: AnnualBudgetContext;
  budgetsByYear: Record<string, Record<string, number> | null>;
  today: string;
}

export function BudgetsClient({ transactions, categories, budgets, annualContext, budgetsByYear, today }: BudgetsClientProps) {
  const categoryMeta = useMemo(() => buildCategoryMeta(categories, budgets), [categories, budgets]);

  // Server-resolved in the saved planning timezone; the year boundary refresh
  // remounts this screen so it cannot retain last year's totals or editors.
  const year = Number(today.slice(0, 4));
  const entries: BudgetEntry[] = useMemo(() => {
    const categorySpent = computeCategorySpent(transactions, year);

    return Object.entries(categoryMeta)
      .map(([name, meta]) => {
        const spent = categorySpent[name] || 0;
        const pct = meta.budget > 0 ? (spent / meta.budget) * 100 : (spent > 0 ? 100 : 0);
        return { name, icon: meta.icon, color: meta.color, budget: meta.budget, spent, pct };
      })
      .filter((e) => e.budget > 0 || e.spent > 0);
  }, [transactions, categoryMeta, year]);

  // Categories with no budget and no spending this year, for Other categories.
  const others: BudgetEntry[] = useMemo(() => {
    const shown = new Set(entries.map((e) => e.name));
    return Object.entries(categoryMeta)
      .filter(([name]) => !shown.has(name))
      .map(([name, meta]) => ({ name, icon: meta.icon, color: meta.color, budget: 0, spent: 0, pct: 0 }));
  }, [categoryMeta, entries]);

  // Every month from January three years ago through the current month, per
  // category, oldest first, from the transactions already on the page. The
  // details chart picks a year from it; Quick set uses its last 12 complete
  // months. Null until today is known.
  const history: BudgetHistory | null = useMemo(() => {
    if (!today) return null;
    return { ...budgetHistoryThroughToday(transactions, today), budgetsByYear };
  }, [transactions, today, budgetsByYear]);

  const totalBudget = entries.reduce((s, e) => s + e.budget, 0);
  const totalSpent = entries.reduce((s, e) => s + e.spent, 0);

  // Expected income: the system estimate (trailing 12 months, from the
  // transactions already loaded) or one manual paycheck annualized. Mode and
  // frequency are saved preferences; the typed amount is on-page only.
  const incomeEstimate = useMemo(
    () => (today ? estimateAnnualIncomeTrailing12(transactions, today) : null),
    [transactions, today],
  );
  const incomeMode = usePebbleStore((s) => s.incomeEstimateMode) === 'manual' ? 'manual' : 'system';
  const setIncomeMode = usePebbleStore((s) => s.setIncomeEstimateMode);
  const frequency = usePebbleStore((s) => s.manualIncomeFrequency);
  const setFrequency = usePebbleStore((s) => s.setManualIncomeFrequency);
  const [manualAmount, setManualAmount] = useState('');

  const manualAnnual = (Number(manualAmount) || 0) * (MANUAL_FREQUENCY_MULTIPLIER[frequency] ?? 12);
  const effectiveIncome = incomeMode === 'manual'
    ? (manualAnnual > 0 ? manualAnnual : null)
    : (incomeEstimate?.annual ?? null);

  // The latest Standard Income paycheck, for Import latest.
  const latestStandardIncomeNet = useMemo(() => {
    let best: Transaction | null = null;
    for (const x of transactions) {
      if (x.type !== 'income' || x.category !== 'Standard Income') continue;
      if (!best || x.date > best.date) best = x;
    }
    return best && best.type === 'income' ? best.netAmount : null;
  }, [transactions]);

  // One column on every width, as on a phone: the plan, the budget list, then
  // spending without a budget. It used to become a side column on a wide
  // screen, but that card is far shorter than the list, so the right half
  // stayed blank for most of the scroll (owner report). Wide screens use their
  // width inside the cards instead (see budgets.css). All three cards always
  // render; a card with nothing to show says what it needs.
  return (
    <div className="pb-bud">
      <AnnualPlanEntry context={annualContext} today={today} hasBudgets={Object.values(budgets).some(amount => amount > 0)} />
      <BudgetPlanCard
        entries={entries}
        totalBudget={totalBudget}
        totalSpent={totalSpent}
        annualIncome={effectiveIncome}
        today={today}
        incomeControl={(
          <IncomeControl
            mode={incomeMode}
            onModeChange={setIncomeMode}
            frequency={frequency}
            onFrequencyChange={setFrequency}
            manualAmount={manualAmount}
            onManualAmountChange={setManualAmount}
            effectiveAnnual={effectiveIncome}
            latestStandardIncomeNet={latestStandardIncomeNet}
          />
        )}
      />
      <BudgetRows entries={entries} today={today} history={history} />
      <UnbudgetedList entries={entries} others={others} history={history} today={today} />
    </div>
  );
}
