'use client';

import { useMemo } from 'react';
import type { Transaction } from '@/types';
import { computeCategorySpent } from '@/lib/stats';
import { buildCategoryMeta } from '@/lib/data/categoryMeta';
import { BudgetSummaryCard } from '@/components/budgets/BudgetSummaryCard';
import { BudgetCategoryCard } from '@/components/budgets/BudgetCategoryCard';
import type { BudgetEntry } from '@/components/budgets/types';

interface BudgetsClientProps {
  transactions: Transaction[];
  budgets: Record<string, number>;
}

export function BudgetsClient({ transactions, budgets }: BudgetsClientProps) {
  const categoryMeta = useMemo(() => buildCategoryMeta(budgets), [budgets]);

  // Budgets are annual and reset each year, so this must be the viewer's
  // current year. Evaluated here rather than read from the TODAY constant
  // in seed.ts: TODAY is captured once at module load, which on a warm
  // server would keep returning the year the process started in.
  const entries: BudgetEntry[] = useMemo(() => {
    const categorySpent = computeCategorySpent(transactions, new Date().getFullYear());

    return Object.entries(categoryMeta)
      .map(([name, meta]) => {
        const spent = categorySpent[name] || 0;
        const pct = meta.budget > 0 ? (spent / meta.budget) * 100 : (spent > 0 ? 100 : 0);
        return { name, icon: meta.icon, color: meta.color, budget: meta.budget, spent, pct };
      })
      .filter((e) => e.budget > 0 || e.spent > 0);
  }, [transactions, categoryMeta]);

  const totalBudget = entries.reduce((s, e) => s + e.budget, 0);
  const totalSpent = entries.reduce((s, e) => s + e.spent, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <BudgetSummaryCard totalBudget={totalBudget} totalSpent={totalSpent} />
      <div className="budgets-grid">
        {entries.map((e) => <BudgetCategoryCard key={e.name} entry={e} />)}
      </div>
    </div>
  );
}
