'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { BalanceAdjustment, ExpenseTransaction, IncomeTransaction } from '@/types';
import type { Account } from '@/lib/data/mappers';
import { computeRecentTransactions } from '@/lib/stats';
import { formatCurrency, formatDate } from '@/lib/format';
import { formatCompactCurrency } from '@/lib/chartFormat';
import { todayInZone } from '@/lib/recurring/occurrences';
import { resolveBrowserTimeZone } from '@/lib/time/timeZone';
import { useTimeZoneOverride } from '@/lib/time/TimeZoneOverrideContext';
import { useTranslation } from '@/lib/i18n/useTranslation';

type Range = '3m' | '6m' | '1y';
const MONTHS: Record<Range, number> = { '3m': 3, '6m': 6, '1y': 12 };
const pad = (n: number) => String(n).padStart(2, '0');
const ymdOf = (dt: Date) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;

export interface DayPoint {
  date: string;
  total: number;
  /** Every account's balance at the end of this day, keyed by id. */
  byAccount: Record<string, number>;
}

interface AccountsClientProps {
  expenses: ExpenseTransaction[];
  income: IncomeTransaction[];
  adjustments: BalanceAdjustment[];
  accounts: Account[];
}

type TipItem = { payload?: { date?: string; total?: number } };

export function AccountsClient({ expenses, income, adjustments, accounts }: AccountsClientProps) {
  const { d, t, locale } = useTranslation();
  const [range, setRange] = useState<Range>('6m');

  // Zone-aware 'YYYY-MM-DD', resolved in the browser like the other pages.
  const timeZoneOverride = useTimeZoneOverride();
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => {
    setToday(todayInZone(timeZoneOverride ?? resolveBrowserTimeZone()));
  }, [timeZoneOverride]);

  // The Transactions page's own ledger walk, oldest first, with each record's date.
  const chrono = useMemo(() => {
    const dateById = new Map<string, string>();
    for (const r of [...expenses, ...income, ...adjustments]) dateById.set(r.id, r.date);
    return [...computeRecentTransactions(expenses, income, accounts, adjustments)]
      .reverse()
      .map((e) => ({ date: dateById.get(e.transId) ?? '', total: e.totalBalanceAfter, byAccount: e.balancesAfter }));
  }, [expenses, income, adjustments, accounts]);

  // One point per day: the balance at the end of that day, carried forward on
  // days with no records. The first point is the true balance on the first day.
  const days: DayPoint[] | null = useMemo(() => {
    if (!today) return null;
    const ty = Number(today.slice(0, 4));
    const tm = Number(today.slice(5, 7)) - 1;
    const td = Number(today.slice(8, 10));
    const out: DayPoint[] = [];
    let i = 0;
    let cur: { total: number; byAccount: Record<string, number> } = { total: 0, byAccount: {} };
    for (let dt = new Date(ty, tm - MONTHS[range], td); ymdOf(dt) <= today; dt = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + 1)) {
      const k = ymdOf(dt);
      while (i < chrono.length && chrono[i].date <= k) { cur = chrono[i]; i++; }
      out.push({ date: k, total: Math.round(cur.total * 100) / 100, byAccount: cur.byAccount });
    }
    return out;
  }, [chrono, today, range]);

  const tag = locale === 'zh' ? 'zh-CN' : 'en-US';
  const period = range === '3m' ? d.accountsPage.period3m : range === '6m' ? d.accountsPage.period6m : d.accountsPage.period1y;

  let summary: { text: string; color: string } | null = null;
  let current: number | null = null;
  if (days && days.length > 0) {
    const first = days[0].total;
    const last = days[days.length - 1].total;
    current = last;
    const change = Math.round((last - first) * 100) / 100;
    const pct = first !== 0 ? `${change >= 0 ? '+' : '−'}${Math.abs((change / Math.abs(first)) * 100).toFixed(1)}%` : null;
    if (change === 0) summary = { text: t(d.accountsPage.flat, { period }), color: 'var(--ink-soft)' };
    else if (change > 0) summary = { text: pct ? t(d.accountsPage.up, { amount: formatCurrency(change), pct, period }) : t(d.accountsPage.upNoPct, { amount: formatCurrency(change), period }), color: 'var(--pine)' };
    else summary = { text: pct ? t(d.accountsPage.down, { amount: formatCurrency(Math.abs(change)), pct, period }) : t(d.accountsPage.downNoPct, { amount: formatCurrency(Math.abs(change)), period }), color: 'var(--wine)' };
  }

  const DayTip = ({ active, payload }: { active?: boolean; payload?: ReadonlyArray<TipItem> }) => {
    const p = payload?.[0]?.payload;
    if (!active || !p?.date) return null;
    return (
      <div style={{ backgroundColor: 'var(--mist)', border: '1px solid var(--line)', borderRadius: '0.6rem', padding: '0.45rem 0.7rem', fontSize: '0.78rem', boxShadow: 'var(--shadow)' }}>
        <div style={{ color: 'var(--ink-soft)' }}>{formatDate(p.date, locale)}</div>
        <div className="font-mono-tab" style={{ fontWeight: 600 }}>{formatCurrency(p.total ?? 0)}</div>
      </div>
    );
  };

  const tab = (value: Range, label: string) => {
    const on = range === value;
    return (
      <button
        key={value} type="button" aria-pressed={on} onClick={() => setRange(value)}
        style={{
          padding: '0.3rem 0.75rem', borderRadius: 999, fontSize: '0.78rem', fontWeight: on ? 600 : 500, cursor: 'pointer',
          border: `1px solid ${on ? 'var(--pine)' : 'var(--line)'}`, backgroundColor: on ? 'var(--pine-soft)' : 'transparent',
          color: on ? 'var(--pine)' : 'var(--ink-soft)',
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <section className="card" style={{ padding: '1.5rem' }} aria-labelledby="pb-accounts-total">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <p id="pb-accounts-total" style={{ margin: 0, fontSize: '0.8rem', color: 'var(--ink-soft)' }}>{d.accountsPage.totalLabel}</p>
            <p className="font-display pb-money" style={{ margin: '0.15rem 0 0', fontSize: '2rem', fontWeight: 600 }}>
              {current !== null ? formatCurrency(current) : '—'}
            </p>
            {summary && <p className="pb-money" style={{ margin: '0.25rem 0 0', fontSize: '0.86rem', fontWeight: 600, color: summary.color }}>{summary.text}</p>}
          </div>
          <div role="group" aria-label={d.accountsPage.rangeLabel} style={{ display: 'flex', gap: '0.35rem' }}>
            {tab('3m', d.accountsPage.range3m)}
            {tab('6m', d.accountsPage.range6m)}
            {tab('1y', d.accountsPage.range1y)}
          </div>
        </div>

        {!days ? (
          <div style={{ minHeight: 260 }} />
        ) : chrono.length === 0 ? (
          <p style={{ margin: '1.5rem 0 0', fontSize: '0.86rem', color: 'var(--ink-soft)' }}>{d.accountsPage.noData}</p>
        ) : (
          <div className="pb-chart-fade pb-chart-fill" style={{ height: 260, marginTop: '1.25rem' }} role="img" aria-label={t(d.accountsPage.chartLabel, { period })}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart key={range} data={days} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="balanceGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--pine)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--pine)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis
                  dataKey="date" tick={{ fontSize: 12, fill: 'var(--ink-soft)' }} axisLine={false} tickLine={false} minTickGap={36}
                  tickFormatter={(v: string) => new Date(Number(v.slice(0, 4)), Number(v.slice(5, 7)) - 1, Number(v.slice(8, 10))).toLocaleDateString(tag, { month: 'short', day: 'numeric' })}
                />
                <YAxis tick={{ fontSize: 12, fill: 'var(--ink-soft)' }} axisLine={false} tickLine={false} width={56} domain={['auto', 'auto']} tickFormatter={(v) => formatCompactCurrency(Number(v))} />
                <Tooltip content={<DayTip />} cursor={{ stroke: 'var(--line)' }} />
                <Area type="linear" dataKey="total" stroke="var(--pine)" strokeWidth={2} fill="url(#balanceGrad)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        <div style={{ marginTop: '1rem', textAlign: 'right' }}>
          <Link href="/settings" prefetch={false} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: '0.8rem', fontWeight: 600, color: 'var(--pine)', textDecoration: 'none' }}>
            {d.accountsPage.manage}<ChevronRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </section>
    </div>
  );
}
