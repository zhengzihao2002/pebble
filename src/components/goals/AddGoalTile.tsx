'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { GoalModal } from '@/components/modals/GoalModal';
import { useTranslation } from '@/lib/i18n/useTranslation';

/**
 * An empty slot at the end of the goals grid. It reads as "a goal goes here",
 * and owns its own add dialog the way GoalCard owns its edit dialog.
 *
 * With no goals at all it spans the row and says so itself, so no separate
 * empty-state card has to point at a button elsewhere.
 */
export function AddGoalTile({ empty = false }: { empty?: boolean }) {
  const { d } = useTranslation();
  const [adding, setAdding] = useState(false);

  return (
    <>
      <button
        type="button" className="add-goal-tile" onClick={() => setAdding(true)}
        style={empty ? { gridColumn: '1 / -1' } : undefined}
      >
        <span className="add-goal-tile-badge" aria-hidden="true">
          <Plus size={20} />
        </span>
        {empty && <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--ink)' }}>{d.goals.emptyTitle}</span>}
        <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{d.common.addGoal}</span>
      </button>
      {adding && <GoalModal onClose={() => setAdding(false)} />}
    </>
  );
}
