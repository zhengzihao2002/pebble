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
import { BudgetPlanCard } from '@/components/budgets/BudgetPlanCard';
import { BudgetRows } from '@/components/budgets/BudgetRows';
import type { BudgetEntry } from '@/components/budgets/types';

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

  const totalBudget = entries.reduce((s, e) => s + e.budget, 0);
  const totalSpent = entries.reduce((s, e) => s + e.spent, 0);

  // The Modify Budget dialog's own figure, from transactions already loaded.
  const incomeEstimate = useMemo(
    () => (today ? estimateAnnualIncomeTrailing12(transactions, today) : null),
    [transactions, today],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <BudgetPlanCard
        entries={entries}
        totalBudget={totalBudget}
        totalSpent={totalSpent}
        annualIncome={incomeEstimate?.annual ?? null}
        today={today}
      />
      <BudgetRows entries={entries} today={today} />
    </div>
  );
}
