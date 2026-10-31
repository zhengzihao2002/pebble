'use client';

import { RollingAmount } from '@/components/shared/RollingAmount';
import { useState } from 'react';
import { ArrowDownRight, ArrowUpRight, CalendarCheck, CalendarClock, Check, ChevronDown, Pause, Pencil, Play, Plus, Repeat } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/format';
import { descriptionTitle } from '@/lib/transactionDescription';
import { categoryLabel } from '@/lib/i18n/enumLabels';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { SectionHeader } from '@/components/kit/SectionHeader';
import { SegmentedControl } from '@/components/kit/SegmentedControl';
import { EmptyState } from '@/components/kit/EmptyState';
import { ProgressRing } from '@/components/kit/ProgressRing';
import { requestShell } from '@/components/layout/shellEvents';
import { planChargeNext } from '@/lib/recurring/chargeNext';
import type { RecurringRule } from '@/types';
import { daysBetween, describeSchedule, isDone, monthlyEquivalent, nextDate, ruleProgress } from './schedulePlan';

type Filter = 'all' | 'active' | 'paused' | 'finished';

interface ScheduleRulesProps {
  rules: RecurringRule[];
  today: string | null;
  busyId: string | null;
  onToggle: (rule: RecurringRule) => void;
  onEdit: (rule: RecurringRule) => void;
  /** Opens the "Charge next payment now" confirmation (ScheduledClient owns it). */
  onCharge: (rule: RecurringRule) => void;
  /** The brief "Charged. Next payment: ..." line for the rule just charged. */
  chargedNote: { ruleId: string; text: string } | null;
}

/**
 * "Your schedules": every rule as a soft tile - a kind chip (arrow in or
 * out, with a small repeat / one-off mark), the title with a Paused or
 * Finished capsule, the category and schedule sentence, the next date, the
 * amount with its monthly equivalent, and for schedules that end, how far
 * through they are. Split into Income and Payments, each with its monthly
 * total; a filter narrows to Active, Paused or Finished (not remembered -
 * the page always opens on All). The long explanation sits behind
 * "How schedules work", word for word.
 *
 * Pause / Resume and Edit behave exactly as before; ScheduledClient owns
 * them (single-flight busy guard, retry, no optimistic update). Active
 * schedules with a payment still to come also offer a quiet "Charge now".
 */
export function ScheduleRules({ rules, today, busyId, onToggle, onEdit, onCharge, chargedNote }: ScheduleRulesProps) {
  const { d, t } = useTranslation();
  const x = d.ux.scheduled;
  const [filter, setFilter] = useState<Filter>('all');

  const stateOf = (r: RecurringRule): Exclude<Filter, 'all'> => (isDone(r) ? 'finished' : r.status === 'paused' ? 'paused' : 'active');
  const counts = { all: rules.length, active: 0, paused: 0, finished: 0 };
  for (const r of rules) counts[stateOf(r)] += 1;
  const visible = filter === 'all' ? rules : rules.filter((r) => stateOf(r) === filter);

  const filterOptions = (['all', 'active', 'paused', 'finished'] as const).map((v) => {
    const name = { all: x.filterAll, active: x.filterActive, paused: x.filterPaused, finished: x.filterFinished }[v];
    return { value: v, label: `${name} ${counts[v]}`, ariaLabel: `${name}, ${counts[v]}` };
  });

  const intro = (
    <details className="pb-sched-how">
      <summary><ChevronDown size={14} aria-hidden="true" />{x.howItWorks}</summary>
      <p>{d.scheduled.blurb}</p>
    </details>
  );

  if (rules.length === 0) {
    // {action} renders the Header button's own label - one source of truth,
    // so a rename there cannot leave this sentence stale. Split on the
    // placeholder rather than using t() directly so the button name keeps
    // its <strong> styling.
    const parts = d.scheduled.emptyHint.split('{action}');
    return (
      <section className="card pb-sched-card pb-sched-rules" aria-labelledby="pb-sched-rules-title">
        <SectionHeader id="pb-sched-rules-title" title={d.scheduled.title} icon={Repeat} />
        {intro}
        <EmptyState
          icon={CalendarClock}
          title={x.emptyTitle}
          body={<>{parts[0]}<strong style={{ color: 'var(--ink)' }}>{d.header.addSchedule}</strong>{parts[1]}</>}
          action={(
            <button type="button" className="btn-primary pb-sched-empty-btn" onClick={() => requestShell('addSchedule')}>
              <Plus size={15} aria-hidden="true" />{d.header.addSchedule}
            </button>
          )}
        />
      </section>
    );
  }

  const sections = [
    { key: 'income', title: x.sectionIncome, rules: visible.filter((r) => r.kind === 'income') },
    { key: 'expense', title: x.sectionPayments, rules: visible.filter((r) => r.kind !== 'income') },
  ].filter((s) => s.rules.length > 0);

  // A section's monthly figure counts its ACTIVE, repeating, unfinished
  // rules - the same set the hero adds up - whatever the filter shows.
  const sectionMonthly = (kind: string) => rules
    .filter((r) => (kind === 'income') === (r.kind === 'income') && r.status === 'active' && !isDone(r))
    .reduce((s, r) => s + (monthlyEquivalent(r) ?? 0), 0);

  return (
    <section className="card pb-sched-card pb-sched-rules" aria-labelledby="pb-sched-rules-title">
      <SectionHeader
        id="pb-sched-rules-title"
        icon={Repeat}
        title={d.scheduled.title}
        subtitle={<span className="pb-tnum">{rules.length === 1 ? x.countSubOne : t(x.countSub, { count: rules.length, active: counts.active })}</span>}
      />
      {intro}
      <SegmentedControl<Filter>
        options={filterOptions} value={filter} onChange={setFilter}
        ariaLabel={x.filterLabel} size="sm" fullWidth className="pb-sched-filter"
      />

      {sections.length === 0 ? (
        <p className="pb-sched-quiet">{x.filterEmpty}</p>
      ) : sections.map((s) => {
        const monthly = sectionMonthly(s.key);
        return (
          <div key={s.key} className="pb-sched-section">
            <div className="pb-sched-section-head">
              <span>{s.title} <span className="pb-tnum pb-sched-section-count">{s.rules.length}</span></span>
              {monthly !== 0 && (
                <span>
                  {(() => {
                    const [a, b] = x.perMonthApprox.split('{amount}');
                    return <>{a}<span className="font-mono-tab">{monthly > 0 ? '+' : ''}<RollingAmount value={formatCurrency(monthly)} /></span>{b}</>;
                  })()}
                </span>
              )}
            </div>
            <ul className="pb-sched-rule-grid">
              {s.rules.map((rule) => (
                <RuleTile
                  key={rule.id} rule={rule} today={today} busy={busyId === rule.id} locked={busyId !== null}
                  onToggle={onToggle} onEdit={onEdit} onCharge={onCharge}
                  chargedText={chargedNote?.ruleId === rule.id ? chargedNote.text : ''}
                />
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

function RuleTile({ rule, today, busy, locked, onToggle, onEdit, onCharge, chargedText }: {
  rule: RecurringRule;
  today: string | null;
  busy: boolean;
  /** Some schedule action is in flight: single-flight, like Pause / Resume. */
  locked: boolean;
  onToggle: (rule: RecurringRule) => void;
  onEdit: (rule: RecurringRule) => void;
  onCharge: (rule: RecurringRule) => void;
  chargedText: string;
}) {
  const { d, t, locale } = useTranslation();
  const x = rule.kind === 'income' ? { ...d.ux.scheduled, ...d.ux.scheduled.incomeCharge } : d.ux.scheduled;
  const paused = rule.status === 'paused';
  // A rule that has made every payment it ever will - derived, never stored
  // (isDone adds fired one-offs to isExhausted). Takes precedence over paused.
  const finished = isDone(rule);
  const isIncome = rule.kind === 'income';
  const KindIcon = isIncome ? ArrowUpRight : ArrowDownRight;
  const title = descriptionTitle(rule.description);
  const monthly = monthlyEquivalent(rule);
  const progress = ruleProgress(rule);
  const next = today ? nextDate(rule, today) : null;
  // Offered only while there is a payment to charge: active, not finished, a
  // next occurrence (planChargeNext is the same rule the server applies).
  // Needs the zone-aware today, so it appears after mount, never in the
  // server render.
  const canCharge = today !== null && planChargeNext(rule, today) !== null;
  const inN = next && today ? daysBetween(today, next) : null;
  const when = next
    ? `${formatDate(next, locale)}${inN === 0 ? ` · ${d.upcomingCard.today}` : inN === 1 ? ` · ${d.upcomingCard.tomorrow}` : inN !== null && inN > 1 ? ` · ${t(x.inDays, { count: inN })}` : ''}`
    : null;
  const [approxA, approxB] = x.perMonthApprox.split('{amount}');
  const approx = monthly !== null && rule.frequency !== 'monthly'
    ? <>{approxA}<span className="font-mono-tab"><RollingAmount value={formatCurrency(monthly)} /></span>{approxB}</>
    : null;

  return (
    <li className={`pb-sched-rule${paused || finished ? ' is-dim' : ''}`}>
      <div className="pb-sched-rule-top">
        <span className={`pb-sched-chip ${isIncome ? 'is-in' : 'is-out'}`} aria-hidden="true">
          <KindIcon size={18} strokeWidth={2.25} />
          <span className="pb-sched-chip-freq">
            {rule.frequency === 'once' ? <CalendarClock size={9} strokeWidth={2.6} /> : <Repeat size={9} strokeWidth={2.6} />}
          </span>
        </span>
        <div className="pb-sched-rule-text">
          <div className="pb-sched-rule-titleline">
            {/* rule.description is USER DATA - rendered as stored. */}
            <span className="pb-sched-row-title">{title}</span>
            {finished
              ? <span className="pb-sched-pill is-finished"><Check size={11} strokeWidth={2.6} aria-hidden="true" />{d.scheduled.finished}</span>
              : paused && <span className="pb-sched-pill"><Pause size={10} strokeWidth={2.6} aria-hidden="true" />{d.scheduled.paused}</span>}
          </div>
          <span className="pb-sched-row-sub">
            {/* rule.category is either a real category name (user data) or
                one of the two income literals - one call handles both,
                translating only the latter. */}
            {categoryLabel(d, rule.category)} · {describeSchedule(rule, d, t, locale)}
          </span>
        </div>
        <div className="pb-sched-rule-money">
          <span className="font-mono-tab pb-sched-rule-amt" style={{ color: isIncome ? 'var(--pine)' : 'var(--ink)' }}>
            <RollingAmount value={formatCurrency(rule.amount)} />
          </span>
          {approx && <span className="pb-sched-rule-approx">{approx}</span>}
        </div>
      </div>

      <div className="pb-sched-rule-foot">
        <div className="pb-sched-rule-life">
          {/* The same monthly figure, moved down here on a narrow list so
              the title keeps the width beside the amount (scheduled.css). */}
          {approx && <span className="pb-sched-life pb-sched-rule-approx-foot"><span>{approx}</span></span>}
          {progress && (
            <span className="pb-sched-life">
              <ProgressRing
                value={progress.done / progress.total} size={22} stroke={3}
                color={finished ? 'var(--ink-soft)' : isIncome ? 'var(--pine)' : 'var(--gold)'}
              />
              <span className="pb-tnum">{t(x.progress, { done: progress.done, total: progress.total })}</span>
            </span>
          )}
          {when && (
            <span className="pb-sched-life pb-tnum"><CalendarClock size={13} aria-hidden="true" />{t(x.nextOn, { date: when })}</span>
          )}
        </div>
        <div className="pb-sched-rule-actions">
          {canCharge && (
            <button
              type="button" onClick={() => onCharge(rule)} disabled={locked}
              className="pb-sched-charge-now"
              aria-label={t(x.chargeNowAria, { description: title })}
            >
              <CalendarCheck size={14} aria-hidden="true" />{x.chargeNow}
            </button>
          )}
          <button
            type="button" onClick={() => onToggle(rule)} disabled={busy || finished}
            className="icon-btn pb-sched-act"
            aria-label={t(paused ? d.scheduled.resumeAria : d.scheduled.pauseAria, { description: title })}
          >
            {paused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}
          </button>
          <button
            type="button" onClick={() => onEdit(rule)}
            className="icon-btn pb-sched-act"
            aria-label={t(d.scheduled.editAria, { description: title })}
          >
            <Pencil size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
      {/* Always rendered so the live region exists before its text does and
          the confirmation is announced; hidden while empty (scheduled.css). */}
      <p className="pb-sched-charged" role="status" aria-live="polite">{chargedText}</p>
    </li>
  );
}
