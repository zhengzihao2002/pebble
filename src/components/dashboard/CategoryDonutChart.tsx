'use client';

import { useEffect, useRef, useState } from 'react';
import { usePebbleStore } from '@/store/usePebbleStore';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import type { CategoryMeta, Transaction } from '@/types';
import { buildCategoryBreakdown, getAvailablePeriods, lightenColor, darkenColor } from '@/lib/stats';
import { formatCurrency } from '@/lib/format';
import { TREND_MODES } from '@/data/seed';
import { useTranslation } from '@/lib/i18n/useTranslation';

interface CategoryDonutChartProps {
  transactions: Transaction[];
  categoryMeta: CategoryMeta;
}

export function CategoryDonutChart({ transactions, categoryMeta }: CategoryDonutChartProps) {
  const { d, locale } = useTranslation();
  const modeLabel = (value: string, fallback: string) =>
    (d.statsModes as Record<string, string>)[value] ?? fallback;
  const [breakdownMode, setBreakdownMode] = useState('last6');
  const [breakdownPeriod, setBreakdownPeriod] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);

  // latestYearOnly, matching the stat tiles above: this year's months, not
  // every month on record.
  const periodsForMode = (mode: string) =>
    (mode === 'month' || mode === 'quarter' || mode === 'year')
      ? getAvailablePeriods(transactions, mode as 'month' | 'quarter' | 'year', true, locale)
      : [];

  const needsSubPeriod = breakdownMode === 'month' || breakdownMode === 'quarter' || breakdownMode === 'year';
  const availablePeriods = needsSubPeriod ? periodsForMode(breakdownMode) : [];

  const handleBreakdownModeChange = (mode: string) => {
    setBreakdownMode(mode);
    setBreakdownPeriod(periodsForMode(mode)[0]?.key ?? null);
  };

  const restoreRef = useRef(false);
  useEffect(() => {
    if (restoreRef.current) return;
    restoreRef.current = true;
    const saved = usePebbleStore.getState().dashboardPrefs;
    const mode = saved?.breakdownMode ?? 'last6';
    const avail = periodsForMode(mode);
    const savedPeriod = saved?.breakdownPeriod ?? null;
    setBreakdownMode(mode);
    setBreakdownPeriod(avail.some((p) => p.key === savedPeriod) ? savedPeriod : (avail[0]?.key ?? null));
    setRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!restored) return;
    usePebbleStore.getState().setDashboardPrefs({ breakdownMode, breakdownPeriod });
  }, [restored, breakdownMode, breakdownPeriod]);

  const donutData = buildCategoryBreakdown(transactions, breakdownMode, categoryMeta, breakdownPeriod);
  const donutTotal = donutData.reduce((s, d) => s + d.value, 0);

  return (
    <div className="card" style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h3 style={{ fontWeight: 600, fontSize: '0.95rem' }}>{d.donutChart.title}</h3>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          <select
            value={breakdownMode} onChange={(e) => handleBreakdownModeChange(e.target.value)}
            style={{ fontSize: '0.75rem', padding: '0.3rem 0.55rem', borderRadius: '0.5rem', border: '1px solid var(--line)', color: 'var(--ink-soft)', backgroundColor: 'var(--mist)' }}
          >
            {TREND_MODES.map((m) => <option key={m.value} value={m.value}>{modeLabel(m.value, m.label)}</option>)}
          </select>
          {needsSubPeriod && availablePeriods.length > 0 && (
            <select
              value={breakdownPeriod || ''} onChange={(e) => setBreakdownPeriod(e.target.value)}
              style={{ fontSize: '0.75rem', padding: '0.3rem 0.55rem', borderRadius: '0.5rem', border: '1px solid var(--line)', color: 'var(--ink-soft)', backgroundColor: 'var(--mist)' }}
            >
              {availablePeriods.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          )}
        </div>
      </div>

      {donutData.length === 0 ? (
        <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-soft)', fontSize: '0.85rem' }}>
          {d.donutChart.noData}
        </div>
      ) : (
        <>
          <div style={{ position: 'relative', filter: 'drop-shadow(0 12px 18px rgba(23,36,32,0.16))' }}>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <defs>
                  {donutData.map((entry, i) => (
                    <radialGradient key={i} id={`pieGrad${i}`} cx="35%" cy="32%" r="70%">
                      <stop offset="0%" stopColor={lightenColor(entry.color, 0.45)} />
                      <stop offset="65%" stopColor={entry.color} />
                      <stop offset="100%" stopColor={darkenColor(entry.color, 0.18)} />
                    </radialGradient>
                  ))}
                </defs>
                <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={68} outerRadius={110} paddingAngle={2} strokeWidth={0}>
                  {donutData.map((entry, i) => <Cell key={i} fill={`url(#pieGrad${i})`} />)}
                </Pie>
                <Tooltip formatter={(v) => formatCurrency(Number(v))} contentStyle={{ borderRadius: 10, fontSize: 13 }} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}>
              <p style={{ fontSize: '0.68rem', color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{d.donutChart.total}</p>
              <p className="font-mono-tab" style={{ fontSize: '1.15rem', fontWeight: 600 }}>{formatCurrency(donutTotal)}</p>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.5rem 1rem', marginTop: '1.1rem', fontSize: '0.78rem' }}>
            {donutData.map((d) => (
              <div key={d.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--ink-soft)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span style={{ width: 7, height: 7, borderRadius: 99, backgroundColor: d.color, flexShrink: 0 }} />
                  {d.name}
                </span>
                <span className="font-mono-tab" style={{ fontWeight: 500, flexShrink: 0 }}>{formatCurrency(d.value)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
