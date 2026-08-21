'use client';

import { useState } from 'react';
import {
  AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import type { Transaction } from '@/types';
import { buildTrendData } from '@/lib/stats';
import { formatCurrency } from '@/lib/format';
import { TREND_MODES } from '@/data/seed';

export function IncomeSpendingChart({ transactions }: { transactions: Transaction[] }) {
  const [trendMode, setTrendMode] = useState('last6');
  const trendData = buildTrendData(transactions, trendMode);

  return (
    <div className="card" style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h3 style={{ fontWeight: 600, fontSize: '0.95rem' }}>Income vs. spending</h3>
        <select
          value={trendMode} onChange={(e) => setTrendMode(e.target.value)}
          style={{ fontSize: '0.75rem', padding: '0.3rem 0.55rem', borderRadius: '0.5rem', border: '1px solid var(--line)', color: 'var(--ink-soft)', backgroundColor: 'var(--mist)' }}
        >
          {TREND_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </div>
      {trendData.length === 0 ? (
        <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-soft)', fontSize: '0.85rem' }}>
          No data for this period
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
          <Tooltip formatter={(v) => formatCurrency(Number(v))} contentStyle={{ borderRadius: 10, border: '1px solid #E1E4DD', fontSize: 13 }} />
          <Area type="monotone" dataKey="income" stroke="#1F5A45" fill="url(#incomeGrad)" strokeWidth={2} />
          <Area type="monotone" dataKey="spending" stroke="#AD7B2E" fill="url(#spendGrad)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
      )}
      <div style={{ display: 'flex', gap: '1.25rem', marginTop: '0.4rem', fontSize: '0.78rem', color: 'var(--ink-soft)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 99, backgroundColor: '#1F5A45' }} />Income</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 99, backgroundColor: '#AD7B2E' }} />Spending</span>
      </div>
    </div>
  );
}
