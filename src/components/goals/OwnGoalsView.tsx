'use client';

import { useEffect, useState } from 'react';
import type { Goal } from '@/types';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { GOAL_CREATED_EVENT } from './goalMath';
import { GoalsSummary } from './GoalsSummary';
import { GoalsView } from './GoalsView';

export function OwnGoalsView({ goals, total }: { goals: Goal[]; total: number }) {
  const { d } = useTranslation();
  const [created, setCreated] = useState<Goal[]>([]);

  useEffect(() => {
    const onCreated = (event: Event) => {
      const goal = (event as CustomEvent<Goal>).detail;
      event.preventDefault();
      setCreated(previous => previous.some(item => item.id === goal.id) ? previous : [...previous, goal]);
    };
    document.addEventListener(GOAL_CREATED_EVENT, onCreated);
    return () => document.removeEventListener(GOAL_CREATED_EVENT, onCreated);
  }, []);

  const ids = new Set(goals.map(goal => goal.id));
  const visible = [...goals, ...created.filter(goal => !ids.has(goal.id))];
  const allocated = visible.reduce((sum, goal) => sum + goal.current, 0);
  const unallocated = total - allocated;

  return (
    <div className="pb-goals">
      <GoalsSummary d={d} goals={visible} total={total} allocated={allocated} unallocated={unallocated}
        overAllocated={allocated > 0 && unallocated < 0} />
      <GoalsView goals={visible} unallocated={unallocated} />
    </div>
  );
}
