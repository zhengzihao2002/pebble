'use client';

import { createElement, useState } from 'react';
import { CalendarDays, Check, Pencil, Plus, TrendingUp } from 'lucide-react';
import type { Goal } from '@/types';
import { formatCurrency, formatGoalDate } from '@/lib/format';
import { resolveGoalIcon } from '@/lib/data/icons';
import { GoalModal } from '@/components/modals/GoalModal';
import { AddToGoalModal } from '@/components/goals/AddToGoalModal';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { renderTemplate } from '@/lib/i18n/RichText';
import { ProgressRing } from '@/components/kit/ProgressRing';
import { monthlyPace, timeToTarget } from './goalMath';

interface GoalCardProps {
  goal: Goal;
  /** Zone-aware 'YYYY-MM-DD' from the page, or null for the first frame
      (and when omitted): the countdown and monthly pace wait for it. */
  today?: string | null;
  /** Stagger index for the entrance. */
  index?: number;
}

// A client component so each card can own its own edit modal. The goals page
// stays a Server Component: no shell was added for this, since nothing is
// shared between cards. Delete lives inside the edit modal rather than on the
// card, so a stray tap cannot remove a goal.
//
// Redesigned around a progress ring in the goal's colour (its icon centred,
// a check once reached) in place of the flat bar, plus two derived facts:
// how long until the target date and, while the goal is unfinished, roughly
// what a month it needs to make it. A reached goal gets a soft wash of its
// colour and a quiet success chip instead of a dimmed pill.
export function GoalCard({ goal, today = null, index = 0 }: GoalCardProps) {
  const { d, t, locale } = useTranslation();
  const ux = d.ux.goals;
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  // A filled goal takes no more - the server refuses it too.
  const reached = goal.current >= goal.target;
  const pct = (goal.current / goal.target) * 100;
  const when = timeToTarget(d, today, goal.date);
  const pace = monthlyPace(goal, today);
  const money = (n: number) => <span className="font-mono-tab">{formatCurrency(n)}</span>;
  // overUnderLabel's two phrasings, with the amount as an element so privacy
  // mode blurs it (it was plain text before).
  const rest = renderTemplate(goal.current > goal.target ? d.phrasing.pastTarget : d.phrasing.toGo, {
    amount: money(Math.abs(goal.current - goal.target)),
  });

  return (
    <>
    <article
      className={`card pb-goal-card pb-rise${reached ? ' is-reached' : ''}`}
      style={{ ['--pb-goal' as string]: goal.color, ['--pb-i' as string]: Math.min(index, 8) }}
    >
      <div className="pb-goal-top">
        {/* The ring is a ratio of money, so it blurs with the figures in
            privacy mode and a tap reveals it (pb-chart-fill), as on the
            Dashboard's goals card. The words beside it say the same. */}
        <span className="pb-goal-ring pb-chart-fill">
          <ProgressRing value={pct / 100} size={76} stroke={7} color={goal.color}>
            {reached
              ? <Check size={24} strokeWidth={2.6} className="goal-done-badge" style={{ color: goal.color }} aria-hidden="true" />
              : createElement(resolveGoalIcon(goal.iconKey), { size: 24, style: { color: goal.color }, 'aria-hidden': true })}
          </ProgressRing>
        </span>
        <div className="pb-goal-id">
          {/* goal.name is USER DATA and renders exactly as stored. */}
          <p className="pb-goal-name">{goal.name}</p>
          <p className="pb-goal-amount">
            <span className="font-display pb-money">{formatCurrency(goal.current)}</span>{' '}
            <span className="pb-goal-of">{renderTemplate(ux.cardOfTarget, { total: money(goal.target) })}</span>
          </p>
          <p className="pb-goal-there">
            {renderTemplate(d.goalCard.thereSuffix, { pct: <span className="pb-tnum">{Math.round(pct)}</span>, rest })}
          </p>
        </div>
        <button
          type="button" onClick={() => setEditing(true)} className="icon-btn pb-goal-edit"
          aria-label={t(d.goalCard.editAria, { name: goal.name })}
        >
          <Pencil size={14} />
        </button>
      </div>

      <ul className="pb-goal-facts">
        <li>
          <CalendarDays size={14} aria-hidden="true" />
          <span className="pb-tnum">
            {t(d.goalCard.target, { date: formatGoalDate(goal.date, locale) })}
            {/* Reserved: blank until today resolves, so nothing shifts. */}
            {when && !when.passed && <span className="pb-goal-when"> · {when.text}</span>}
          </span>
        </li>
        {!reached && (
          // Past due reads in ink-soft, not wine: a late goal is not an overspend.
          <li className={`pb-goal-pace${when?.passed ? ' is-passed' : ''}`} aria-hidden={today === null ? true : undefined}>
            <TrendingUp size={14} aria-hidden="true" />
            <span>
              {today === null ? '\u00a0'
                : pace !== null ? renderTemplate(ux.monthlyPace, { amount: money(pace) })
                : when?.passed ? ux.targetPassed : '\u00a0'}
            </span>
          </li>
        )}
      </ul>

      <button
        type="button"
        onClick={() => setAdding(true)}
        disabled={reached}
        className={reached ? 'pb-goal-done' : 'btn-primary pb-goal-add'}
      >
        {reached ? <><Check size={15} />{d.goalCard.goalReached}</> : <><Plus size={15} />{d.goalCard.addAmount}</>}
      </button>

    </article>
    {/* The dialogs sit OUTSIDE the article: its entrance animation (a
        transform) and overflow: hidden would otherwise make it the
        containing block of the fixed overlay and clip the dialog. */}
    {editing && <GoalModal goal={goal} onClose={() => setEditing(false)} />}
    {adding && <AddToGoalModal goal={goal} onClose={() => setAdding(false)} />}
    </>
  );
}
