'use client';

import { usePebbleStore, useTransactions } from '@/store/usePebbleStore';
import { computeCategorySpent } from '@/lib/stats';
import { TODAY } from '@/data/seed';
import { BudgetSummaryCard } from '@/components/budgets/BudgetSummaryCard';
import { BudgetCategoryCard } from '@/components/budgets/BudgetCategoryCard';
import type { BudgetEntry } from '@/components/budgets/types';

export default function BudgetsPage() {
  const categoryMeta = usePebbleStore((s) => s.categoryMeta);
  const transactions = useTransactions();
  const categorySpent = computeCategorySpent(transactions, TODAY.getFullYear());

  const entries: BudgetEntry[] = Object.entries(categoryMeta)
    .map(([name, meta]) => {
      const spent = categorySpent[name] || 0;
      const pct = meta.budget > 0 ? (spent / meta.budget) * 100 : (spent > 0 ? 100 : 0);
      return { name, icon: meta.icon, color: meta.color, budget: meta.budget, spent, pct };
    })
    .filter((e) => e.budget > 0 || e.spent > 0);

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
