'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { GoalModal } from '@/components/modals/GoalModal';
import { useTranslation } from '@/lib/i18n/useTranslation';

/**
 * An empty slot at the end of the goals grid. It reads as "a goal goes here",
 * and owns its own add dialog the way GoalCard owns its edit dialog.
 */
export function AddGoalTile() {
  const { d } = useTranslation();
  const [adding, setAdding] = useState(false);

  return (
    <>
      <button type="button" className="add-goal-tile" onClick={() => setAdding(true)}>
        <span className="add-goal-tile-badge" aria-hidden="true">
          <Plus size={20} />
        </span>
        <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{d.common.addGoal}</span>
      </button>
      {adding && <GoalModal onClose={() => setAdding(false)} />}
    </>
  );
}
