'use client';

import { useEffect, useRef, useState } from 'react';
import { usePebbleStore } from '@/store/usePebbleStore';
import {
  AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import type { Transaction } from '@/types';
import { buildTrendData, getAvailablePeriods } from '@/lib/stats';
import { formatCurrency } from '@/lib/format';
import { formatCompactCurrency } from '@/lib/chartFormat';
import { TREND_MODES } from '@/data/seed';
import { useTranslation } from '@/lib/i18n/useTranslation';

// Theme tokens, not hex: the grid and tick text already used var() in these
// SVG attributes, so the series follow the active theme and dark mode too.
// Income is pine and spending is wine - the app's colours for money in and
// money out, the same as the Analysis charts.
const INCOME = 'var(--pine)';
const SPENDING = 'var(--wine)';

export function IncomeSpendingChart({ transactions }: { transactions: Transaction[] }) {
  const { d, locale } = useTranslation();
  // TREND_MODES lives in @/data/seed with English labels. Looked up by VALUE
  // against the same d.statsModes dictionary the dashboard tiles use - the
  // mode keys overlap - falling back to the seed label for anything that
  // doesn't match, so an unrecognised mode degrades to English rather than
  // a blank option.
  const modeLabel = (value: string, fallback: string) =>
    (d.statsModes as Record<string, string>)[value] ?? fallback;
  const [trendMode, setTrendMode] = useState('last6');
  const [trendYear, setTrendYear] = useState<string | null>(null);

  // Same mode + sub-period shape as the stat tiles and the "Where it went"
  // donut: the second control appears only for the modes that need scoping,
  // and its options come from periods actually present in the data rather
  // than a generated range.
  const needsYear = trendMode === 'month' || trendMode === 'quarter';
  const availableYears = needsYear ? getAvailablePeriods(transactions, 'year', false, locale) : [];

  const handleTrendModeChange = (mode: string) => {
    setTrendMode(mode);
    setTrendYear(
      mode === 'month' || mode === 'quarter'
        ? getAvailablePeriods(transactions, 'year', false, locale)[0]?.key ?? null
        : null,
    );
  };

  // No latestYearOnly here: this selector picks the year itself, so trimming
  // it to one option would defeat the purpose.
  const restoreRef = useRef(false);
  const [restored, setRestored] = useState(false);
  // Recharts animates in JavaScript, so the global CSS reduced-motion block
  // cannot cover it. Read in the effect below, never during render.
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    if (restoreRef.current) return;
    restoreRef.current = true;
    const saved = usePebbleStore.getState().dashboardPrefs;
    const mode = saved?.trendMode ?? 'last6';
    const years = getAvailablePeriods(transactions, 'year', false, locale);
    const savedYear = saved?.trendYear ?? null;
    setTrendMode(mode);
    setTrendYear(
      mode === 'month' || mode === 'quarter'
        ? (years.some((y) => y.key === savedYear) ? savedYear : (years[0]?.key ?? null))
        : null,
    );
    setReduceMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    setRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!restored) return;
    usePebbleStore.getState().setDashboardPrefs({ trendMode, trendYear });
  }, [restored, trendMode, trendYear]);

  const trendData = buildTrendData(transactions, trendMode, trendYear, locale);

  return (
    <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h3 style={{ fontWeight: 600, fontSize: '0.95rem' }}>{d.trendChart.title}</h3>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          <select
            value={trendMode} onChange={(e) => handleTrendModeChange(e.target.value)}
            style={{ fontSize: '0.75rem', padding: '0.3rem 0.55rem', borderRadius: '0.5rem', border: '1px solid var(--line)', color: 'var(--ink-soft)', backgroundColor: 'var(--mist)' }}
          >
            {TREND_MODES.map((m) => <option key={m.value} value={m.value}>{modeLabel(m.value, m.label)}</option>)}
          </select>
          {needsYear && availableYears.length > 0 && (
            <select
              value={trendYear || ''} onChange={(e) => setTrendYear(e.target.value)}
              style={{ fontSize: '0.75rem', padding: '0.3rem 0.55rem', borderRadius: '0.5rem', border: '1px solid var(--line)', color: 'var(--ink-soft)', backgroundColor: 'var(--mist)' }}
            >
              {availableYears.map((y) => <option key={y.key} value={y.key}>{y.label}</option>)}
            </select>
          )}
        </div>
      </div>
      {!restored ? (
        // Waits for the saved mode to be restored, so the chart draws once.
        <div style={{ flex: 1, minHeight: 220 }} />
      ) : trendData.length === 0 ? (
        <div style={{ flex: 1, minHeight: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-soft)', fontSize: '0.85rem' }}>
          {d.trendChart.noData}
        </div>
      ) : (
      // Grows to fill the card when the neighbouring card is taller (the grid
      // stretches both), never shorter than 220px. The absolute inner box
      // gives ResponsiveContainer a definite height to measure.
      <div className="pb-chart-fade pb-chart-fill" style={{ flex: 1, minHeight: 220, position: 'relative' }}>
      <div style={{ position: 'absolute', inset: 0 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart key={`${trendMode}-${trendYear ?? ''}`} data={trendData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={INCOME} stopOpacity={0.35} />
              <stop offset="95%" stopColor={INCOME} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={SPENDING} stopOpacity={0.3} />
              <stop offset="95%" stopColor={SPENDING} stopOpacity={0} />
            </linearGradient>
          </defs>
          {/* Solid hairline, horizontal only. */}
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 12, fill: 'var(--ink-soft)' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 12, fill: 'var(--ink-soft)' }} axisLine={false} tickLine={false} tickFormatter={(v) => formatCompactCurrency(Number(v))} width={48} />
          {/* Colours, border and size come from the global
              .recharts-default-tooltip rule in globals.css. */}
          <Tooltip formatter={(v) => formatCurrency(Number(v))} cursor={{ stroke: 'var(--line)' }} />
          <Area type="monotone" dataKey="income" name={d.dashboard.income} stroke={INCOME} fill="url(#incomeGrad)" strokeWidth={2} isAnimationActive={!reduceMotion} animationDuration={700} animationEasing="ease-out" />
          <Area type="monotone" dataKey="spending" name={d.dashboard.spending} stroke={SPENDING} fill="url(#spendGrad)" strokeWidth={2} isAnimationActive={!reduceMotion} animationDuration={700} animationEasing="ease-out" />
        </AreaChart>
      </ResponsiveContainer>
      </div>
      </div>
      )}
      <div style={{ display: 'flex', gap: '1.25rem', marginTop: '0.4rem', fontSize: '0.78rem', color: 'var(--ink-soft)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 99, backgroundColor: INCOME }} />{d.dashboard.income}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 99, backgroundColor: SPENDING }} />{d.dashboard.spending}</span>
      </div>
    </div>
  );
}
