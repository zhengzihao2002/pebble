'use client';

import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { usePebbleStore } from '@/store/usePebbleStore';
import type { BalanceAdjustment, Goal, RecurringRule, Transaction } from '@/types';
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
import { SpendingPaceCard } from '@/components/dashboard/SpendingPaceCard';
import { GoalsGlance } from '@/components/dashboard/GoalsGlance';
import { YearOverYearCard } from '@/components/dashboard/YearOverYearCard';
import { BudgetAlertsNotice } from '@/components/dashboard/BudgetAlertsNotice';
import { LooksRecurringNotice } from '@/components/dashboard/LooksRecurringNotice';
import { RecurringRuleModal, type RecurringRulePrefill } from '@/components/modals/RecurringRuleModal';
import { CatchUpNotice } from '@/components/shared/CatchUpNotice';
import { buildBalanceHistory } from '@/lib/balanceHistory';
import { comparePeriods, describeRange, ymdOf } from '@/lib/periodCompare';
import { compareYearOverYear } from '@/lib/yearOverYear';
import type { RecurringCandidate } from '@/lib/recurring/detect';
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
  /** Already loaded for the total; the hero's 90-day balance line walks them too. */
  adjustments?: BalanceAdjustment[];
  /** Already loaded for `allocated`; the goals glance shows them. */
  goals?: Goal[];
}

export function DashboardClient({ transactions, categories, budgets, totalBalance, accounts, balancesByAccount, allocated, catchUp, rules, adjustments = [], goals = [] }: DashboardClientProps) {
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

  // THE Dashboard period: This period, Income vs spending and Where it went
  // all follow it.
  //
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

  // Under each chart's title. A rolling window also names itself; a month,
  // quarter or year is already named by its range.
  const timeFrame = needsStatsSubPeriod
    ? statsWindow.rangeLabel
    : `${statsWindow.rangeLabel} · ${modeLabel(statsMode, STATS_MODES.find((m) => m.value === statsMode)?.label ?? statsMode)}`;

  // "· includes this month so far" was said of every window; each now names
  // its own unfinished part.
  const inProgressNote = statsMode === 'month' ? d.dashboard.inProgressNote
    : statsMode === 'quarter' ? d.ux.dashboard.inProgressQuarter
    : statsMode === 'year' ? d.ux.dashboard.inProgressYear
    : d.ux.dashboard.inProgressToday;

  // Like-for-like change chips and trends for the four figures. Waits for
  // the same two things the charts wait for, so it resolves once.
  const compare = useMemo(
    () => (today && statsRestored ? comparePeriods(transactions, statsMode, statsPeriod, today) : null),
    [today, statsRestored, transactions, statsMode, statsPeriod],
  );
  const compareLabel = compare && today ? describeRange(compare.previousRange, locale, today) : '';

  // The period set against the same window a year back. Null (so no card, and
  // no grid row - see .pb-dash:has() in dashboard.css) until today resolves
  // and whenever a year back holds nothing to compare.
  const yearOverYear = useMemo(
    () => (today && statsRestored ? compareYearOverYear(transactions, statsMode, statsPeriod, today) : null),
    [today, statsRestored, transactions, statsMode, statsPeriod],
  );

  // "Looks recurring" -> Schedule it: the schedule dialog with the details filled in.
  const [schedulePrefill, setSchedulePrefill] = useState<RecurringRulePrefill | null>(null);
  const scheduleCandidate = (c: RecurringCandidate) => setSchedulePrefill({
    description: c.title,
    category: c.category,
    accountId: c.accountId,
    // The dialog works in positive magnitudes; the action re-applies the sign.
    amount: Math.abs(c.amount),
    startDate: c.nextDate,
    kind: c.kind,
    frequency: c.frequency,
    ...(c.grossAmount !== null ? { grossAmount: c.grossAmount } : null),
  });

  // The hero's 90-day line, walked back from the server's total (see
  // src/lib/balanceHistory.ts), so it always ends at the figure above it.
  const balanceTrend = useMemo(() => {
    if (!today) return null;
    const records = [...transactions, ...adjustments].map((r) => ({ date: r.date, amount: r.amount, accountId: r.accountId }));
    return buildBalanceHistory(records, accounts.map((a) => a.id), totalBalance, ymdOf(today), 90);
  }, [today, transactions, adjustments, accounts, totalBalance]);

  // [ and ] step the period, older and newer - only where the stepper shows
  // and with exactly AppShell's single-key guards: not while typing (the
  // period selects included), composing, repeating, with a modifier, or
  // while any dialog is open.
  // An effect event: reads the current period list without re-subscribing.
  const step = useEffectEvent((dir: 1 | -1) => {
    const i = availableStatsPeriods.findIndex((p) => p.key === statsPeriod);
    const next = i >= 0 ? availableStatsPeriods[i + dir] : undefined;
    if (next) setStatsPeriod(next.key);
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '[' && e.key !== ']') return;
      if (e.isComposing || e.keyCode === 229 || e.defaultPrevented || e.repeat) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector('.pebble-root [role="dialog"]')) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || target.closest('input, textarea, select, [contenteditable="true"], [role="combobox"]'))) return;
      e.preventDefault();
      // Newest first: "[" (back in time) is the next index.
      step(e.key === '[' ? 1 : -1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // LAYOUT. .pb-dash is a grid placed by container queries on the content
  // area (dashboard.css). The DOM order below IS the phone order - and the
  // reading and Tab order - so it is the priority order: notices, balance,
  // the period and its figures, spending pace, what is coming, where it
  // went, cash flow, same time last year (only with a year of history),
  // budgets, goals, recent activity. Wider screens arrange
  // the same cards into a bento grid without reordering the DOM. No width
  // cap here: the shell already caps .pebble-main.
  return (
    <>
    <div className="pb-dash">
      {/* The notices sit inside the top area, so when they render nothing
          (the common case) they leave no empty grid row and no stray gap. */}
      <section className="pb-dash-area-top">
        {/* All of these render nothing in the common case. */}
        <CatchUpNotice {...catchUp} />
        <GoalOverspendNotice totalBalance={totalBalance} allocated={allocated} />
        <BalanceHero totalBalance={totalBalance} accounts={accounts} balancesByAccount={balancesByAccount} allocated={allocated} trend={balanceTrend} />
        {/* Under the hero, not above it: on a phone up to six rows of notices would
            push the balance off the first screen. */}
        <BudgetAlertsNotice transactions={transactions} categoryMeta={categoryMeta} today={today} />
        <LooksRecurringNotice transactions={transactions} rules={rules} today={today} onSchedule={scheduleCandidate} />
        <DashboardStatsCard
          modes={STATS_MODES.map((m) => ({ value: m.value, label: modeLabel(m.value, m.label) }))}
          statsMode={statsMode}
          onModeChange={handleStatsModeChange}
          periods={needsStatsSubPeriod ? availableStatsPeriods : []}
          statsPeriod={statsPeriod}
          onPeriodChange={setStatsPeriod}
          rangeLabel={statsWindow.rangeLabel}
          inProgress={statsWindow.inProgress}
          inProgressNote={inProgressNote}
          income={periodStats.income}
          spending={periodStats.spending}
          savingsRate={periodStats.savingsRate}
          saved={periodStats.saved}
          compare={compare}
          compareLabel={compareLabel}
        />
        {/* The same income and rate as the card above - never recomputed. */}
        {showHealthBar && (
          <HealthStatusBar income={periodStats.income} savingsRate={periodStats.savingsRate} />
        )}
      </section>

      {/* Every chart card follows the This period controls above. */}
      <div className="pb-dash-area-pace">
        <SpendingPaceCard timeFrame={timeFrame} transactions={transactions} categoryMeta={categoryMeta} mode={statsMode} periodKey={statsPeriod} today={today} ready={statsRestored} inProgress={statsWindow.inProgress} />
      </div>
      <div className="pb-dash-area-upcoming">
        <UpcomingCard rules={rules} categoryMeta={categoryMeta} accounts={accounts} transactions={transactions} />
      </div>
      <div className="pb-dash-area-where">
        <CategoryDonutChart timeFrame={timeFrame} transactions={transactions} categoryMeta={categoryMeta} mode={statsMode} periodKey={statsPeriod} today={today} ready={statsRestored} />
      </div>
      <div className="pb-dash-area-flow">
        <IncomeSpendingChart timeFrame={timeFrame} transactions={transactions} mode={statsMode} periodKey={statsPeriod} today={today} ready={statsRestored} inProgress={statsWindow.inProgress} />
      </div>
      {/* Only when a year back has data: no wrapper at all otherwise, and the
          grid drops its row (dashboard.css), so there is no hole. */}
      {yearOverYear && today && (
        <div className="pb-dash-area-yoy">
          <YearOverYearCard data={yearOverYear} categoryMeta={categoryMeta} today={today} inProgress={statsWindow.inProgress} />
        </div>
      )}
      <div className="pb-dash-area-attention">
        <NeedsAttentionCard transactions={transactions} categoryMeta={categoryMeta} today={today} />
      </div>
      <div className="pb-dash-area-goals">
        <GoalsGlance goals={goals} allocated={allocated} totalBalance={totalBalance} />
      </div>
      <div className="pb-dash-area-recent">
        <RecentActivityCard transactions={transactions} categoryMeta={categoryMeta} today={today} accounts={accounts} />
      </div>
    </div>
    {/* Outside the grid: the dialog is a fixed overlay, not a grid item. */}
    {schedulePrefill && <RecurringRuleModal prefill={schedulePrefill} onClose={() => setSchedulePrefill(null)} />}
    </>
  );
}
