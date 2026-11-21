'use client';
import { usePartnerView } from '@/components/partner/PartnerViewContext';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Archive, CalendarRange, Check, ChevronDown, LayoutGrid, RotateCcw } from 'lucide-react';
import type { Goal } from '@/types';
import { formatCurrency, formatGoalDate } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { usePebbleStore } from '@/store/usePebbleStore';
import { SectionHeader } from '@/components/kit/SectionHeader';
import { SegmentedControl } from '@/components/kit/SegmentedControl';
import { GoalCard } from './GoalCard';
import { GoalModal } from '@/components/modals/GoalModal';
import { AddGoalTile } from './AddGoalTile';
import { GoalTimeline } from './GoalTimeline';
import { isReached, orderGoals } from './goalMath';
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
export function GoalsView({ goals, unallocated, onQuietDelete }: { goals: Goal[]; unallocated?: number; onQuietDelete?: (id: string) => void }) {
  const { d, t, locale } = useTranslation();
  const ux = d.ux.goals;
  const partner = usePartnerView();
  const today = useGoalsToday();
  // Static first render (cards: the server snapshot), then the remembered
  // choice: no hydration mismatch, and storage that throws (private mode)
  // just keeps cards. A choice made here wins over what was stored.
  const stored = useSyncExternalStore(noSubscribe, readStoredView, () => null);
  // Keep creation outside the view branch: the first save can replace the
  // empty grid with a remembered timeline while its success is still showing.
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<View | null>(null);
  const dismissedIds = usePebbleStore((s) => s.dismissedGoalIds);
  const setGoalDismissed = usePebbleStore((s) => s.setGoalDismissed);
  const listRef = useRef<HTMLElement>(null);
  const historyToggleRef = useRef<HTMLElement>(null);
  const moveFocus = useRef(false);
  const view: View = partner ? 'cards' : picked ?? stored ?? 'cards';
  const choose = (v: View) => {
    setPicked(v);
    try { window.localStorage.setItem(VIEW_KEY, v); } catch { /* not remembered */ }
  };

  const { inProgress, reached, dismissed, visible } = orderGoals(goals, partner ? undefined : dismissedIds);
  const changeDismissal = (goal: Goal, hide: boolean) => {
    if (partner || !isReached(goal)) return;
    moveFocus.current = true;
    setGoalDismissed(goal.id, hide);
  };
  const dismiss = (goal: Goal) => changeDismissal(goal, true);
  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    (historyToggleRef.current ?? listRef.current)?.focus({ preventScroll: true });
  }, [dismissed.length]);
  const empty = goals.length === 0;
  const counts = [
    inProgress.length > 0 ? t(ux.countInProgress, { count: inProgress.length }) : null,
    reached.length > 0 ? t(ux.countReached, { count: reached.length }) : null,
  ].filter(Boolean).join(' · ');

  return (
    <section ref={listRef} tabIndex={-1} className="pb-goals-list" aria-labelledby={empty ? undefined : 'pb-goals-list-title'}>
      {!empty && (
        <SectionHeader
          as="h2" id="pb-goals-list-title" className="pb-goals-list-head"
          title={ux.yourGoals}
          subtitle={counts && (!partner || partner.data.permissions.amounts) ? <span className="pb-tnum">{counts}</span> : undefined}
          actions={!partner ? (
            <SegmentedControl<View>
              size="sm" ariaLabel={ux.viewLabel} value={view} onChange={choose}
              options={[
                { value: 'cards', label: ux.viewCards, icon: LayoutGrid },
                { value: 'timeline', label: ux.viewTimeline, icon: CalendarRange },
              ]}
            />
          ) : undefined}
        />
      )}

      {view === 'timeline' && visible.length > 0 ? (
        <GoalTimeline goals={visible} today={today} onDismiss={dismiss} unallocated={unallocated} onQuietDelete={onQuietDelete} />
      ) : (
        <>
          <div className="goals-grid pb-goals-grid">
            {inProgress.map((g, i) => <GoalCard key={g.id} goal={g} today={today} index={i} unallocated={unallocated} onQuietDelete={onQuietDelete} />)}
            {(!partner || partner.data.permissions.addPersonalGoals) && <AddGoalTile empty={empty}
              onAdd={() => partner ? partner.openEditor({ kind: 'goal' }) : setAdding(true)} />}
            {empty && partner && !partner.data.permissions.addPersonalGoals && <p className="card pb-partner-card pb-partner-note">{d.partner.noShared}</p>}
          </div>
          {reached.length > 0 && (
            <>
              <h3 className="pb-goals-subhead">
                <span className="pb-goals-subhead-icon" aria-hidden="true"><Check size={13} strokeWidth={2.6} /></span>
                {ux.reached}
                <span className="pb-goals-subhead-count pb-tnum">{reached.length}</span>
              </h3>
              <div className="goals-grid pb-goals-grid">
                {reached.map((g, i) => (
                  <GoalCard key={g.id} goal={g} today={today} index={inProgress.length + i} onDismiss={partner ? undefined : dismiss} onQuietDelete={onQuietDelete} />
                ))}
              </div>
            </>
          )}
        </>
      )}
      {dismissed.length > 0 && (
        <details className="card pb-goals-history">
          <summary ref={historyToggleRef} className="pb-goals-history-toggle">
            <span className="pb-goals-subhead-icon" aria-hidden="true"><Archive size={14} /></span>
            {ux.dismissedGoals}
            <span className="pb-goals-subhead-count pb-tnum">{dismissed.length}</span>
            <ChevronDown size={16} className="pb-goals-history-chevron" aria-hidden="true" />
          </summary>
          <p className="pb-goals-history-note">{ux.dismissedHint}</p>
          <ul className="pb-goals-history-list">
            {dismissed.map((goal) => (
              <li key={goal.id} className="pb-goals-history-row">
                <span className="pb-goals-history-dot" style={{ backgroundColor: goal.color }} aria-hidden="true" />
                <div className="pb-goals-history-info">
                  <p className="pb-goal-name">{goal.name}</p>
                  <span className="pb-tnum"><span className="font-mono-tab pb-money">{formatCurrency(goal.current)}</span> · {formatGoalDate(goal.date, locale)}</span>
                </div>
                <button type="button" className="pill pb-goal-dismiss" aria-label={t(ux.restoreGoal, { name: goal.name })} onClick={() => changeDismissal(goal, false)}>
                  <RotateCcw size={14} aria-hidden="true" />{ux.restore}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      {adding && <GoalModal onClose={() => setAdding(false)} />}
    </section>
  );
}
