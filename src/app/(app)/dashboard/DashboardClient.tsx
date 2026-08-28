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
import { useTranslation } from '@/lib/i18n/useTranslation';
import { renderTemplate } from '@/lib/i18n/RichText';

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
  const { d, t, locale } = useTranslation();

  // STATS_MODES lives in @/data/seed and carries an English label. Looked up
  // by VALUE here, falling back to that label, so seed.ts stays untouched and
  // an unrecognised mode degrades to English rather than to a blank option.
  const modeLabel = (value: string, fallback: string) =>
    (d.statsModes as Record<string, string>)[value] ?? fallback;

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
      ? getAvailablePeriods(transactions, mode as 'month' | 'quarter' | 'year', true, locale)
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
  const statsWindow = describeWindow(statsMode, statsPeriod, locale);
  // stats.ts is shared with server code but neither describeWindow nor
  // getAvailablePeriods is ever called server-side (confirmed by checking
  // every page.tsx import), so both safely take an optional locale param.
  // ActionError's message and the budget modal's incomeMonthsLabel are a
  // GENUINELY different case - those come from Server Actions, which really
  // cannot read the client's locale - and remain a separate, real gap.
  const statsSublabel = (statsMode === '30d' || statsMode === '90d' || statsMode === 'last6' || statsMode === 'last12')
    ? modeLabel(statsMode, '')
    : availableStatsPeriods.find((p) => p.key === statsPeriod)?.label || '';

  const compactSelectStyle: React.CSSProperties = { fontSize: '0.72rem', padding: '0.28rem 0.5rem', borderRadius: '0.5rem', border: '1px solid var(--line)', color: 'var(--ink-soft)', backgroundColor: 'var(--mist)' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Both render nothing in the common case. */}
      <CatchUpNotice {...catchUp} />
      <GoalOverspendNotice totalBalance={totalBalance} allocated={allocated} />

      <section>
        <p style={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-soft)', marginBottom: '0.6rem' }}>
          {d.dashboard.balanceTitle}
          <InfoTooltip label={d.dashboard.balanceTooltipLabel}>
            {renderTemplate(d.dashboard.balanceTooltip, {
              checking: d.enums.paymentMethod.Checking,
              cash: d.enums.paymentMethod.Cash,
              emphasis: <strong>{d.dashboard.balanceEmphasis}</strong>,
            })}
          </InfoTooltip>
        </p>
        <p className="font-display hero-balance">
          {formatCurrency(totalBalance)}
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
          <select value={statsMode} onChange={(e) => handleStatsModeChange(e.target.value)} style={compactSelectStyle}>
            {/* value is the stored mode key; only the text is translated. */}
            {STATS_MODES.map((m) => <option key={m.value} value={m.value}>{modeLabel(m.value, m.label)}</option>)}
          </select>
          {needsStatsSubPeriod && availableStatsPeriods.length > 0 && (
            <select value={statsPeriod || ''} onChange={(e) => setStatsPeriod(e.target.value)} style={compactSelectStyle}>
              {availableStatsPeriods.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          )}
        </div>
        <p style={{ fontSize: '0.72rem', color: 'var(--ink-soft)', textAlign: 'right', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 2 }}>
          <span className="font-mono-tab">{statsWindow.rangeLabel}</span>
          {statsWindow.inProgress && <span>&nbsp;{d.dashboard.inProgressNote}</span>}
          <InfoTooltip label={d.dashboard.periodTooltipLabel}>
            {renderTemplate(d.dashboard.periodCover, {
              emphasis: <strong>{d.dashboard.periodCoverEmphasis}</strong>,
            })}
            {statsWindow.inProgress && (
              <>
                {' '}{renderTemplate(d.dashboard.periodInProgress, {
                  emphasis: <strong>{d.dashboard.periodInProgressEmphasis}</strong>,
                })}
              </>
            )}
            {' '}{renderTemplate(d.dashboard.periodAnalysis, {
              emphasis: <strong>{d.dashboard.periodAnalysisEmphasis}</strong>,
            })}
          </InfoTooltip>
        </p>
        <div className="stat-tabs">
          <StatTab
            icon={ArrowUpRight} label={d.dashboard.income} value={formatCurrency(periodStats.income)}
            sublabel={statsSublabel
              ? t(d.dashboard.sublabelWithNote, { period: statsSublabel, note: d.dashboard.standardIncomeOnly })
              : d.dashboard.standardIncomeOnly}
            color="var(--pine)"
            info={(
              <InfoTooltip label={d.dashboard.incomeTooltipLabel}>
                {renderTemplate(d.dashboard.incomeTooltip, {
                  emphasis: <strong>{d.dashboard.incomeEmphasis}</strong>,
                })}
              </InfoTooltip>
            )}
          />
          <StatTab
            icon={ArrowDownRight} label={d.dashboard.spending} value={formatCurrency(periodStats.spending)}
            sublabel={statsSublabel} color="var(--wine)"
            info={(
              <InfoTooltip label={d.dashboard.spendingTooltipLabel}>
                {d.dashboard.spendingTooltip}
              </InfoTooltip>
            )}
          />
          <StatTab
            icon={Percent} label={d.dashboard.savingsRate} value={`${periodStats.savingsRate.toFixed(2)}%`}
            sublabel={statsSublabel} color="var(--gold)"
            info={(
              <InfoTooltip label={d.dashboard.savingsTooltipLabel}>
                {renderTemplate(d.dashboard.savingsTooltip, {
                  emphasis: <strong>{d.dashboard.savingsEmphasis}</strong>,
                })}
              </InfoTooltip>
            )}
          />
          <StatTab
            icon={Wallet} label={d.dashboard.saved} value={formatCurrency(periodStats.saved)}
            sublabel={statsSublabel} color="var(--pine)"
            info={(
              <InfoTooltip label={d.dashboard.savedTooltipLabel}>
                {d.dashboard.savedTooltip}
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
