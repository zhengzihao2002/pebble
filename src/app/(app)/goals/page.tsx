'use client';

import { usePebbleStore } from '@/store/usePebbleStore';
import { GoalCard } from '@/components/goals/GoalCard';
import { ComingSoonOverlay } from '@/components/shared/ComingSoonOverlay';

export default function GoalsPage() {
  const goals = usePebbleStore((s) => s.goals);

  return (
    <div style={{ position: 'relative', minHeight: '420px' }}>
      <div className="goals-grid" style={{ pointerEvents: 'none' }}>
        {goals.map((g) => <GoalCard key={g.id} goal={g} />)}
      </div>
      <ComingSoonOverlay label="Under construction" />
    </div>
  );
}
