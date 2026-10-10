'use client';

import { useState } from 'react';
import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';

/** Every month from January three years ago through the current month (oldest first), and each category's spending in them. */
export interface BudgetHistory {
  months: string[]; // 'YYYY-MM'
  byCat: Record<string, number[]>;
  /** The current month, 'YYYY-MM' - included in months, still in progress. */
  current: string;
}

type TipItem = { payload?: { key?: string; amount?: number; current?: boolean } };

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * A category's spending by month for one calendar year - this year by
 * default, or one of the previous three with spending - so the bars add up to
 * exactly that year's spending (budgets are yearly). The current month is
 * included (lighter, in progress); later months are empty. The monthly budget
 * is a dashed line. Quick set offers two yearly budgets from the last 12
 * complete months; a suggestion only opens the row's editor pre-filled.
 */
export function BudgetDetails({ name, color, budget, history, onSuggest }: {
  name: string;
  color: string;
  /** Yearly budget, 0 when none. */
  budget: number;
  history: BudgetHistory | null;
  onSuggest: (yearly: number) => void;
}) {
  const { d, t, locale } = useTranslation();
  const currentYear = history ? Number(history.current.slice(0, 4)) : new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const series = history?.byCat[name] ?? null;
  const tag = locale === 'zh' ? 'zh-CN' : 'en-US';
  const monthDate = (k: string) => new Date(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, 1);

  if (!history || !series || series.every((v) => v === 0)) {
    return <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--ink-soft)' }}>{d.budgetDetails.noHistory}</p>;
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
  const pill: React.CSSProperties = { width: '100%', justifyContent: 'center', textAlign: 'center', padding: '0.45rem 0.6rem', fontSize: '0.8rem', whiteSpace: 'normal' };

  // Month, what was spent, and the monthly share of the yearly budget.
  const MonthTip = ({ active, payload }: { active?: boolean; payload?: ReadonlyArray<TipItem> }) => {
    const p = payload?.[0]?.payload;
    if (!active || !p?.key) return null;
    return (
      <div style={{ backgroundColor: 'var(--mist)', border: '1px solid var(--line)', borderRadius: '0.6rem', padding: '0.5rem 0.7rem', fontSize: '0.78rem', boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 150 }}>
        <span style={{ fontWeight: 600 }}>
          {monthDate(p.key).toLocaleDateString(tag, { month: 'long', year: 'numeric' })}
          {p.current && <span style={{ fontWeight: 400, color: 'var(--ink-soft)' }}>{` · ${d.budgetDetails.inProgress}`}</span>}
        </span>
        <span style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
          <span style={{ color: 'var(--ink-soft)' }}>{d.budgetRow.tipSpent}</span>
          <span className="font-mono-tab" style={{ fontWeight: 600 }}>{formatCurrency(p.amount ?? 0)}</span>
        </span>
        {budget > 0 && (
          <span style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
            <span style={{ color: 'var(--ink-soft)' }}>{d.budgetRow.tipMonthly}</span>
            <span className="font-mono-tab">{formatCurrency(budget / 12)}</span>
          </span>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {years.length > 1 && (
        <div role="group" aria-label={d.budgetDetails.yearLabel} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
          {years.map((yy) => (
            <button
              key={yy} type="button" onClick={() => setYear(yy)} aria-pressed={yy === shown}
              className={`pill ${yy === shown ? 'active' : ''}`}
              style={{ padding: '0.3rem 0.75rem', fontSize: '0.78rem' }}
            >
              {yy}
            </button>
          ))}
        </div>
      )}
      <div className="pb-chart-fade" style={{ width: '100%', height: 150 }} aria-label={t(d.budgetDetails.chartLabel, { name, year: String(shown) })} role="img">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--ink-soft)' }} axisLine={false} tickLine={false} interval={0} />
            <Tooltip cursor={{ fill: 'var(--line)', opacity: 0.4 }} content={<MonthTip />} />
            {budget > 0 && <ReferenceLine y={budget / 12} stroke="var(--ink-soft)" strokeDasharray="4 4" />}
            <Bar dataKey="amount" name={name} fill={color} radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {data.map((p) => <Cell key={p.key} fill={color} fillOpacity={p.current ? 0.5 : 1} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="font-mono-tab" style={{ margin: '-0.25rem 0 0', fontSize: '0.8rem', color: 'var(--ink-soft)' }}>
        {t(d.budgetDetails.spentIn, { year: String(shown), amount: formatCurrency(spentInYear) })}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <span style={{ fontSize: '0.84rem', fontWeight: 600 }}>{d.budgetRow.quickSet}</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.5rem' }}>
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 3, minWidth: 0 }}>
            <button type="button" className="pill" title={d.budgetSuggest.averageHint} onClick={() => onSuggest(typical)} style={pill}>
              <span className="font-mono-tab">{formatCurrency(typical)}</span>{' '}{d.budgetRow.annually}
            </button>
            <span style={{ fontSize: '0.7rem', color: 'var(--ink-soft)', textAlign: 'center' }}>{d.budgetRow.typicalCaption}</span>
          </span>
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 3, minWidth: 0 }}>
            <button type="button" className="pill" title={d.budgetSuggest.last12Hint} onClick={() => onSuggest(pastYear)} style={pill}>
              <span className="font-mono-tab">{formatCurrency(pastYear)}</span>{' '}{d.budgetRow.annually}
            </button>
            <span style={{ fontSize: '0.7rem', color: 'var(--ink-soft)', textAlign: 'center' }}>{d.budgetRow.pastYearCaption}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
