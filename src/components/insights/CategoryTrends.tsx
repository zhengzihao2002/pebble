'use client';

import { useState } from 'react';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import type { CategoryMeta, Transaction } from '@/types';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';

const pad = (n: number) => String(n).padStart(2, '0');
const SHOWN = 6;
/** Within this many percent either way reads as "about the same". */
const SAME_BAND = 5;

type TipItem = { payload?: { key?: string; amount?: number } };

/**
 * Each category's spending over the last 6 COMPLETE months, and how the last
 * of them compares with the average of the 3 before it. The comparison is
 * spelled out on the card so the percentage is never ambiguous.
 */
export function CategoryTrends({ transactions, categoryMeta, today }: {
  transactions: Transaction[];
  categoryMeta: CategoryMeta;
  today: string | null;
}) {
  const { d, t, locale } = useTranslation();
  const [showAll, setShowAll] = useState(false);
  if (!today) return <section className="card" style={{ padding: '1.25rem 1.5rem', minHeight: 260 }} aria-busy="true" />;

  const tag = locale === 'zh' ? 'zh-CN' : 'en-US';
  const ty = Number(today.slice(0, 4));
  const tm = Number(today.slice(5, 7)) - 1;
  const months: string[] = [];
  for (let i = 6; i >= 1; i--) {
    const dt = new Date(ty, tm - i, 1);
    months.push(`${dt.getFullYear()}-${pad(dt.getMonth() + 1)}`);
  }
  const index = new Map(months.map((k, i) => [k, i]));
  const monthDate = (k: string) => new Date(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, 1);

  const sums: Record<string, number[]> = {};
  for (const x of transactions) {
    if (x.type !== 'expense' || x.amount >= 0) continue;
    const i = index.get(x.date.slice(0, 7));
    if (i === undefined) continue;
    (sums[x.category] ??= Array(6).fill(0))[i] += Math.abs(x.amount);
  }

  const rows = Object.entries(sums)
    .filter(([, s]) => s.slice(2).some((v) => v > 0))
    .map(([name, s]) => {
      const last = s[5];
      const prevAvg = (s[2] + s[3] + s[4]) / 3;
      const change = prevAvg > 0 ? Math.round(((last - prevAvg) / prevAvg) * 100) : null;
      return { name, series: s, change, isNew: prevAvg === 0 && last > 0 };
    })
    .sort((a, b) => (b.isNew ? Infinity : Math.abs(b.change ?? 0)) - (a.isNew ? Infinity : Math.abs(a.change ?? 0)));

  const shown = showAll ? rows : rows.slice(0, SHOWN);
  const lastName = monthDate(months[5]).toLocaleDateString(tag, { month: 'long' });
  const range = `${monthDate(months[2]).toLocaleDateString(tag, { month: 'short' })}–${monthDate(months[4]).toLocaleDateString(tag, { month: 'short' })}`;

  const MonthTip = ({ active, payload }: { active?: boolean; payload?: ReadonlyArray<TipItem> }) => {
    const p = payload?.[0]?.payload;
    if (!active || !p?.key) return null;
    return (
      <div style={{ backgroundColor: 'var(--mist)', border: '1px solid var(--line)', borderRadius: '0.5rem', padding: '0.35rem 0.55rem', fontSize: '0.74rem', boxShadow: 'var(--shadow)', whiteSpace: 'nowrap' }}>
        <span style={{ color: 'var(--ink-soft)' }}>{monthDate(p.key).toLocaleDateString(tag, { month: 'long', year: 'numeric' })}</span>
        {' · '}
        <span className="font-mono-tab" style={{ fontWeight: 600 }}>{formatCurrency(p.amount ?? 0)}</span>
      </div>
    );
  };

  return (
    <section className="card" style={{ padding: '1.25rem 1.5rem' }} aria-labelledby="pb-trends-title">
      <h3 id="pb-trends-title" style={{ fontWeight: 600, fontSize: '0.95rem', margin: 0 }}>{d.insights.trendsTitle}</h3>
      <p style={{ margin: '0.2rem 0 0.9rem', fontSize: '0.78rem', color: 'var(--ink-soft)' }}>
        {t(d.insights.trendsHint, { last: lastName, range })}
      </p>

      {rows.length === 0 ? (
        <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--ink-soft)' }}>{d.insights.noTrends}</p>
      ) : (
        <>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {shown.map((r, i) => {
              const meta = categoryMeta[r.name];
              const Icon = meta?.icon;
              const color = meta ? meta.color : 'var(--ink-soft)';
              const same = r.change !== null && Math.abs(r.change) < SAME_BAND;
              const badge = r.isNew ? d.insights.newCategory
                : r.change === null || same ? d.insights.same
                : r.change > 0 ? t(d.insights.up, { pct: r.change })
                : t(d.insights.down, { pct: Math.abs(r.change) });
              const badgeColor = r.isNew || r.change === null || same ? 'var(--ink-soft)' : r.change > 0 ? 'var(--wine)' : 'var(--pine)';
              const data = months.map((k, j) => ({ key: k, amount: Math.round(r.series[j] * 100) / 100 }));
              return (
                <li key={r.name} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 96px 6.5rem', gap: '0.75rem', alignItems: 'center', padding: '0.5rem 0', borderTop: i === 0 ? 'none' : '1px solid var(--line)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', minWidth: 0 }}>
                    <span aria-hidden="true" style={{ display: 'inline-flex', flexShrink: 0, color }}>{Icon && <Icon size={15} />}</span>
                    {/* Category names are USER DATA and render as stored. */}
                    <span style={{ fontSize: '0.86rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                  </span>
                  <div className="pb-chart-fade" style={{ width: 96, height: 36 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                        <Tooltip cursor={{ fill: 'var(--line)', opacity: 0.4 }} content={<MonthTip />} allowEscapeViewBox={{ x: true, y: true }} />
                        <Bar dataKey="amount" radius={[2, 2, 0, 0]} isAnimationActive={false}>
                          {data.map((_, j) => <Cell key={j} fill={color} fillOpacity={j === 5 ? 1 : 0.4} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: badgeColor, textAlign: 'right' }}>{badge}</span>
                </li>
              );
            })}
          </ul>
          {rows.length > SHOWN && (
            <button
              type="button" onClick={() => setShowAll((v) => !v)}
              style={{ marginTop: '0.6rem', background: 'none', border: 'none', padding: 0, color: 'var(--pine)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
            >
              {showAll ? d.insights.showLess : t(d.insights.showAll, { count: rows.length })}
            </button>
          )}
        </>
      )}
    </section>
  );
}
