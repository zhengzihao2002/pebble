'use client';

import Link from 'next/link';
import { Check, ChevronRight, Plus, Target } from 'lucide-react';
import type { Goal } from '@/types';
import { formatCurrency, formatGoalDate } from '@/lib/format';
import { resolveGoalIcon } from '@/lib/data/icons';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { renderTemplate } from '@/lib/i18n/RichText';
import { requestShell } from '@/components/layout/shellEvents';
import { ProgressRing } from '@/components/kit/ProgressRing';
import { SectionHeader } from '@/components/kit/SectionHeader';
import { EmptyState } from '@/components/kit/EmptyState';

interface GoalsGlanceProps {
  goals: Goal[];
  /** Sum of every goal's set-aside amount. */
  allocated: number;
  totalBalance: number;
}

// A glance, not the Goals page: three rings at most, the rest behind See all.
const MAX_GOALS = 3;

/**
 * NEW: goals as progress, not only as the overspend warning. A ring per goal
 * in the goal's own colour (user data, an identity mark), its icon centred,
 * then the name, "$X of $Y" and the target date.
 *
 * When goals claim more than the balance (the GoalOverspendNotice above is
 * showing), each ring wears a thin wine outline, tying the two together.
 * Goal names are user data and never translated.
 */
export function GoalsGlance({ goals, allocated, totalBalance }: GoalsGlanceProps) {
  const { d, t, locale } = useTranslation();
  const ux = d.ux.dashboard;
  const overspent = allocated > 0 && allocated > totalBalance;
  const shown = goals.slice(0, MAX_GOALS);
  const more = goals.length - shown.length;

  return (
    <section className="card pb-dash-card pb-dash-goals">
      <SectionHeader
        title={d.nav.goals}
        subtitle={more > 0 ? t(d.upcomingCard.more, { count: more }) : undefined}
        actions={<Link href="/goals" prefetch={false} className="link-btn">{d.common.seeAll} <ChevronRight size={14} /></Link>}
      />
      {goals.length === 0 ? (
        <EmptyState
          compact icon={Target} title={d.goals.emptyTitle} body={ux.noGoalsBody}
          action={(
            <button type="button" className="btn-primary pb-dash-cta" onClick={() => requestShell('addGoal')}>
              <Plus size={15} aria-hidden="true" />{d.common.addGoal}
            </button>
          )}
        />
      ) : (
        <ul className="pb-dash-goal-list">
          {shown.map((g) => {
            const Icon = resolveGoalIcon(g.iconKey);
            const reached = g.target > 0 && g.current >= g.target;
            const value = g.target > 0 ? g.current / g.target : 0;
            return (
              <li key={g.id} className="pb-dash-goal">
                <span className={`pb-dash-goal-ring${overspent ? ' is-over' : ''}`}>
                  {/* The ring is a ratio of money: with the target known from
                      the Goals page it gives the amount away, so it blurs and
                      taps to reveal like every other chart (pb-chart-fill).
                      The wine outline sits outside it and stays sharp. */}
                  <span className="pb-chart-fill pb-dash-goal-ring-fill">
                    <ProgressRing value={value} size={64} stroke={6} color={g.color}>
                      {reached ? <Check size={20} style={{ color: 'var(--pine)' }} aria-hidden="true" /> : <Icon size={20} style={{ color: g.color }} aria-hidden="true" />}
                    </ProgressRing>
                  </span>
                </span>
                <span className="pb-dash-goal-text">
                  <span className="pb-dash-goal-name">{g.name}</span>
                  <span className="pb-dash-goal-figs">
                    {renderTemplate(ux.goalOf, {
                      current: <span className="font-mono-tab">{formatCurrency(g.current)}</span>,
                      target: <span className="font-mono-tab">{formatCurrency(g.target)}</span>,
                    })}
                  </span>
                  <span className="pb-dash-goal-date">
                    {reached
                      ? <span style={{ color: 'var(--pine)', fontWeight: 600 }}>{ux.reached}</span>
                      : g.date ? t(d.goalCard.target, { date: formatGoalDate(g.date, locale) }) : ' '}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
