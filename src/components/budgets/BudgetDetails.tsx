'use client';

import { Bar, BarChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';

/** The last 12 COMPLETE months (oldest first) and each category's spending in them. */
export interface BudgetHistory {
  months: string[]; // 'YYYY-MM'
  byCat: Record<string, number[]>;
}

type TipItem = { payload?: { key?: string; amount?: number } };

/**
 * A category's spending over the last 12 complete months, with its monthly
 * budget as a dashed line, and Quick set: two suggested yearly budgets. A
 * suggestion only opens the row's editor pre-filled; nothing saves on its own.
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
  const series = history?.byCat[name] ?? null;
  const tag = locale === 'zh' ? 'zh-CN' : 'en-US';
  const monthDate = (k: string) => new Date(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, 1);

  if (!history || !series || series.every((v) => v === 0)) {
    return <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--ink-soft)' }}>{d.budgetDetails.noHistory}</p>;
  }

  const data = history.months.map((k, i) => ({
    key: k,
    label: monthDate(k).toLocaleDateString(tag, { month: 'short' }),
    amount: Math.round(series[i] * 100) / 100,
  }));
  const typical = Math.round((series.slice(6).reduce((s, v) => s + v, 0) / 6) * 12);
  const pastYear = Math.round(series.reduce((s, v) => s + v, 0));
  const pill: React.CSSProperties = { padding: '0.45rem 0.85rem', fontSize: '0.8rem', whiteSpace: 'nowrap' };

  // Month, what was spent, and the monthly share of the yearly budget.
  const MonthTip = ({ active, payload }: { active?: boolean; payload?: ReadonlyArray<TipItem> }) => {
    const p = payload?.[0]?.payload;
    if (!active || !p?.key) return null;
    return (
      <div style={{ backgroundColor: 'var(--mist)', border: '1px solid var(--line)', borderRadius: '0.6rem', padding: '0.5rem 0.7rem', fontSize: '0.78rem', boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 150 }}>
        <span style={{ fontWeight: 600 }}>{monthDate(p.key).toLocaleDateString(tag, { month: 'long', year: 'numeric' })}</span>
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
      <div className="pb-chart-fade" style={{ width: '100%', height: 150 }} aria-label={t(d.budgetDetails.chartLabel, { name })} role="img">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--ink-soft)' }} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: 'var(--line)', opacity: 0.4 }} content={<MonthTip />} />
            {budget > 0 && <ReferenceLine y={budget / 12} stroke="var(--ink-soft)" strokeDasharray="4 4" />}
            <Bar dataKey="amount" name={name} fill={color} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', marginRight: '0.25rem' }}>
          <span style={{ fontSize: '0.84rem', fontWeight: 600 }}>{d.budgetRow.quickSet}</span>
        </div>
        <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
          <button type="button" className="pill" title={d.budgetSuggest.averageHint} onClick={() => onSuggest(typical)} style={pill}>
            <span className="font-mono-tab">{formatCurrency(typical)}</span>{' '}{d.budgetRow.annually}
          </button>
          <span style={{ fontSize: '0.7rem', color: 'var(--ink-soft)', textAlign: 'center' }}>{d.budgetRow.typicalCaption}</span>
        </span>
        <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
          <button type="button" className="pill" title={d.budgetSuggest.last12Hint} onClick={() => onSuggest(pastYear)} style={pill}>
            <span className="font-mono-tab">{formatCurrency(pastYear)}</span>{' '}{d.budgetRow.annually}
          </button>
          <span style={{ fontSize: '0.7rem', color: 'var(--ink-soft)', textAlign: 'center' }}>{d.budgetRow.pastYearCaption}</span>
        </span>
      </div>
    </div>
  );
}
