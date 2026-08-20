import { formatCurrency } from '@/lib/format';
import type { BudgetEntry } from './types';

interface BudgetCategoryCardProps {
  entry: BudgetEntry;
}

export function BudgetCategoryCard({ entry }: BudgetCategoryCardProps) {
  const { name, icon: Icon, color, budget, spent, pct } = entry;
  const noBudget = budget === 0;
  const over = pct > 100;
  const barColor = noBudget ? 'var(--wine)' : over ? 'var(--wine)' : pct > 85 ? 'var(--gold)' : 'var(--pine)';

  return (
    <div className="card" style={{ padding: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.9rem' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600, fontSize: '0.9rem' }}>
          <span style={{ width: 30, height: 30, borderRadius: '0.6rem', backgroundColor: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon size={15} style={{ color }} />
          </span>
          {name}
        </span>
        {!noBudget && <span style={{ fontSize: '0.75rem', fontWeight: 600, color: barColor }}>{Math.round(pct)}%</span>}
      </div>
      <div style={{ height: 7, borderRadius: 99, backgroundColor: 'var(--line)', overflow: 'hidden', marginBottom: '0.6rem' }}>
        <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, backgroundColor: barColor, borderRadius: 99, transition: 'width 0.4s ease' }} />
      </div>
      <div className="font-mono-tab" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
        {noBudget ? (
          <span style={{ color: 'var(--wine)' }}>{formatCurrency(spent)} spent — no budget set</span>
        ) : (
          <>
            <span style={{ color: 'var(--ink-soft)' }}>{formatCurrency(spent)} of {formatCurrency(budget)}</span>
            <span style={{ color: over ? 'var(--wine)' : 'var(--ink-soft)' }}>{over ? `${formatCurrency(spent - budget)} over` : `${formatCurrency(budget - spent)} left`}</span>
          </>
        )}
      </div>
    </div>
  );
}
