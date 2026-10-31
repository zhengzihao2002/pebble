'use client';
import { PageSkeleton } from '@/components/loading/PageSkeleton';

import { useCallback, useEffect, useRef, useState } from 'react';
import { setRecurringRuleStatusAction, type ChargeNextRecurringResult } from '@/lib/actions/pebble';
import { callAction } from '@/lib/actions/callAction';
import type { FailureKind } from '@/lib/actions/failureKind';
import { ActionError } from '@/components/shared/ActionError';
import { RecurringRuleModal } from '@/components/modals/RecurringRuleModal';
import { CatchUpNotice } from '@/components/shared/CatchUpNotice';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { translateActionError } from '@/lib/i18n/actionErrors';
import { ScheduleSummary } from '@/components/scheduled/ScheduleSummary';
import { ScheduleCalendar } from '@/components/scheduled/ScheduleCalendar';
import { ScheduleTimeline, cappedCount, dayGroupId } from '@/components/scheduled/ScheduleTimeline';
import { ScheduleRules } from '@/components/scheduled/ScheduleRules';
import { ChargeNextDialog } from '@/components/scheduled/ChargeNextDialog';
import { planChargeNext, type ChargeNextPlan } from '@/lib/recurring/chargeNext';
import { formatDate } from '@/lib/format';
import { useScheduledToday } from '@/components/scheduled/useScheduledToday';
import type { RecurringRule, UpcomingOccurrence } from '@/types';

interface ScheduledClientProps {
  rules: RecurringRule[];
  upcoming: UpcomingOccurrence[];
  previewDays: number;
  catchUp: { expensesCreated: number; incomeCreated: number; truncated: boolean; failed?: boolean };
}

/**
 * The Scheduled page as a cash-flow calendar: a summary of what the
 * schedules add up to, the window as month grids, the upcoming occurrences
 * grouped by month and day, and the schedules themselves. Catch-up and
 * pause/resume errors still lead the page. Every figure comes from the props
 * the server already sends (the same 60-day preview, the same rules); the
 * zone-aware today is resolved after mount (useScheduledToday).
 *
 * Layout: one column on a phone (summary, calendar, coming up, schedules);
 * on a wide main column the summary and calendar span the width and Coming
 * up and the schedules sit side by side (scheduled.css).
 */
export function ScheduledClient({ rules, upcoming, previewDays, catchUp }: ScheduledClientProps) {
  const { d, t, locale } = useTranslation();
  const x = d.ux.scheduled;
  const today = useScheduledToday();
  const [editing, setEditing] = useState<RecurringRule | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<FailureKind | undefined>(undefined);
  // The rule whose toggle failed, so Try again repeats that exact call rather
  // than whichever rule happens to be first.
  const [failedRule, setFailedRule] = useState<RecurringRule | null>(null);
  // "Charge next payment now": the rule and the plan it was confirmed with
  // (frozen at open, so the occurrence shown is the one sent to the server),
  // and the brief confirmation shown on that rule's card afterwards.
  const [charging, setCharging] = useState<{ rule: RecurringRule; plan: ChargeNextPlan } | null>(null);
  const [chargedNote, setChargedNote] = useState<{ ruleId: string; text: string } | null>(null);
  // Coming up past its first dozen rows.
  const [expanded, setExpanded] = useState(false);
  // A calendar pick waiting for the timeline to render that day: the date in
  // a ref, and a counter that runs the effect once the render has landed.
  const jumpTo = useRef<string | null>(null);
  const [jumpSeq, setJumpSeq] = useState(0);
  const pulseTimer = useRef(0);

  // No local state update and no router.refresh(): the action calls
  // revalidatePath(route, 'layout'), which re-renders this route's server
  // component and streams fresh props in.
  const toggleStatus = async (rule: RecurringRule) => {
    if (busyId) return;
    setBusyId(rule.id);
    setError(null);
    setFailedRule(null);
    const result = await callAction(() => setRecurringRuleStatusAction({
      id: rule.id,
      status: rule.status === 'active' ? 'paused' : 'active',
    }));
    setBusyId(null);
    if (!result.ok) {
      setError(translateActionError(d, locale, result));
      setErrorKind(result.kind);
      // Held so Try again repeats this rule's toggle. The status is re-read
      // from `rule` at retry time rather than captured, so a retry always
      // requests the flip from whatever the current state is.
      setFailedRule(rule);
    }
  };

  const openCharge = (rule: RecurringRule) => {
    if (busyId || !today) return;
    const plan = planChargeNext(rule, today);
    if (plan) setCharging({ rule, plan });
  };

  // Same revalidation as pause/resume: the action revalidates this route, so
  // the card's "Next ..." line moves on without a local update or a refresh.
  const charged = (rule: RecurringRule, result: Extract<ChargeNextRecurringResult, { ok: true }>) => {
    const copy = rule.kind === 'income' ? { ...x, ...x.incomeCharge } : x;
    const text = result.nextDate && !result.finished
      ? t(copy.chargedNext, { date: formatDate(result.nextDate, locale) })
      : copy.chargedLast;
    setChargedNote({ ruleId: rule.id, text });
  };
  // The note is brief: gone after a few seconds (the card already shows the
  // new Next line by then).
  useEffect(() => {
    if (!chargedNote) return;
    const id = window.setTimeout(() => setChargedNote(null), 7000);
    return () => window.clearTimeout(id);
  }, [chargedNote]);

  // Calendar -> timeline: open the capped list if the day is beyond it, then
  // scroll the day's group in under the header and pulse it once.
  const pickDay = useCallback((date: string) => {
    const idx = upcoming.findIndex((it) => it.date === date);
    if (idx >= cappedCount(upcoming)) setExpanded(true);
    jumpTo.current = date;
    setJumpSeq((n) => n + 1);
  }, [upcoming]);

  useEffect(() => {
    const date = jumpTo.current;
    jumpTo.current = null;
    if (!date) return;
    const el = document.getElementById(dayGroupId(date));
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    const head = el.querySelector<HTMLElement>('.pb-sched-day-head') ?? el;
    // Re-adding the class restarts the halo for a second pick of the same day.
    head.classList.remove('pb-period-pulse');
    void head.offsetWidth;
    head.classList.add('pb-period-pulse');
    window.clearTimeout(pulseTimer.current);
    pulseTimer.current = window.setTimeout(() => head.classList.remove('pb-period-pulse'), 1900);
  }, [jumpSeq]);
  useEffect(() => () => window.clearTimeout(pulseTimer.current), []);

  if (!today) return <PageSkeleton pathname="/scheduled"/>;

  return (
    <div className="pb-sched">
      <CatchUpNotice {...catchUp} />

      <ActionError
        message={error} kind={errorKind}
        onRetry={failedRule ? () => void toggleStatus(failedRule) : undefined}
        busy={busyId !== null}
      />

      {rules.length > 0 && (
        <>
          <ScheduleSummary rules={rules} upcoming={upcoming} previewDays={previewDays} today={today} />
          {upcoming.length > 0 && (
            <ScheduleCalendar upcoming={upcoming} previewDays={previewDays} today={today} onPick={pickDay} />
          )}
        </>
      )}

      {/* With no schedules yet, the empty state (and its Add schedule
          button) leads; otherwise Coming up does. */}
      <div className={`pb-sched-cols${rules.length === 0 ? ' is-empty' : ''}`}>
        <ScheduleTimeline
          upcoming={upcoming} previewDays={previewDays} today={today}
          expanded={expanded} onToggle={() => setExpanded((v) => !v)}
        />
        <ScheduleRules rules={rules} today={today} busyId={busyId} onToggle={(r) => void toggleStatus(r)} onEdit={setEditing}
          onCharge={openCharge} chargedNote={chargedNote}
        />
      </div>

      {editing && <RecurringRuleModal rule={editing} onClose={() => setEditing(null)} />}
      {charging && (
        <ChargeNextDialog
          rule={charging.rule} plan={charging.plan}
          onClose={() => setCharging(null)} onCharged={charged}
        />
      )}
    </div>
  );
}
