'use client';

import { useState } from 'react';
import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { yearFraction } from '@/lib/budgetPace';
import { SegmentedControl } from '@/components/kit/SegmentedControl';
import { Skeleton } from '@/components/kit/Skeleton';

/** Every month from January three years ago through the current month (oldest first), and each category's spending in them. */
export interface BudgetHistory {
  months: string[]; // 'YYYY-MM'
  byCat: Record<string, number[]>;
  /** The current month, 'YYYY-MM' - included in months, still in progress. */
  current: string;
}

type TipItem = { payload?: { key?: string; amount?: number; current?: boolean } };
type CumItem = { payload?: { x?: number; label?: string; spent?: number; pace?: number; today?: boolean } };

const pad = (n: number) => String(n).padStart(2, '0');

/** Share of `year` elapsed at the start of month `mi` (0-11), by days. */
function monthStart(year: number, mi: number): number {
  const start = Date.UTC(year, 0, 1);
  return (Date.UTC(year, mi, 1) - start) / (Date.UTC(year + 1, 0, 1) - start);
}

/** Month, what was spent, and the monthly share of the yearly budget. */
function MonthTip({ active, payload, tag, budget, inProgress, spentLabel, monthlyLabel }: {
  active?: boolean; payload?: ReadonlyArray<TipItem>; tag: string; budget: number;
  inProgress: string; spentLabel: string; monthlyLabel: string;
}) {
  const p = payload?.[0]?.payload;
  if (!active || !p?.key) return null;
  return (
    <div style={{ backgroundColor: 'var(--mist)', border: '1px solid var(--line)', borderRadius: '0.6rem', padding: '0.5rem 0.7rem', fontSize: '0.78rem', boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 150 }}>
      <span style={{ fontWeight: 600 }}>
        {new Date(Number(p.key.slice(0, 4)), Number(p.key.slice(5, 7)) - 1, 1).toLocaleDateString(tag, { month: 'long', year: 'numeric' })}
        {p.current && <span style={{ fontWeight: 400, color: 'var(--ink-soft)' }}>{` · ${inProgress}`}</span>}
      </span>
      <span style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
        <span style={{ color: 'var(--ink-soft)' }}>{spentLabel}</span>
        <span className="font-mono-tab" style={{ fontWeight: 600 }}>{formatCurrency(p.amount ?? 0)}</span>
      </span>
      {budget > 0 && (
        <span style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
          <span style={{ color: 'var(--ink-soft)' }}>{monthlyLabel}</span>
          <span className="font-mono-tab">{formatCurrency(budget / 12)}</span>
        </span>
      )}
    </div>
  );
}

/** A point on the Year to date line: when, the running total, and the pace. */
function CumTip({ active, payload, spentLabel, paceLabel }: {
  active?: boolean; payload?: ReadonlyArray<CumItem>; spentLabel: string; paceLabel: string;
}) {
  const p = payload?.[0]?.payload;
  if (!active || !p?.label || p.spent == null) return null;
  return (
    <div className="pb-bud-tip">
      <span style={{ fontWeight: 600 }}>{p.label}</span>
      <span className="pb-bud-tip-row">
        <span>{spentLabel}</span>
        <span className="font-mono-tab" style={{ fontWeight: 600 }}>{formatCurrency(p.spent)}</span>
      </span>
      {p.pace != null && (
        <span className="pb-bud-tip-row">
          <span>{paceLabel}</span>
          <span className="font-mono-tab">{formatCurrency(p.pace)}</span>
        </span>
      )}
    </div>
  );
}

/**
 * A category's spending by month for one calendar year - this year by
 * default, or one of the previous three with spending - so the bars add up to
 * exactly that year's spending (budgets are yearly). The current month is
 * included (lighter, in progress); later months are empty. The monthly budget
 * is a dashed line. Quick set offers two yearly budgets from the last 12
 * complete months; a suggestion only opens the row's editor pre-filled.
 *
 * NEW: a Year to date view of the same year - spending added up month by
 * month against a straight line from nothing on Jan 1 to the whole budget on
 * Dec 31 (an even pace), with today marked in the current year: the picture
 * of "ahead or behind". Wide cards put Quick set beside the chart.
 */
export function BudgetDetails({ name, color, budget, history, today, onSuggest }: {
  name: string;
  color: string;
  /** Yearly budget, 0 when none. */
  budget: number;
  history: BudgetHistory | null;
  /** Zone-aware 'YYYY-MM-DD' (places today on the Year to date line). */
  today?: string | null;
  onSuggest: (yearly: number) => void;
}) {
  const { d, t, locale } = useTranslation();
  const ux = d.ux.budgets;
  const currentYear = history ? Number(history.current.slice(0, 4)) : new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [view, setView] = useState<'month' | 'cumulative'>('month');
  const series = history?.byCat[name] ?? null;
  const tag = locale === 'zh' ? 'zh-CN' : 'en-US';
  const monthDate = (k: string) => new Date(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, 1);

  // History is built once today is known; until then, the chart's shape
  // rather than a false "no spending".
  if (!history) {
    return (
      <div className="pb-bud-det" aria-hidden="true">
        <Skeleton width="100%" height={160} radius="0.75rem" />
      </div>
    );
  }
  if (!series || series.every((v) => v === 0)) {
    return <p className="pb-bud-det-empty">{d.budgetDetails.noHistory}</p>;
  }

  const indexOf = new Map(history.months.map((k, i) => [k, i]));
  // This year always; each of the previous three only when it has spending here.
  const yearTotal = (yy: number) => history.months.reduce((s, k, i) => (k.startsWith(`${yy}-`) ? s + series[i] : s), 0);
  const years = [0, 1, 2, 3].map((n) => currentYear - n).filter((yy) => yy === currentYear || yearTotal(yy) > 0);
  const shown = years.includes(year) ? year : currentYear;

  const data = Array.from({ length: 12 }, (_, mi) => {
    const key = `${shown}-${pad(mi + 1)}`;
    const i = indexOf.get(key);
    return {
      key,
      label: monthDate(key).toLocaleDateString(tag, { month: 'short' }),
      amount: i === undefined ? 0 : Math.round(series[i] * 100) / 100,
      current: key === history.current,
    };
  });
  const spentInYear = Math.round(data.reduce((s, p) => s + p.amount, 0) * 100) / 100;

  // Quick set: the last 12 COMPLETE months (everything before the current month).
  const complete = series.slice(-13, -1);
  const typical = Math.round((complete.slice(6).reduce((s, v) => s + v, 0) / 6) * 12);
  const pastYear = Math.round(complete.reduce((s, v) => s + v, 0));

  // Year to date: spending added up to the start of each month (x is the
  // share of the year by days), then today's running total in the current
  // year; the even-pace line runs from 0 on Jan 1 to the budget on Dec 31.
  const isCurrent = shown === currentYear;
  const lastMonth = isCurrent ? Number(history.current.slice(5, 7)) - 1 : 11;
  const todayX = isCurrent
    ? (today && today.startsWith(`${shown}-`) ? yearFraction(today) : (monthStart(shown, lastMonth) + monthStart(shown, Math.min(lastMonth + 1, 11))) / 2)
    : 1;
  const ticks = Array.from({ length: 12 }, (_, mi) => monthStart(shown, mi));
  // Month names sit in the middle of their month, so January and December
  // are never clipped at the chart's edges.
  const labelTicks = ticks.map((x, mi) => (x + (mi === 11 ? 1 : ticks[mi + 1])) / 2);
  const tickLabel = (x: number) => {
    const mi = labelTicks.indexOf(x);
    return mi < 0 ? '' : data[mi].label;
  };
  const cum: { x: number; label: string; spent: number | null; pace: number | null; today?: boolean }[] = [];
  let run = 0;
  for (let mi = 0; mi <= lastMonth; mi++) {
    const label = mi === 0
      ? new Date(shown, 0, 1).toLocaleDateString(tag, { month: 'short', day: 'numeric', year: 'numeric' })
      : t(ux.endOf, { month: monthDate(data[mi - 1].key).toLocaleDateString(tag, { month: 'long', year: 'numeric' }) });
    cum.push({ x: ticks[mi], label, spent: Math.round(run * 100) / 100, pace: budget > 0 ? budget * ticks[mi] : null });
    run += data[mi].amount;
  }
  cum.push({
    x: todayX,
    label: isCurrent ? ux.todayTick : t(ux.endOf, { month: monthDate(data[11].key).toLocaleDateString(tag, { month: 'long', year: 'numeric' }) }),
    spent: Math.round(run * 100) / 100, pace: budget > 0 ? budget * todayX : null, today: isCurrent,
  });
  // The pace line carries on to Dec 31 past today.
  if (isCurrent && budget > 0) cum.push({ x: 1, label: '', spent: null, pace: budget });

  const suggestions = [
    { key: 'typical', value: typical, hint: d.budgetSuggest.averageHint, caption: d.budgetRow.typicalCaption },
    { key: 'pastYear', value: pastYear, hint: d.budgetSuggest.last12Hint, caption: d.budgetRow.pastYearCaption },
  ];

  return (
    <div className="pb-bud-det">
      <div className="pb-bud-det-chart">
        <div className="pb-bud-det-tools">
          {years.length > 1 && (
            <div role="group" aria-label={d.budgetDetails.yearLabel} className="pb-bud-det-years">
              {years.map((yy) => (
                <button
                  key={yy} type="button" onClick={() => setYear(yy)} aria-pressed={yy === shown}
                  className={`pill pb-tnum ${yy === shown ? 'active' : ''}`}
                >
                  {yy}
                </button>
              ))}
            </div>
          )}
          <SegmentedControl<'month' | 'cumulative'>
            size="sm" ariaLabel={ux.viewLabel} value={view} onChange={setView} className="pb-bud-det-view"
            options={[{ value: 'month', label: ux.viewMonth }, { value: 'cumulative', label: ux.viewCumulative }]}
          />
        </div>
        {view === 'month' ? (
          <div key="month" className="pb-chart-fade pb-bud-det-plot" aria-label={t(d.budgetDetails.chartLabel, { name, year: String(shown) })} role="img">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--ink-soft)' }} axisLine={false} tickLine={false} interval={0} />
                <Tooltip cursor={{ fill: 'var(--line)', opacity: 0.4 }} content={<MonthTip tag={tag} budget={budget} inProgress={d.budgetDetails.inProgress} spentLabel={d.budgetRow.tipSpent} monthlyLabel={d.budgetRow.tipMonthly} />} />
                {budget > 0 && <ReferenceLine y={budget / 12} stroke="var(--ink-soft)" strokeDasharray="4 4" />}
                <Bar dataKey="amount" name={name} fill={color} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false}>
                  {data.map((p) => <Cell key={p.key} fill={color} fillOpacity={p.current ? 0.5 : 1} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div key="cumulative" className="pb-chart-fade pb-bud-det-plot" aria-label={t(ux.cumulativeLabel, { name, year: String(shown) })} role="img">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={cum} margin={{ top: 18, right: 6, left: 6, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--line)" />
                <XAxis
                  dataKey="x" type="number" domain={[0, 1]} ticks={labelTicks} tickFormatter={tickLabel}
                  tick={{ fontSize: 11, fill: 'var(--ink-soft)' }} axisLine={false} tickLine={false} interval={0}
                />
                <Tooltip cursor={{ stroke: 'var(--ink-soft)', strokeWidth: 1 }} content={<CumTip spentLabel={d.budgetPage.spentSoFar} paceLabel={ux.evenPace} />} />
                {isCurrent && <ReferenceLine x={todayX} stroke="var(--ink-soft)" strokeWidth={1} label={{ value: ux.todayTick, position: 'top', fontSize: 10, fill: 'var(--ink-soft)' }} />}
                {budget > 0 && (
                  <Line dataKey="pace" type="linear" stroke="var(--ink-soft)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} activeDot={false} isAnimationActive={false} />
                )}
                <Area
                  dataKey="spent" type="linear" stroke={color} strokeWidth={2} strokeLinejoin="round" fill={color} fillOpacity={0.1}
                  connectNulls={false} dot={false} activeDot={{ r: 3.5, stroke: 'var(--mist)', strokeWidth: 2 }} isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="pb-bud-det-foot">
          <p className="font-mono-tab">
            {t(d.budgetDetails.spentIn, { year: String(shown), amount: formatCurrency(spentInYear) })}
          </p>
          {budget > 0 && (
            <span className="pb-bud-det-key" aria-hidden="true">
              <span className="pb-bud-det-key-dash" />
              {view === 'month' ? d.budgetRow.tipMonthly : ux.evenPace}
            </span>
          )}
        </div>
      </div>
      <div className="pb-bud-qs">
        <span className="pb-bud-qs-title">{d.budgetRow.quickSet}</span>
        <div className="pb-bud-qs-grid">
          {suggestions.map((s) => (
            <button key={s.key} type="button" className="pb-bud-qs-card" title={s.hint} onClick={() => onSuggest(s.value)}>
              <span className="pb-bud-qs-amt">
                <span className="font-mono-tab">{formatCurrency(s.value)}</span>{' '}
                <span className="pb-bud-qs-unit">{d.budgetRow.annually}</span>
              </span>
              <span className="pb-bud-qs-month font-mono-tab">{t(ux.aboutMonthly, { amount: formatCurrency(s.value / 12) })}</span>
              <span className="pb-bud-qs-cap">{s.caption}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
