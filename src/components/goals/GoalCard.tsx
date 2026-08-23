'use client';

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import type { Goal } from '@/types';
import { formatCurrency, formatGoalDate } from '@/lib/format';
import { resolveGoalIcon } from '@/lib/data/icons';
import { GoalModal } from '@/components/modals/GoalModal';

interface GoalCardProps {
  goal: Goal;
}

// A client component so each card can own its own edit modal. The goals page
// stays a Server Component: no shell was added for this, since nothing is
// shared between cards. Delete lives inside the edit modal rather than on the
// card, so a stray tap cannot remove a goal.
export function GoalCard({ goal }: GoalCardProps) {
  const [editing, setEditing] = useState(false);
  const pct = (goal.current / goal.target) * 100;
  const Icon = resolveGoalIcon(goal.iconKey);

  return (
    <div className="card" style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1.2rem' }}>
        <span style={{ width: 38, height: 38, borderRadius: '0.7rem', backgroundColor: `${goal.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={18} style={{ color: goal.color }} />
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>{goal.name}</p>
          <p style={{ fontSize: '0.75rem', color: 'var(--ink-soft)' }}>Target {formatGoalDate(goal.date)}</p>
        </div>
        <button
          type="button" onClick={() => setEditing(true)} className="icon-btn"
          aria-label={`Edit ${goal.name}`}
          style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0 }}
        >
          <Pencil size={14} />
        </button>
      </div>
      <p className="font-display" style={{ fontSize: '1.55rem', fontWeight: 600, marginBottom: '0.2rem' }}>
        {formatCurrency(goal.current)} <span style={{ fontSize: '0.9rem', fontWeight: 400, color: 'var(--ink-soft)' }}>of {formatCurrency(goal.target)}</span>
      </p>
      <div style={{ height: 8, borderRadius: 99, backgroundColor: 'var(--line)', overflow: 'hidden', margin: '0.8rem 0 0.55rem' }}>
        <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, backgroundColor: goal.color, borderRadius: 99, transition: 'width 0.4s ease' }} />
      </div>
      <p style={{ fontSize: '0.78rem', color: 'var(--ink-soft)' }}>
        {Math.round(pct)}% there — {goal.current >= goal.target
          ? `${formatCurrency(goal.current - goal.target)} past target`
          : `${formatCurrency(goal.target - goal.current)} to go`}
      </p>

      {editing && <GoalModal goal={goal} onClose={() => setEditing(false)} />}
    </div>
  );
}
