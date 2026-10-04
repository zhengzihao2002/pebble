'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePebbleStore } from '@/store/usePebbleStore';
import type { RecurringRule, Transaction } from '@/types';
import type { Account, CategoryItem } from '@/lib/data/mappers';
import { IncomeSpendingChart } from '@/components/dashboard/IncomeSpendingChart';
import { CategoryDonutChart } from '@/components/dashboard/CategoryDonutChart';
import { NeedsAttentionCard } from '@/components/dashboard/NeedsAttentionCard';
import { RecentActivityCard } from '@/components/dashboard/RecentActivityCard';
import { GoalOverspendNotice } from '@/components/dashboard/GoalOverspendNotice';
import { HealthStatusBar } from '@/components/dashboard/HealthStatusBar';
import { BalanceHero } from '@/components/dashboard/BalanceHero';
import { DashboardStatsCard } from '@/components/dashboard/DashboardStatsCard';
import { UpcomingCard } from '@/components/dashboard/UpcomingCard';
import { CatchUpNotice } from '@/components/shared/CatchUpNotice';
import { buildCategoryMeta } from '@/lib/data/categoryMeta';
import { parseLocalDate } from '@/lib/format';
import { computeStatsForPeriod, describeWindow, getAvailablePeriods } from '@/lib/stats';
import { STATS_MODES } from '@/data/seed';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { useTimeZoneOverride } from '@/lib/time/TimeZoneOverrideContext';
import { resolveBrowserTimeZone } from '@/lib/time/timeZone';
import { todayInZone } from '@/lib/recurring/occurrences';

interface DashboardClientProps {
  transactions: Transaction[];
  categories: CategoryItem[];
  budgets: Record<string, number>;
  totalBalance: number;
  /** Already loaded on the server for the total; passed for the hero's account list. */
  accounts: Account[];
  balancesByAccount: Record<string, number>;
  /** Sum of every goal's set-aside amount, for the overspend notice. */
  allocated: number;
  catchUp: { expensesCreated: number; incomeCreated: number; truncated: boolean; failed?: boolean };
  /** Recurring rules, for the Upcoming card. */
  rules: RecurringRule[];
}

export function DashboardClient({ transactions, categories, budgets, totalBalance, accounts, balancesByAccount, allocated, catchUp, rules }: DashboardClientProps) {
  const { d, locale } = useTranslation();
  // Strict true: a non-boolean stored by any other build means off.
  const showHealthBar = usePebbleStore((s) => s.showHealthBar) === true;

  // STATS_MODES lives in @/data/seed and carries an English label. Looked up
  // by VALUE here, falling back to that label, so seed.ts stays untouched and
  // an unrecognised mode degrades to English rather than to a blank option.
  const modeLabel = (value: string, fallback: string) =>
    (d.statsModes as Record<string, string>)[value] ?? fallback;

  // Icons are functions and cannot cross the server/client boundary, so the
  // icon-bearing map is reassembled here from serializable budget numbers.
  const categoryMeta = useMemo(() => buildCategoryMeta(categories, budgets), [categories, budgets]);

  // Resolved once client-side, zone-aware - mirrors the identical pattern in
  // Reports' ReportsClient.tsx. NOT getToday() directly: that reflects the
  // CONTAINER's zone (UTC on Vercel) and, more importantly, has no way to
  // honour a user's explicit Settings > Time Zone override - someone
  // travelling with an override set would otherwise see Dashboard's "current
  // period"/"last N months" windows resolve a different "today" than every
  // other zone-aware surface in the app. Static null initial value keeps the
  // server render and first client render identical; while it is null, every
  // call below passes `undefined` through to stats.ts, which falls back to
  // its own getToday() default - i.e. exactly this page's PRE-EXISTING
  // behaviour for that one frame, upgrading to zone-aware once resolved.
  const timeZoneOverride = useTimeZoneOverride();
  const [today, setToday] = useState<Date | null>(null);
  useEffect(() => {
    const zone = timeZoneOverride ?? resolveBrowserTimeZone();
    setToday(parseLocalDate(todayInZone(zone)));
  }, [timeZoneOverride]);

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

  // today ?? undefined: see the effect above for what null means here. Both
  // calls MUST receive the identical `today` value (see the comment on
  // describeWindow in stats.ts) - reading the same `today` state for both
  // guarantees that.
  const periodStats = computeStatsForPeriod(transactions, statsMode, statsPeriod, today ?? undefined);
  // The resolved months behind the four figures. Shown rather than left to be
  // inferred, matching the Analysis page, which prints its own range under
  // its period selector.
  const statsWindow = describeWindow(statsMode, statsPeriod, locale, today ?? undefined);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Both render nothing in the common case. */}
      <CatchUpNotice {...catchUp} />
      <GoalOverspendNotice totalBalance={totalBalance} allocated={allocated} />

      <section>
        <BalanceHero totalBalance={totalBalance} accounts={accounts} balancesByAccount={balancesByAccount} />
        <DashboardStatsCard
          modes={STATS_MODES.map((m) => ({ value: m.value, label: modeLabel(m.value, m.label) }))}
          statsMode={statsMode}
          onModeChange={handleStatsModeChange}
          periods={needsStatsSubPeriod ? availableStatsPeriods : []}
          statsPeriod={statsPeriod}
          onPeriodChange={setStatsPeriod}
          rangeLabel={statsWindow.rangeLabel}
          inProgress={statsWindow.inProgress}
          income={periodStats.income}
          spending={periodStats.spending}
          savingsRate={periodStats.savingsRate}
          saved={periodStats.saved}
        />
        {/* The same income and rate as the card above - never recomputed. */}
        {showHealthBar && (
          <HealthStatusBar income={periodStats.income} savingsRate={periodStats.savingsRate} />
        )}
      </section>

      <UpcomingCard rules={rules} categoryMeta={categoryMeta} />

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
