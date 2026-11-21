'use client';

import { useEffect, useRef, useState } from 'react';
import type { Goal } from '@/types';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { GOAL_CREATED_EVENT } from './goalMath';
import { GoalsSummary } from './GoalsSummary';
import { GoalsView } from './GoalsView';

export function OwnGoalsView({ goals, total }: { goals: Goal[]; total: number }) {
  const { d } = useTranslation();
  const [created, setCreated] = useState<Goal[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const page = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onCreated = (event: Event) => {
      const goal = (event as CustomEvent<Goal>).detail;
      event.preventDefault();
      setCreated(previous => previous.some(item => item.id === goal.id) ? previous : [...previous, goal]);
    };
    document.addEventListener(GOAL_CREATED_EVENT, onCreated);
    return () => document.removeEventListener(GOAL_CREATED_EVENT, onCreated);
  }, []);

  const removeGoal = (id: string) => {
    const remove = () => setRemoved(previous => previous.includes(id) ? previous : [...previous, id]);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      remove();
      return;
    }
    const items = page.current?.querySelectorAll<HTMLElement>(`[data-goal-id="${CSS.escape(id)}"]`);
    const exits = Array.from(items ?? []).flatMap(item => {
      if (!item.getClientRects().length || typeof item.animate !== 'function') return [];
      item.inert = true;
      return item.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: 'ease-out', fill: 'forwards' }).finished;
    });
    void Promise.allSettled(exits).then(remove);
  };

  const ids = new Set(goals.map(goal => goal.id));
  const visible = [...goals, ...created.filter(goal => !ids.has(goal.id))].filter(goal => !removed.includes(goal.id));
  const allocated = visible.reduce((sum, goal) => sum + goal.current, 0);
  const unallocated = total - allocated;

  return (
    <div className="pb-goals" ref={page}>
      <GoalsSummary d={d} goals={visible} total={total} allocated={allocated} unallocated={unallocated}
        overAllocated={allocated > 0 && unallocated < 0} />
      <GoalsView goals={visible} unallocated={unallocated} onQuietDelete={removeGoal} />
    </div>
  );
}
