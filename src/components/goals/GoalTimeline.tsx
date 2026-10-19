'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Check, ChevronRight, Pencil, Plus, TrendingUp } from 'lucide-react';
import type { Goal } from '@/types';
import { formatCurrency, formatGoalDate, formatMonthYear } from '@/lib/format';
import { INTL_LOCALE } from '@/lib/i18n/locale';
import { resolveGoalIcon } from '@/lib/data/icons';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { renderTemplate } from '@/lib/i18n/RichText';
import { ProgressRing } from '@/components/kit/ProgressRing';
import { Skeleton } from '@/components/kit/Skeleton';
import { GoalModal } from '@/components/modals/GoalModal';
import { AddToGoalModal } from './AddToGoalModal';
import { daysBetween, isGoalDate, isReached, monthlyPace, progressOf, timeToTarget } from './goalMath';

// Horizontal layout constants (px). A marker is its ring plus a label beside
// it; markers that would overlap climb to the next lane.
const LANE_H = 70;
const BASE_H = 26;
const LABEL_W = 150;
const RING_MIN = 34;
const RING_MAX = 54;
// The axis runs at least this far past today, so a single near goal is not
// pinned to the right edge.
const MIN_SPAN_DAYS = 120;

function addDaysYmd(ymd: string, days: number): string {
  const dt = new Date(Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)) + days));
  return dt.toISOString().slice(0, 10);
}

/**
 * NEW: the goals laid out by target date, from today on.
 *
 * Wide (Mac): a months axis with a Today line; each goal is a ring on its
 * target date, sized by its target and filled by its progress, named beside
 * it. Selecting one shows its figures and the same two actions as its card
 * (Edit, Add amount) underneath, so the timeline is only another way into
 * the same dialogs.
 *
 * Narrow (phone): a vertical timeline for thumb-scrolling, goals listed under
 * their target month with sticky month headers, a Today marker where the past
 * ends.
 *
 * Both are rendered and the content container's width picks one (goals.css).
 * Rings are ratios of money, so they blur in privacy mode (pb-chart-fill);
 * every amount wears .font-mono-tab. Goal names are user data.
 */
export function GoalTimeline({ goals, today }: { goals: Goal[]; today: string | null }) {
  const [editing, setEditing] = useState<Goal | null>(null);
  const [adding, setAdding] = useState<Goal | null>(null);

  if (today === null) {
    return (
      <div className="card pb-goals-tl" aria-hidden="true">
        <Skeleton width="100%" height="14rem" radius="0.8rem" />
      </div>
    );
  }

  return (
    <>
      <TimelineWide goals={goals} today={today} onEdit={setEditing} onAdd={setAdding} />
      <TimelineNarrow goals={goals} today={today} onEdit={setEditing} onAdd={setAdding} />
      {editing && <GoalModal goal={editing} onClose={() => setEditing(null)} />}
      {adding && <AddToGoalModal goal={adding} onClose={() => setAdding(null)} />}
    </>
  );
}

interface PartProps {
  goals: Goal[];
  today: string;
  onEdit: (g: Goal) => void;
  onAdd: (g: Goal) => void;
}

function GoalRing({ goal, size }: { goal: Goal; size: number }) {
  const Icon = resolveGoalIcon(goal.iconKey);
  const glyph = Math.round(size * 0.36);
  return (
    <span className="pb-chart-fill pb-goals-tl-ring">
      <ProgressRing value={progressOf(goal)} size={size} stroke={size >= 48 ? 6 : 5} color={goal.color}>
        {isReached(goal)
          ? <Check size={glyph} strokeWidth={2.6} style={{ color: goal.color }} aria-hidden="true" />
          : <Icon size={glyph} style={{ color: goal.color }} aria-hidden="true" />}
      </ProgressRing>
    </span>
  );
}

function TimelineWide({ goals, today, onEdit, onAdd }: PartProps) {
  const { d, t, locale } = useTranslation();
  const ux = d.ux.goals;
  const plotRef = useRef<HTMLDivElement>(null);
  // Measured width for lane packing; a typical card width until measured.
  const [width, setWidth] = useState(900);
  useLayoutEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    const measure = () => { if (el.clientWidth > 0) setWidth(el.clientWidth); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const dated = goals.filter((g) => isGoalDate(g.date)).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const undated = goals.filter((g) => !isGoalDate(g.date));
  const firstOpen = dated.find((g) => !isReached(g)) ?? dated[0] ?? undated[0] ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(firstOpen?.id ?? null);
  const selected = goals.find((g) => g.id === selectedId) ?? firstOpen;

  const layout = useMemo(() => {
    const start = dated.length && dated[0].date < today ? dated[0].date : today;
    const lastDate = dated.length ? dated[dated.length - 1].date : today;
    const minEnd = addDaysYmd(today, MIN_SPAN_DAYS);
    const end = lastDate > minEnd ? lastDate : minEnd;
    const span = Math.max(1, daysBetween(start, end));
    // Inset so rings and labels at the ends stay inside the card.
    const x = (ymd: string) => 0.04 + 0.92 * (daysBetween(start, ymd) / span);
    const maxTarget = dated.reduce((m, g) => Math.max(m, g.target), 0);

    const lanesEnd: number[] = [];
    const markers = dated.map((g) => {
      const size = Math.round(RING_MIN + (RING_MAX - RING_MIN) * Math.sqrt(maxTarget > 0 ? g.target / maxTarget : 0));
      const frac = x(g.date);
      const px = frac * width;
      // Labels sit right of the ring, or left of it in the last stretch.
      const flip = frac > 0.72;
      const from = flip ? px - size / 2 - 8 - LABEL_W : px - size / 2;
      const to = flip ? px + size / 2 : px + size / 2 + 8 + LABEL_W;
      let lane = lanesEnd.findIndex((e) => e + 6 <= from);
      if (lane === -1) { lane = lanesEnd.length; lanesEnd.push(to); } else lanesEnd[lane] = to;
      return { goal: g, size, frac, flip, lane };
    });
    const lanes = Math.max(1, lanesEnd.length);

    // Month ticks: a step that leaves about 90px per label.
    const months = Math.max(1, daysBetween(start, end) / 30.44);
    const maxTicks = Math.max(2, Math.floor(width / 90));
    const step = [1, 2, 3, 6, 12, 24, 60].find((s) => months / s <= maxTicks) ?? 120;
    const ticks: { ymd: string; frac: number; label: string }[] = [];
    let y = Number(start.slice(0, 4));
    let m = Number(start.slice(5, 7)); // the month AFTER start's month (1-based -> next index)
    if (m === 12) { y += 1; m = 0; }
    // Align to the step so labels land on Jan/Apr/Jul/Oct and the like.
    while (m % step !== 0 && step <= 12) { m += 1; if (m === 12) { y += 1; m = 0; } }
    for (let i = 0; i < 40; i += 1) {
      const ymd = `${y}-${String(m + 1).padStart(2, '0')}-01`;
      if (ymd > end) break;
      const first = ticks.length === 0;
      ticks.push({
        ymd, frac: x(ymd),
        label: new Date(y, m, 1).toLocaleDateString(INTL_LOCALE[locale], first || m === 0 ? { month: 'short', year: 'numeric' } : { month: 'short' }),
      });
      m += step;
      while (m >= 12) { m -= 12; y += 1; }
    }
    return { markers, lanes, ticks, todayFrac: x(today) };
  }, [dated, today, width, locale]);

  const plotH = layout.lanes * LANE_H + BASE_H + 18;

  return (
    <div className="card pb-goals-tl pb-goals-tl-h">
      <div ref={plotRef} className="pb-goals-tl-plot" style={{ height: plotH }} role="group" aria-label={ux.timelineLabel}>
        {layout.ticks.map((tk) => (
          <span key={tk.ymd} className="pb-goals-tl-grid" style={{ left: `${tk.frac * 100}%` }} aria-hidden="true" />
        ))}
        <span className="pb-goals-tl-today" style={{ left: `${layout.todayFrac * 100}%` }} aria-hidden="true">
          <span>{ux.today}</span>
        </span>
        <span className="pb-goals-tl-axis" aria-hidden="true" />

        {layout.markers.map(({ goal, size, frac, flip, lane }) => {
          const pctNum = Math.round(progressOf(goal) * 100);
          const active = selected?.id === goal.id;
          return (
            <div
              key={goal.id}
              className={`pb-goals-tl-mark${flip ? ' is-flip' : ''}${active ? ' is-active' : ''}`}
              style={{ left: `${frac * 100}%`, height: lane * LANE_H + BASE_H + size / 2, ['--pb-goal' as string]: goal.color, ['--pb-ring' as string]: `${size}px` }}
            >
              <span className="pb-goals-tl-stem" aria-hidden="true" />
              <span className="pb-goals-tl-dot" aria-hidden="true" />
              <button
                type="button" className="pb-goals-tl-btn" aria-pressed={active}
                aria-label={t(ux.goalAria, { name: goal.name, pct: pctNum, date: formatGoalDate(goal.date, locale) })}
                onClick={() => setSelectedId(goal.id)}
              >
                <GoalRing goal={goal} size={size} />
                <span className="pb-goals-tl-text" aria-hidden="true">
                  <span className="pb-goals-tl-name">{goal.name}</span>
                  <span className="pb-goals-tl-date pb-tnum">{formatGoalDate(goal.date, locale)}</span>
                </span>
              </button>
            </div>
          );
        })}
      </div>
      <div className="pb-goals-tl-ticks" aria-hidden="true">
        {layout.ticks.map((tk) => (
          <span key={tk.ymd} className="pb-tnum" style={{ left: `${tk.frac * 100}%` }}>{tk.label}</span>
        ))}
      </div>

      {undated.length > 0 && (
        <div className="pb-goals-tl-undated">
          {undated.map((g) => (
            <button key={g.id} type="button" className="pill" aria-pressed={selected?.id === g.id} onClick={() => setSelectedId(g.id)}>
              <span className="pb-donut-dot" style={{ backgroundColor: g.color }} aria-hidden="true" />{g.name}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="pb-goals-tl-detail goal-step" key={selected.id} aria-live="polite">
          <GoalRing goal={selected} size={56} />
          <GoalFacts goal={selected} today={today} />
          <div className="pb-goals-tl-actions">
            <button type="button" className="pill pb-goals-tl-action" onClick={() => onEdit(selected)} aria-label={t(d.goalCard.editAria, { name: selected.name })}>
              <Pencil size={14} aria-hidden="true" />{ux.edit}
            </button>
            {isReached(selected) ? (
              <span className="pb-goal-done"><Check size={15} aria-hidden="true" />{d.goalCard.goalReached}</span>
            ) : (
              <button type="button" className="btn-primary pb-goals-tl-action" onClick={() => onAdd(selected)}>
                <Plus size={15} aria-hidden="true" />{d.goalCard.addAmount}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Name, figures, date and pace - the timeline's detail and list rows. */
function GoalFacts({ goal, today, compact = false }: { goal: Goal; today: string; compact?: boolean }) {
  const { d, t, locale } = useTranslation();
  const ux = d.ux.goals;
  const reached = isReached(goal);
  const when = timeToTarget(d, today, goal.date);
  const pace = monthlyPace(goal, today);
  const money = (n: number) => <span className="font-mono-tab">{formatCurrency(n)}</span>;
  return (
    <div className="pb-goals-tl-facts">
      <p className="pb-goals-tl-fname">{goal.name}</p>
      <p className="pb-goals-tl-figs">
        {renderTemplate(d.ux.dashboard.goalOf, { current: money(goal.current), target: money(goal.target) })}
        <span className="pb-tnum"> · {Math.round(progressOf(goal) * 100)}%</span>
      </p>
      <p className="pb-goals-tl-meta">
        {!compact && <CalendarDays size={13} aria-hidden="true" />}
        <span className="pb-tnum">
          {compact ? null : t(d.goalCard.target, { date: formatGoalDate(goal.date, locale) })}
          {when && (compact ? when.text : !when.passed || !reached ? ` · ${when.text}` : null)}
        </span>
        {pace !== null && (
          <span className="pb-goals-tl-pace">
            <TrendingUp size={13} aria-hidden="true" />
            {renderTemplate(compact ? ux.monthlyPaceShort : ux.monthlyPace, { amount: money(pace) })}
          </span>
        )}
        {reached && <span className="pb-goals-tl-reached">{ux.reached}</span>}
      </p>
    </div>
  );
}

function TimelineNarrow({ goals, today, onEdit, onAdd }: PartProps) {
  const { d, t, locale } = useTranslation();
  const ux = d.ux.goals;
  const sorted = goals.slice().sort((a, b) => {
    const da = isGoalDate(a.date) ? a.date : '9999-99-99';
    const db = isGoalDate(b.date) ? b.date : '9999-99-99';
    return da < db ? -1 : da > db ? 1 : 0;
  });

  // Groups by target month; the Today marker goes before the first group
  // that is not entirely in the past.
  const groups: { key: string; label: string; past: boolean; goals: Goal[] }[] = [];
  for (const g of sorted) {
    const key = isGoalDate(g.date) ? g.date.slice(0, 7) : 'none';
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      group = {
        key,
        label: key === 'none' ? '—' : formatMonthYear(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, locale),
        past: key !== 'none' && key < today.slice(0, 7),
        goals: [],
      };
      groups.push(group);
    }
    group.goals.push(g);
  }
  const todayAt = groups.findIndex((g) => !g.past);

  return (
    <div className="card pb-goals-tl pb-goals-tl-v">
      <ol className="pb-goals-tl-vlist" aria-label={ux.timelineLabel}>
        {groups.map((group, gi) => (
          <li key={group.key} className={`pb-goals-tl-group${group.past ? ' is-past' : ''}`}>
            {gi === todayAt && (
              <p className="pb-goals-tl-vtoday"><span aria-hidden="true" />{ux.today}</p>
            )}
            <h3 className="pb-goals-tl-month">
              <span>{group.label}</span>
              {group.past && <span className="pb-goals-tl-month-note">{ux.pastDue}</span>}
            </h3>
            <ul className="pb-goals-tl-rows">
              {group.goals.map((g) => {
                const reached = isReached(g);
                return (
                  <li key={g.id} className="pb-goals-tl-row" style={{ ['--pb-goal' as string]: g.color }}>
                    <span className="pb-goals-tl-vdot" aria-hidden="true" />
                    <button
                      type="button" className="pb-goals-tl-rowbtn"
                      aria-label={t(d.goalCard.editAria, { name: g.name })}
                      onClick={() => onEdit(g)}
                    >
                      <GoalRing goal={g} size={44} />
                      <GoalFacts goal={g} today={today} compact />
                      <ChevronRight size={16} className="pb-goals-tl-chev" aria-hidden="true" />
                    </button>
                    {!reached && (
                      <button
                        type="button" className="icon-btn pb-goals-tl-add"
                        aria-label={t(ux.addAmountTo, { name: g.name })}
                        onClick={() => onAdd(g)}
                      >
                        <Plus size={16} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
        {todayAt === -1 && (
          <li className="pb-goals-tl-group">
            <p className="pb-goals-tl-vtoday"><span aria-hidden="true" />{ux.today}</p>
          </li>
        )}
      </ol>
    </div>
  );
}
