'use client';

import { Plus } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';

/**
 * An empty slot at the end of the goals grid. It reads as "a goal goes here",
 * with the dialog owned by GoalsView so it survives the first goal arriving.
 *
 * With no goals at all it spans the row and says so itself, so no separate
 * empty-state card has to point at a button elsewhere.
 */
export function AddGoalTile({ empty = false, onAdd }: { empty?: boolean; onAdd: () => void }) {
  const { d } = useTranslation();

  return (
    <button
      type="button" className={`add-goal-tile${empty ? ' pb-goals-empty-tile' : ''}`} onClick={onAdd}
      style={empty ? { gridColumn: '1 / -1' } : undefined}
    >
      <span className="add-goal-tile-badge" aria-hidden="true">
        <Plus size={20} />
      </span>
      {empty && <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--ink)' }}>{d.goals.emptyTitle}</span>}
      {/* With nothing to look at yet, one line on what a goal is here. */}
      {empty && <span className="pb-goals-empty-body">{d.ux.goals.emptyBody}</span>}
      <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{d.common.addGoal}</span>
    </button>
  );
}
