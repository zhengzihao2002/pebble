'use client';

import { useId, useMemo } from 'react';
import { ComposedChart, Area, Line, ReferenceLine, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Gauge } from 'lucide-react';
import type { CategoryMeta, Transaction } from '@/types';
import { formatCurrency } from '@/lib/format';
import { formatCompactCurrency } from '@/lib/chartFormat';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { renderTemplate } from '@/lib/i18n/RichText';
import { INTL_LOCALE } from '@/lib/i18n/locale';
import { PACE_TOLERANCE } from '@/lib/budgetPace';
import { coversHistory, earliestDate, shiftedWindow, windowBounds } from '@/lib/periodCompare';
import { buildSpendingPace } from '@/lib/spendingPace';
import { PeriodLink } from '@/components/shared/PeriodLink';
import { SectionHeader } from '@/components/kit/SectionHeader';
import { EmptyState } from '@/components/kit/EmptyState';
import { BarsSkeleton } from './DashSkeletons';

interface SpendingPaceCardProps {
  transactions: Transaction[];
  categoryMeta: CategoryMeta;
  /** The Dashboard's shared period, owned by the This period card. */
  mode: string;
  periodKey: string | null;
  /** Zone-aware today from DashboardClient; null until resolved. */
  today: Date | null;
  /** False until the saved period has been restored, so the chart draws once. */
  ready: boolean;
  timeFrame: string;
  inProgress: boolean;
}

const SPEND = 'var(--wine)';
const PREVIOUS = 'var(--ink-faint)';
const BUDGET = 'var(--gold)';

/** How much of a year one window is, for the optional budget-pace line. */
const BUDGET_SHARE: Record<string, number> = { month: 1 / 12, quarter: 1 / 4, year: 1, last6: 1 / 2, last12: 1, '30d': 30 / 365, '90d': 90 / 365 };

type TipItem = { dataKey?: unknown; value?: unknown; payload?: { day?: number } };

/** Both cumulative figures (and the budget line's) for the hovered day. */
function PaceTip({ active, payload, dateOfDay }: { active?: boolean; payload?: ReadonlyArray<TipItem>; dateOfDay: (day: number) => string }) {
  const { d, t } = useTranslation();
  const ux = d.ux.dashboard;
  if (!active || !payload || payload.length === 0) return null;
  const day = payload[0]?.payload?.day ?? 0;
  const pick = (key: string) => payload.find((p) => p.dataKey === key)?.value;
  const row = (name: string, v: unknown, color: string) => (typeof v === 'number' ? (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1.25rem' }}>
      <span style={{ color: 'var(--ink-soft)', display: 'inline-flex', alignItems: 'center', gap: 6 }}><i className="pb-dash-key-dot" style={{ backgroundColor: color }} />{name}</span>
      <span className="font-mono-tab" style={{ fontWeight: 600 }}>{formatCurrency(v)}</span>
    </div>
  ) : null);
  return (
    <div className="pb-dash-tip">
      <div style={{ fontWeight: 600, marginBottom: 2 }}>{t(ux.dayN, { n: day })} · {dateOfDay(day)}</div>
      {row(d.dashboard.periodTitle, pick('current'), SPEND)}
      {row(ux.legendLast, pick('previous'), PREVIOUS)}
      {row(ux.legendBudget, pick('budget'), BUDGET)}
    </div>
  );
}

/**
 * NEW: "am I on track?" at a glance. Cumulative spending through the shared
 * period (solid wine, a soft area under it) over the previous comparable
 * period's curve (dashed, faint), aligned day by day - day 16 over day 16 -
 * so the comparison is like-for-like by construction (src/lib/spendingPace.ts).
 *
 * When budgets exist, a dotted gold line spreads the period's share of them
 * evenly across its days. The headline is the same comparison in words, with
 * "about the same" inside the Budgets page's own tolerance (PACE_TOLERANCE).
 *
 * Purely a spending comparison - not a projected balance - so it does not
 * contradict Upcoming's stored-amounts-only rule. Draws once (waits for the
 * restored period and today like its neighbours), fades in, never grows.
 */
export function SpendingPaceCard({ transactions, categoryMeta, mode, periodKey, today, ready, timeFrame, inProgress }: SpendingPaceCardProps) {
  const { d, t, locale } = useTranslation();
  const ux = d.ux.dashboard;
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');

  const model = useMemo(() => {
    if (!ready || !today) return null;
    const current = windowBounds(mode, periodKey, today);
    const previous = shiftedWindow(mode, periodKey, today, 1, false);
    const pace = buildSpendingPace(transactions, current, previous, today);
    // Only a window recorded history fully covers is a fair comparison.
    const hasPrevious = coversHistory(previous, earliestDate(transactions));
    const annual = Object.values(categoryMeta).reduce((s, m) => s + (m.budget > 0 ? m.budget : 0), 0);
    const budget = annual > 0 ? annual * (BUDGET_SHARE[mode] ?? 1) : 0;
    const data = pace.points.map((p) => ({
      ...p,
      previous: hasPrevious ? p.previous : null,
      budget: budget > 0 && p.day <= pace.length ? Math.round((budget * p.day / pace.length) * 100) / 100 : null,
    }));
    return { current, pace, hasPrevious, budget, data };
  }, [ready, today, mode, periodKey, transactions, categoryMeta]);

  const unit = mode === 'month' ? ux.unitMonth : mode === 'quarter' ? ux.unitQuarter : mode === 'year' ? ux.unitYear : ux.unitPeriod;
  const dateOfDay = (day: number) => {
    if (!model) return '';
    const s = model.current.start;
    const dt = new Date(s.getFullYear(), s.getMonth(), s.getDate() + day - 1);
    return locale === 'zh' ? `${dt.getMonth() + 1}月${dt.getDate()}日` : dt.toLocaleDateString(INTL_LOCALE.en, { month: 'short', day: 'numeric' });
  };

  let headline: React.ReactNode = null;
  let tone = 'var(--ink-soft)';
  if (model && model.pace.todayIndex >= 0) {
    const { spentSoFar, previousAtPoint } = model.pace;
    const amount = (n: number) => <strong className="pb-money">{formatCurrency(n)}</strong>;
    const spent = renderTemplate(inProgress ? ux.spentSoFar : ux.spentTotal, { amount: amount(spentSoFar) });
    let versus: React.ReactNode = ux.paceNoPrev;
    if (model.hasPrevious) {
      const diff = spentSoFar - previousAtPoint;
      const same = Math.abs(diff) <= PACE_TOLERANCE * Math.max(previousAtPoint, 1);
      tone = same ? 'var(--ink-soft)' : diff < 0 ? 'var(--pine)' : 'var(--wine)';
      versus = same
        ? t(inProgress ? ux.paceSame : ux.paceSameDone, { unit })
        : renderTemplate(diff < 0 ? (inProgress ? ux.paceLess : ux.paceLessDone) : (inProgress ? ux.paceMore : ux.paceMoreDone), { amount: amount(Math.abs(diff)), unit });
    }
    headline = (
      <p className="pb-dash-pace-head">
        <span>{spent}</span>
        <span className="pb-dash-pace-vs" style={{ color: tone }}>{versus}</span>
      </p>
    );
  }

  const empty = model !== null && model.pace.spentSoFar === 0;

  // The same comparison as a few plain figures, along the card's foot. The
  // card stretches to its row partner's height (often a long Upcoming list);
  // the chart is capped so it never becomes a giant empty plot, and this row
  // sits at the bottom, level with Upcoming's own footer.
  const facts: { key: string; label: string; value: React.ReactNode }[] = [];
  if (model && model.pace.todayIndex >= 0) {
    const elapsed = model.pace.todayIndex + 1;
    facts.push({ key: 'avg', label: ux.paceDailyAvg, value: <span className="font-mono-tab">{formatCurrency(model.pace.spentSoFar / elapsed)}</span> });
    if (model.hasPrevious) facts.push({ key: 'last', label: t(ux.paceLastTotal, { unit }), value: <span className="font-mono-tab">{formatCurrency(model.pace.previousTotal)}</span> });
    if (model.budget > 0) facts.push({ key: 'budget', label: t(ux.paceBudget, { unit }), value: <span className="font-mono-tab">{formatCurrency(model.budget)}</span> });
    // A count of days, not money: readable in privacy mode. Only for a
    // calendar month, quarter or year - a rolling window always ends today,
    // so it would always read 0.
    if (inProgress && (mode === 'month' || mode === 'quarter' || mode === 'year')) facts.push({ key: 'left', label: ux.paceDaysLeft, value: <span className="pb-tnum">{Math.max(0, model.pace.length - elapsed)}</span> });
  }
  const todayDay = model && inProgress && model.pace.todayIndex >= 0 && model.pace.todayIndex < model.pace.length - 1 ? model.pace.todayIndex + 1 : null;
  const endDot = (props: { cx?: number; cy?: number; index?: number }) => (
    model && props.index === model.pace.todayIndex && props.cx !== undefined && props.cy !== undefined
      ? <circle key="end" cx={props.cx} cy={props.cy} r={3.5} fill={SPEND} stroke="var(--mist)" strokeWidth={2} />
      : <g key={`d${props.index}`} />
  );

  return (
    <section className="card pb-dash-card pb-dash-pace" aria-labelledby={`${uid}-title`}>
      <SectionHeader id={`${uid}-title`} title={ux.paceTitle} subtitle={<PeriodLink label={timeFrame} control="dashboard" />} />
      {!model ? (
        <BarsSkeleton minHeight={200} />
      ) : empty ? (
        <div className="pb-dash-fill-empty" style={{ minHeight: 200 }}>
          <EmptyState compact icon={Gauge} title={ux.paceEmpty} body={ux.paceEmptyBody} />
        </div>
      ) : (
        <>
          {headline}
          {/* Grows with the card up to a cap (dashboard.css), never below 200px. */}
          <div key={`${mode}-${periodKey ?? ''}`} className="pb-chart-fade pb-chart-fill pb-dash-chart-box" role="img" aria-label={ux.paceChartLabel}>
            <div style={{ position: 'absolute', inset: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={model.data} margin={{ top: 8, right: 18, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--line)" vertical={false} />
                  <XAxis dataKey="day" type="number" domain={[1, model.data.length]} tick={{ fontSize: 12, fill: 'var(--ink-soft)' }} axisLine={false} tickLine={false} tickFormatter={(v) => dateOfDay(Number(v))} minTickGap={28} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 12, fill: 'var(--ink-soft)' }} axisLine={false} tickLine={false} tickFormatter={(v) => formatCompactCurrency(Number(v))} width={48} />
                  <Tooltip content={<PaceTip dateOfDay={dateOfDay} />} cursor={{ stroke: 'var(--ink-faint)', strokeWidth: 1 }} />
                  {todayDay !== null && (
                    <ReferenceLine x={todayDay} stroke="var(--ink-faint)" label={{ value: d.upcomingCard.today, position: 'insideTopRight', fill: 'var(--ink-soft)', fontSize: 11 }} />
                  )}
                  {model.budget > 0 && (
                    <Line dataKey="budget" type="linear" stroke={BUDGET} strokeWidth={2} strokeDasharray="1 5" strokeLinecap="round" dot={false} activeDot={false} isAnimationActive={false} />
                  )}
                  {model.hasPrevious && (
                    <Line dataKey="previous" type="linear" stroke={PREVIOUS} strokeWidth={1.5} strokeDasharray="5 4" dot={false} activeDot={{ r: 3 }} isAnimationActive={false} connectNulls={false} />
                  )}
                  <Area dataKey="current" type="linear" stroke={SPEND} strokeWidth={2} strokeLinejoin="round" fill={SPEND} fillOpacity={0.1} dot={endDot} activeDot={{ r: 3.5, fill: SPEND, stroke: 'var(--mist)', strokeWidth: 2 }} isAnimationActive={false} connectNulls={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="pb-dash-legend">
            <span><i className="pb-dash-key-line" style={{ backgroundColor: SPEND }} />{d.dashboard.periodTitle}</span>
            {model.hasPrevious && <span><i className="pb-dash-key-line is-dashed" style={{ color: PREVIOUS }} />{ux.legendLast}</span>}
            {model.budget > 0 && <span><i className="pb-dash-key-line is-dotted" style={{ color: BUDGET }} />{ux.legendBudget}</span>}
          </div>
          {facts.length > 0 && (
            <dl className="pb-dash-facts" aria-label={ux.paceFacts}>
              {facts.map((f) => (
                <div key={f.key} className="pb-dash-fact">
                  <dt>{f.label}</dt>
                  <dd>{f.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </>
      )}
    </section>
  );
}
