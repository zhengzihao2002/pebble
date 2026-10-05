'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import type { Transaction } from '@/types';
import { formatCurrency } from '@/lib/format';
import { formatCompactCurrency } from '@/lib/chartFormat';
import { buildPeriodTrend } from '@/lib/periodTrend';
import { useTranslation } from '@/lib/i18n/useTranslation';

// Theme tokens, not hex: the grid and tick text already used var() in these
// SVG attributes, so the series follow the active theme and dark mode too.
// Income is pine and spending is wine - the app's colours for money in and
// money out, the same as the Analysis charts.
const INCOME = 'var(--pine)';
const SPENDING = 'var(--wine)';

interface IncomeSpendingChartProps {
  transactions: Transaction[];
  /** The Dashboard's shared period, owned by the This period card. */
  mode: string;
  periodKey: string | null;
  /** Zone-aware today from DashboardClient; null until resolved. */
  today: Date | null;
  /** False until the saved period has been restored, so the chart draws once. */
  ready: boolean;
  /** The dates behind the chart, e.g. "Oct 1 – Oct 31". */
  timeFrame: string;
}

export function IncomeSpendingChart({ transactions, mode, periodKey, today, ready, timeFrame }: IncomeSpendingChartProps) {
  const { d, locale } = useTranslation();
  // Recharts animates in JavaScript, so the global CSS reduced-motion block
  // cannot cover it. Read in an effect, never during render.
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    setReduceMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  const trendData = useMemo(
    () => (ready && today ? buildPeriodTrend(transactions, mode, periodKey, today, locale) : []),
    [ready, today, transactions, mode, periodKey, locale],
  );

  return (
    <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: '1rem' }}>
        <h3 style={{ fontWeight: 600, fontSize: '0.95rem', margin: 0 }}>{d.trendChart.title}</h3>
        <p style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', margin: '0.2rem 0 0' }}>{timeFrame}</p>
      </div>
      {!ready || !today ? (
        // Waits for the shared period to be restored, so the chart draws once.
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
        <AreaChart key={`${mode}-${periodKey ?? ''}`} data={trendData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
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
