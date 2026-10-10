'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Transaction } from '@/types';
import type { CategoryItem } from '@/lib/data/mappers';
import { computeCategorySpent } from '@/lib/stats';
import { buildCategoryMeta } from '@/lib/data/categoryMeta';
import { estimateAnnualIncomeTrailing12 } from '@/lib/analysis/annualIncome';
import { useTimeZoneOverride } from '@/lib/time/TimeZoneOverrideContext';
import { resolveBrowserTimeZone } from '@/lib/time/timeZone';
import { todayInZone } from '@/lib/recurring/occurrences';
import { usePebbleStore } from '@/store/usePebbleStore';
import { BudgetPlanCard } from '@/components/budgets/BudgetPlanCard';
import { BudgetRows } from '@/components/budgets/BudgetRows';
import { UnbudgetedList } from '@/components/budgets/UnbudgetedList';
import { IncomeControl, MANUAL_FREQUENCY_MULTIPLIER } from '@/components/budgets/IncomeControl';
import type { BudgetEntry } from '@/components/budgets/types';
import type { BudgetHistory } from '@/components/budgets/BudgetDetails';

interface BudgetsClientProps {
  transactions: Transaction[];
  categories: CategoryItem[];
  budgets: Record<string, number>;
}

export function BudgetsClient({ transactions, categories, budgets }: BudgetsClientProps) {
  const categoryMeta = useMemo(() => buildCategoryMeta(categories, budgets), [categories, budgets]);

  // Zone-aware 'YYYY-MM-DD', resolved in the browser as on the Dashboard, so a
  // Settings > Time Zone override is honoured. Null for the first frame keeps
  // the server render and the first client render equal.
  const timeZoneOverride = useTimeZoneOverride();
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => {
    setToday(todayInZone(timeZoneOverride ?? resolveBrowserTimeZone()));
  }, [timeZoneOverride]);

  // Budgets are annual and reset each year, so this uses the viewer's current
  // year (zone-aware once known; the browser's clock for the first frame).
  const year = today ? Number(today.slice(0, 4)) : new Date().getFullYear();
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
    const y = Number(today.slice(0, 4));
    const m = Number(today.slice(5, 7)) - 1;
    const months: string[] = [];
    for (let dt = new Date(y - 3, 0, 1); dt.getFullYear() < y || dt.getMonth() <= m; dt = new Date(dt.getFullYear(), dt.getMonth() + 1, 1)) {
      months.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`);
    }
    const index = new Map(months.map((k, i) => [k, i]));
    const byCat: Record<string, number[]> = {};
    for (const x of transactions) {
      if (x.amount >= 0) continue;
      const i = index.get(x.date.slice(0, 7));
      if (i === undefined) continue;
      (byCat[x.category] ??= Array(months.length).fill(0))[i] += Math.abs(x.amount);
    }
    return { months, byCat, current: months[months.length - 1] };
  }, [transactions, today]);

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
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
      <UnbudgetedList entries={entries} others={others} history={history} />
    </div>
  );
}
