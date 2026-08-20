import type { Goal } from '@/types';
import { formatCurrency } from '@/lib/format';

interface GoalCardProps {
  goal: Goal;
}

export function GoalCard({ goal }: GoalCardProps) {
  const pct = (goal.current / goal.target) * 100;
  const Icon = goal.icon;

  return (
    <div className="card" style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1.2rem' }}>
        <span style={{ width: 38, height: 38, borderRadius: '0.7rem', backgroundColor: `${goal.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={18} style={{ color: goal.color }} />
        </span>
        <div>
          <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>{goal.name}</p>
          <p style={{ fontSize: '0.75rem', color: 'var(--ink-soft)' }}>Target {goal.date}</p>
        </div>
      </div>
      <p className="font-display" style={{ fontSize: '1.55rem', fontWeight: 600, marginBottom: '0.2rem' }}>
        {formatCurrency(goal.current)} <span style={{ fontSize: '0.9rem', fontWeight: 400, color: 'var(--ink-soft)' }}>of {formatCurrency(goal.target)}</span>
      </p>
      <div style={{ height: 8, borderRadius: 99, backgroundColor: 'var(--line)', overflow: 'hidden', margin: '0.8rem 0 0.55rem' }}>
        <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, backgroundColor: goal.color, borderRadius: 99, transition: 'width 0.4s ease' }} />
      </div>
      <p style={{ fontSize: '0.78rem', color: 'var(--ink-soft)' }}>{Math.round(pct)}% there — {formatCurrency(goal.target - goal.current)} to go</p>
    </div>
  );
}
