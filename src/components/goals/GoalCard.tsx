'use client';

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import type { Goal } from '@/types';
import { formatCurrency, formatGoalDate } from '@/lib/format';
import { resolveGoalIcon } from '@/lib/data/icons';
import { GoalModal } from '@/components/modals/GoalModal';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { overUnderLabel } from '@/lib/i18n/phrasing';

interface GoalCardProps {
  goal: Goal;
}

// A client component so each card can own its own edit modal. The goals page
// stays a Server Component: no shell was added for this, since nothing is
// shared between cards. Delete lives inside the edit modal rather than on the
// card, so a stray tap cannot remove a goal.
export function GoalCard({ goal }: GoalCardProps) {
  const { d, t, locale } = useTranslation();
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
          {/* goal.name is USER DATA and renders exactly as stored. */}
          <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>{goal.name}</p>
          <p style={{ fontSize: '0.75rem', color: 'var(--ink-soft)' }}>{t(d.goalCard.target, { date: formatGoalDate(goal.date, locale) })}</p>
        </div>
        <button
          type="button" onClick={() => setEditing(true)} className="icon-btn"
          aria-label={t(d.goalCard.editAria, { name: goal.name })}
          style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0 }}
        >
          <Pencil size={14} />
        </button>
      </div>
      <p className="font-display" style={{ fontSize: '1.55rem', fontWeight: 600, marginBottom: '0.2rem' }}>
        {formatCurrency(goal.current)} <span style={{ fontSize: '0.9rem', fontWeight: 400, color: 'var(--ink-soft)' }}>{t(d.phrasing.ofTarget, { total: formatCurrency(goal.target) })}</span>
      </p>
      <div style={{ height: 8, borderRadius: 99, backgroundColor: 'var(--line)', overflow: 'hidden', margin: '0.8rem 0 0.55rem' }}>
        <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, backgroundColor: goal.color, borderRadius: 99, transition: 'width 0.4s ease' }} />
      </div>
      <p style={{ fontSize: '0.78rem', color: 'var(--ink-soft)' }}>
        {t(d.goalCard.thereSuffix, { pct: Math.round(pct), rest: overUnderLabel(d, 'goal', goal.current, goal.target) })}
      </p>

      {editing && <GoalModal goal={goal} onClose={() => setEditing(false)} />}
    </div>
  );
}
