'use client';

import { useState, useSyncExternalStore } from 'react';
import { CalendarRange, Check, LayoutGrid } from 'lucide-react';
import type { Goal } from '@/types';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { SectionHeader } from '@/components/kit/SectionHeader';
import { SegmentedControl } from '@/components/kit/SegmentedControl';
import { GoalCard } from './GoalCard';
import { AddGoalTile } from './AddGoalTile';
import { GoalTimeline } from './GoalTimeline';
import { orderGoals } from './goalMath';
import { useGoalsToday } from './useGoalsToday';

type View = 'cards' | 'timeline';
// A per-viewer convenience only (never shared, never read by the server).
const VIEW_KEY = 'pebble-goals-view';

function readStoredView(): View | null {
  try {
    const stored = window.localStorage.getItem(VIEW_KEY);
    return stored === 'timeline' || stored === 'cards' ? stored : null;
  } catch { return null; /* storage unavailable: the default stands */ }
}
function noSubscribe(): () => void {
  return () => {};
}

/**
 * The goals themselves, below the allocation hero. Cards stay the default
 * view, so nothing is lost; Timeline is another way into the same dialogs.
 *
 * Cards are ordered for what needs attention: goals still in progress by
 * soonest target date, then reached goals under their own heading. The
 * add-goal tile stays the last slot of the in-progress grid (and spans the
 * row, titled, when there are no goals at all).
 */
export function GoalsView({ goals }: { goals: Goal[] }) {
  const { d, t } = useTranslation();
  const ux = d.ux.goals;
  const today = useGoalsToday();
  // Static first render (cards: the server snapshot), then the remembered
  // choice: no hydration mismatch, and storage that throws (private mode)
  // just keeps cards. A choice made here wins over what was stored.
  const stored = useSyncExternalStore(noSubscribe, readStoredView, () => null);
  const [picked, setPicked] = useState<View | null>(null);
  const view: View = picked ?? stored ?? 'cards';
  const choose = (v: View) => {
    setPicked(v);
    try { window.localStorage.setItem(VIEW_KEY, v); } catch { /* not remembered */ }
  };

  const { inProgress, reached } = orderGoals(goals);
  const empty = goals.length === 0;
  const counts = [
    inProgress.length > 0 ? t(ux.countInProgress, { count: inProgress.length }) : null,
    reached.length > 0 ? t(ux.countReached, { count: reached.length }) : null,
  ].filter(Boolean).join(' · ');

  return (
    <section className="pb-goals-list" aria-labelledby={empty ? undefined : 'pb-goals-list-title'}>
      {!empty && (
        <SectionHeader
          as="h2" id="pb-goals-list-title" className="pb-goals-list-head"
          title={ux.yourGoals}
          subtitle={<span className="pb-tnum">{counts}</span>}
          actions={(
            <SegmentedControl<View>
              size="sm" ariaLabel={ux.viewLabel} value={view} onChange={choose}
              options={[
                { value: 'cards', label: ux.viewCards, icon: LayoutGrid },
                { value: 'timeline', label: ux.viewTimeline, icon: CalendarRange },
              ]}
            />
          )}
        />
      )}

      {view === 'timeline' && !empty ? (
        <GoalTimeline goals={goals} today={today} />
      ) : (
        <>
          <div className="goals-grid pb-goals-grid">
            {inProgress.map((g, i) => <GoalCard key={g.id} goal={g} today={today} index={i} />)}
            <AddGoalTile empty={empty} />
          </div>
          {reached.length > 0 && (
            <>
              <h3 className="pb-goals-subhead">
                <span className="pb-goals-subhead-icon" aria-hidden="true"><Check size={13} strokeWidth={2.6} /></span>
                {ux.reached}
                <span className="pb-goals-subhead-count pb-tnum">{reached.length}</span>
              </h3>
              <div className="goals-grid pb-goals-grid">
                {reached.map((g, i) => <GoalCard key={g.id} goal={g} today={today} index={inProgress.length + i} />)}
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
