import type { LucideIcon } from 'lucide-react';
import { formatCurrency } from '@/lib/format';

interface BudgetRowProps {
  name: string;
  icon: LucideIcon;
  color: string;
  budget: number;
  spent: number;
  pct: number;
}

export function BudgetRow({ name, icon: Icon, color, budget, spent, pct }: BudgetRowProps) {
  const over = pct > 100;
  const barColor = over ? 'var(--wine)' : pct > 85 ? 'var(--gold)' : 'var(--pine)';
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', fontWeight: 500 }}>
          <Icon size={15} style={{ color }} /> {name}
        </span>
        <span className="font-mono-tab" style={{ fontSize: '0.76rem', color: over ? 'var(--wine)' : 'var(--ink-soft)' }}>
          {formatCurrency(spent)} <span style={{ opacity: 0.6 }}>/ {formatCurrency(budget)}</span>
        </span>
      </div>
      <div style={{ height: 6, borderRadius: 99, backgroundColor: 'var(--line)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, backgroundColor: barColor, borderRadius: 99, transition: 'width 0.4s ease' }} />
      </div>
    </div>
  );
}
