import { formatCurrency } from '@/lib/format';

interface BudgetSummaryCardProps {
  totalBudget: number;
  totalSpent: number;
}

export function BudgetSummaryCard({ totalBudget, totalSpent }: BudgetSummaryCardProps) {
  const overall = totalSpent > totalBudget;
  const pct = totalBudget > 0 ? Math.min((totalSpent / totalBudget) * 100, 100) : (totalSpent > 0 ? 100 : 0);

  return (
    <div className="card" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '1.5rem' }}>
      <div>
        <p style={{ fontSize: '0.78rem', color: 'var(--ink-soft)', marginBottom: 4 }}>Total annual budget</p>
        <p className="font-display" style={{ fontSize: '1.8rem', fontWeight: 600 }}>{formatCurrency(totalBudget)}</p>
      </div>
      <div className="divider-vert" style={{ height: 40, width: 1, backgroundColor: 'var(--line)' }} />
      <div>
        <p style={{ fontSize: '0.78rem', color: 'var(--ink-soft)', marginBottom: 4 }}>Spent year to date</p>
        <p className="font-display" style={{ fontSize: '1.8rem', fontWeight: 600, color: overall ? 'var(--wine)' : 'var(--ink)' }}>{formatCurrency(totalSpent)}</p>
      </div>
      <div style={{ flex: 1, minWidth: 160 }}>
        <div style={{ height: 8, borderRadius: 99, backgroundColor: 'var(--line)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, backgroundColor: overall ? 'var(--wine)' : 'var(--pine)', borderRadius: 99 }} />
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', marginTop: 6 }}>
          {overall ? `${formatCurrency(totalSpent - totalBudget)} over budget this year` : `${formatCurrency(totalBudget - totalSpent)} left this year`}
        </p>
      </div>
    </div>
  );
}
