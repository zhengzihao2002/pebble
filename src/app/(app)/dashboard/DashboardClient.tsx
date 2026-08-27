'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePebbleStore } from '@/store/usePebbleStore';
import { ArrowUpRight, ArrowDownRight, Percent, Wallet } from 'lucide-react';
import type { Transaction } from '@/types';
import type { CategoryItem } from '@/lib/data/mappers';
import { StatTab } from '@/components/shared/StatTab';
import { IncomeSpendingChart } from '@/components/dashboard/IncomeSpendingChart';
import { CategoryDonutChart } from '@/components/dashboard/CategoryDonutChart';
import { NeedsAttentionCard } from '@/components/dashboard/NeedsAttentionCard';
import { RecentActivityCard } from '@/components/dashboard/RecentActivityCard';
import { GoalOverspendNotice } from '@/components/dashboard/GoalOverspendNotice';
import { CatchUpNotice } from '@/components/shared/CatchUpNotice';
import { buildCategoryMeta } from '@/lib/data/categoryMeta';
import { formatCurrency } from '@/lib/format';
import { computeStatsForPeriod, describeWindow, getAvailablePeriods } from '@/lib/stats';
import { STATS_MODES } from '@/data/seed';
import { InfoTooltip } from '@/components/shared/InfoTooltip';

interface DashboardClientProps {
  transactions: Transaction[];
  categories: CategoryItem[];
  budgets: Record<string, number>;
  totalBalance: number;
  /** Sum of every goal's set-aside amount, for the overspend notice. */
  allocated: number;
  catchUp: { expensesCreated: number; incomeCreated: number; truncated: boolean; failed?: boolean };
}

export function DashboardClient({ transactions, categories, budgets, totalBalance, allocated, catchUp }: DashboardClientProps) {
  // Icons are functions and cannot cross the server/client boundary, so the
  // icon-bearing map is reassembled here from serializable budget numbers.
  const categoryMeta = useMemo(() => buildCategoryMeta(categories, budgets), [categories, budgets]);

  // Defaults to the current month rather than a rolling 30 days: a calendar
  // month is the unit a budget is actually kept in, and the rolling window
  // straddled two of them. Both are static values, so the server render and
  // the first client render agree; the stored preference is applied in a
  // mount effect below.
  const [statsMode, setStatsMode] = useState('month');
  const [statsPeriod, setStatsPeriod] = useState<string | null>(null);
  const [statsRestored, setStatsRestored] = useState(false);

  // latestYearOnly: the selector lists this year's months, not every month
  // ever recorded. Looking further back is what Reports is for.
  const periodsForStatsMode = (mode: string) =>
    (mode === 'month' || mode === 'quarter' || mode === 'year')
      ? getAvailablePeriods(transactions, mode as 'month' | 'quarter' | 'year', true)
      : [];

  const needsStatsSubPeriod = statsMode === 'month' || statsMode === 'quarter' || statsMode === 'year';
  const availableStatsPeriods = needsStatsSubPeriod ? periodsForStatsMode(statsMode) : [];

  const handleStatsModeChange = (mode: string) => {
    setStatsMode(mode);
    setStatsPeriod(periodsForStatsMode(mode)[0]?.key ?? null);
  };

  // Restore once on mount. Client-only, so reading localStorage here cannot
  // desync from the server render. A stored period that no longer appears in
  // the list - a month from a year now out of scope - falls back to the newest
  // available rather than leaving the selector pointing at nothing.
  const statsRestoreRef = useRef(false);
  useEffect(() => {
    if (statsRestoreRef.current) return;
    statsRestoreRef.current = true;
    const saved = usePebbleStore.getState().dashboardPrefs;
    const mode = saved?.statsMode ?? 'month';
    const avail = periodsForStatsMode(mode);
    const savedPeriod = saved?.statsPeriod ?? null;
    setStatsMode(mode);
    setStatsPeriod(avail.some((p) => p.key === savedPeriod) ? savedPeriod : (avail[0]?.key ?? null));
    setStatsRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Write back only after restoring, or the static seed values would overwrite
  // the stored ones before they were read.
  useEffect(() => {
    if (!statsRestored) return;
    usePebbleStore.getState().setDashboardPrefs({ statsMode, statsPeriod });
  }, [statsRestored, statsMode, statsPeriod]);

  const periodStats = computeStatsForPeriod(transactions, statsMode, statsPeriod);
  // The resolved months behind the four tiles below. Shown rather than left to
  // be inferred, matching the Analysis page, which prints its own range under
  // its period selector.
  const statsWindow = describeWindow(statsMode, statsPeriod);
  const statsSublabel = statsMode === '30d' ? 'Last 30 days'
    : statsMode === '90d' ? 'Last 90 days'
    : statsMode === 'last6' ? 'Last 6 months'
    : statsMode === 'last12' ? 'Last 12 months'
    : availableStatsPeriods.find((p) => p.key === statsPeriod)?.label || '';

  const compactSelectStyle: React.CSSProperties = { fontSize: '0.72rem', padding: '0.28rem 0.5rem', borderRadius: '0.5rem', border: '1px solid var(--line)', color: 'var(--ink-soft)', backgroundColor: 'var(--mist)' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Both render nothing in the common case. */}
      <CatchUpNotice {...catchUp} />
      <GoalOverspendNotice totalBalance={totalBalance} allocated={allocated} />

      <section>
        <p style={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-soft)', marginBottom: '0.6rem' }}>
          Your balance, today
          <InfoTooltip label="How your balance is calculated">
            Your opening balances plus every transaction since — expenses, income and any manual
            balance corrections, across both Checking and Cash. <strong>Side Cash is included
            here</strong>: it is left out of income figures, but it is still money you have. This
            is a live figure, not tied to the period selected below.
          </InfoTooltip>
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
        <p style={{ fontSize: '0.72rem', color: 'var(--ink-soft)', textAlign: 'right', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 2 }}>
          <span className="font-mono-tab">{statsWindow.rangeLabel}</span>
          {statsWindow.inProgress && <span>&nbsp;· includes this month so far</span>}
          <InfoTooltip label="What this period covers">
            The four figures below cover <strong>exactly this range</strong>.
            {statsWindow.inProgress && (
              <>
                {' '}It runs up to today, so the month in progress is included and these numbers
                change as soon as you add a transaction — the dashboard shows where you are
                <strong> right now</strong>.
              </>
            )}
            {' '}The Analysis page uses only <strong>complete</strong> months, so its figures for
            the same period will differ: an average over a half-finished month understates
            spending and makes your runway look longer than it is.
          </InfoTooltip>
        </p>
        <div className="stat-tabs">
          <StatTab
            icon={ArrowUpRight} label="Income" value={formatCurrency(periodStats.income)}
            sublabel={statsSublabel ? `${statsSublabel} · Standard income only` : 'Standard income only'}
            color="var(--pine)"
            info={(
              <InfoTooltip label="How income is calculated">
                Take-home pay received in the selected period. <strong>Side Cash is excluded</strong> —
                only Standard Income counts. This is net pay, what actually reached your account,
                never the gross figure before deductions.
              </InfoTooltip>
            )}
          />
          <StatTab
            icon={ArrowDownRight} label="Spending" value={formatCurrency(periodStats.spending)}
            sublabel={statsSublabel} color="var(--wine)"
            info={(
              <InfoTooltip label="How spending is calculated">
                Every expense dated in the selected period, including this month so far. Balance
                adjustments are excluded — they correct your balance rather than record spending.
              </InfoTooltip>
            )}
          />
          <StatTab
            icon={Percent} label="Savings rate" value={`${periodStats.savingsRate.toFixed(2)}%`}
            sublabel={statsSublabel} color="var(--gold)"
            info={(
              <InfoTooltip label="How savings rate is calculated">
                Income minus spending, as a share of income, over the selected period. Side Cash is
                excluded from income.
                {' '}<strong>This includes the month in progress</strong>, so it moves as soon as
                you add a transaction today — the dashboard shows where you are right now.
                {' '}The Analysis page shows a different figure because it uses only complete
                months: an average over a half-finished month understates spending.
              </InfoTooltip>
            )}
          />
          <StatTab
            icon={Wallet} label="Saved" value={formatCurrency(periodStats.saved)}
            sublabel={statsSublabel} color="var(--pine)"
            info={(
              <InfoTooltip label="How saved is calculated">
                Income minus spending over the selected period — the money left over, in dollars
                rather than as a percentage. Side Cash is excluded from income. A negative figure
                means you spent more than you earned in this period.
              </InfoTooltip>
            )}
          />
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
