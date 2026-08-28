'use client';

import { useEffect, useRef, useState } from 'react';
import { usePebbleStore } from '@/store/usePebbleStore';
import {
  AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import type { Transaction } from '@/types';
import { buildTrendData, getAvailablePeriods } from '@/lib/stats';
import { formatCurrency } from '@/lib/format';
import { TREND_MODES } from '@/data/seed';
import { useTranslation } from '@/lib/i18n/useTranslation';

export function IncomeSpendingChart({ transactions }: { transactions: Transaction[] }) {
  const { d } = useTranslation();
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
  const availableYears = needsYear ? getAvailablePeriods(transactions, 'year') : [];

  const handleTrendModeChange = (mode: string) => {
    setTrendMode(mode);
    setTrendYear(
      mode === 'month' || mode === 'quarter'
        ? getAvailablePeriods(transactions, 'year')[0]?.key ?? null
        : null,
    );
  };

  // No latestYearOnly here: this selector picks the year itself, so trimming
  // it to one option would defeat the purpose.
  const restoreRef = useRef(false);
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    if (restoreRef.current) return;
    restoreRef.current = true;
    const saved = usePebbleStore.getState().dashboardPrefs;
    const mode = saved?.trendMode ?? 'last6';
    const years = getAvailablePeriods(transactions, 'year');
    const savedYear = saved?.trendYear ?? null;
    setTrendMode(mode);
    setTrendYear(
      mode === 'month' || mode === 'quarter'
        ? (years.some((y) => y.key === savedYear) ? savedYear : (years[0]?.key ?? null))
        : null,
    );
    setRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!restored) return;
    usePebbleStore.getState().setDashboardPrefs({ trendMode, trendYear });
  }, [restored, trendMode, trendYear]);

  const trendData = buildTrendData(transactions, trendMode, trendYear);

  return (
    <div className="card" style={{ padding: '1.5rem' }}>
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
      {trendData.length === 0 ? (
        <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-soft)', fontSize: '0.85rem' }}>
          {d.trendChart.noData}
        </div>
      ) : (
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={trendData} margin={{ top: 5, right: 5, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#1F5A45" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#1F5A45" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#AD7B2E" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#AD7B2E" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 12, fill: 'var(--ink-soft)' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 12, fill: 'var(--ink-soft)' }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v / 1000}k`} width={38} />
          <Tooltip formatter={(v) => formatCurrency(Number(v))} contentStyle={{ borderRadius: 10, fontSize: 13 }} />
          <Area type="monotone" dataKey="income" name={d.dashboard.income} stroke="#1F5A45" fill="url(#incomeGrad)" strokeWidth={2} />
          <Area type="monotone" dataKey="spending" name={d.dashboard.spending} stroke="#AD7B2E" fill="url(#spendGrad)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
      )}
      <div style={{ display: 'flex', gap: '1.25rem', marginTop: '0.4rem', fontSize: '0.78rem', color: 'var(--ink-soft)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 99, backgroundColor: '#1F5A45' }} />{d.dashboard.income}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 99, backgroundColor: '#AD7B2E' }} />{d.dashboard.spending}</span>
      </div>
    </div>
  );
}
