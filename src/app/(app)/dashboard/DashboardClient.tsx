'use client';

import { useMemo, useState } from 'react';
import { ArrowUpRight, ArrowDownRight, Percent, Wallet } from 'lucide-react';
import type { Transaction } from '@/types';
import { StatTab } from '@/components/shared/StatTab';
import { IncomeSpendingChart } from '@/components/dashboard/IncomeSpendingChart';
import { CategoryDonutChart } from '@/components/dashboard/CategoryDonutChart';
import { NeedsAttentionCard } from '@/components/dashboard/NeedsAttentionCard';
import { RecentActivityCard } from '@/components/dashboard/RecentActivityCard';
import { buildCategoryMeta } from '@/lib/data/categoryMeta';
import { formatCurrency } from '@/lib/format';
import { computeStatsForPeriod, getAvailablePeriods } from '@/lib/stats';
import { STATS_MODES } from '@/data/seed';

interface DashboardClientProps {
  transactions: Transaction[];
  budgets: Record<string, number>;
  totalBalance: number;
}

export function DashboardClient({ transactions, budgets, totalBalance }: DashboardClientProps) {
  // Icons are functions and cannot cross the server/client boundary, so the
  // icon-bearing map is reassembled here from serializable budget numbers.
  const categoryMeta = useMemo(() => buildCategoryMeta(budgets), [budgets]);

  const [statsMode, setStatsMode] = useState('30d');
  const [statsPeriod, setStatsPeriod] = useState<string | null>(null);
  const needsStatsSubPeriod = statsMode === 'month' || statsMode === 'quarter' || statsMode === 'year';
  const availableStatsPeriods = needsStatsSubPeriod
    ? getAvailablePeriods(transactions, statsMode as 'month' | 'quarter' | 'year')
    : [];

  const handleStatsModeChange = (mode: string) => {
    setStatsMode(mode);
    if (mode === 'month' || mode === 'quarter' || mode === 'year') {
      const avail = getAvailablePeriods(transactions, mode);
      setStatsPeriod(avail[0]?.key || null);
    } else {
      setStatsPeriod(null);
    }
  };

  const periodStats = computeStatsForPeriod(transactions, statsMode, statsPeriod);
  const statsSublabel = statsMode === '30d' ? 'Last 30 days'
    : statsMode === '90d' ? 'Last 90 days'
    : statsMode === 'last6' ? 'Last 6 months'
    : statsMode === 'last12' ? 'Last 12 months'
    : availableStatsPeriods.find((p) => p.key === statsPeriod)?.label || '';

  const compactSelectStyle: React.CSSProperties = { fontSize: '0.72rem', padding: '0.28rem 0.5rem', borderRadius: '0.5rem', border: '1px solid var(--line)', color: 'var(--ink-soft)', backgroundColor: 'var(--mist)' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <section>
        <p style={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-soft)', marginBottom: '0.6rem' }}>
          Your balance, today
        </p>
        <p className="font-display hero-balance">
          {formatCurrency(totalBalance)}
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
          <select value={statsMode} onChange={(e) => handleStatsModeChange(e.target.value)} style={compactSelectStyle}>
            {STATS_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          {needsStatsSubPeriod && availableStatsPeriods.length > 0 && (
            <select value={statsPeriod || ''} onChange={(e) => setStatsPeriod(e.target.value)} style={compactSelectStyle}>
              {availableStatsPeriods.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          )}
        </div>
        <div className="stat-tabs">
          <StatTab icon={ArrowUpRight} label="Income" value={formatCurrency(periodStats.income)} sublabel={statsSublabel} color="var(--pine)" />
          <StatTab icon={ArrowDownRight} label="Spending" value={formatCurrency(periodStats.spending)} sublabel={statsSublabel} color="var(--wine)" />
          <StatTab icon={Percent} label="Savings rate" value={`${periodStats.savingsRate.toFixed(2)}%`} sublabel={statsSublabel} color="var(--gold)" />
          <StatTab icon={Wallet} label="Saved" value={formatCurrency(periodStats.saved)} sublabel={statsSublabel} color="var(--pine)" />
        </div>
      </section>

      <section className="dash-charts-grid">
        <IncomeSpendingChart transactions={transactions} />
        <CategoryDonutChart transactions={transactions} categoryMeta={categoryMeta} />
      </section>

      <section className="dash-two-col">
        <NeedsAttentionCard transactions={transactions} categoryMeta={categoryMeta} />
        <RecentActivityCard transactions={transactions} categoryMeta={categoryMeta} />
      </section>
    </div>
  );
}
