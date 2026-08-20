'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { usePebbleStore, useTransactions } from '@/store/usePebbleStore';
import { computeCategorySpent } from '@/lib/stats';
import { BudgetRow } from '@/components/shared/BudgetRow';
import { TODAY } from '@/data/seed';

export function NeedsAttentionCard() {
  const categoryMeta = usePebbleStore((s) => s.categoryMeta);
  const transactions = useTransactions();
  const categorySpent = computeCategorySpent(transactions, TODAY.getFullYear());

  const topBudgets = Object.entries(categoryMeta)
    .map(([name, meta]) => {
      const spent = categorySpent[name] || 0;
      const pct = meta.budget > 0 ? (spent / meta.budget) * 100 : (spent > 0 ? 100 : 0);
      return { name, ...meta, spent, pct };
    })
    .filter((e) => e.budget > 0 || e.spent > 0)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 4);

  return (
    <div className="card" style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.1rem' }}>
        <h3 style={{ fontWeight: 600, fontSize: '0.95rem' }}>Needs attention</h3>
        <Link href="/budgets" className="link-btn">See all <ChevronRight size={14} /></Link>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
        {topBudgets.map((b) => <BudgetRow key={b.name} {...b} />)}
      </div>
    </div>
  );
}
