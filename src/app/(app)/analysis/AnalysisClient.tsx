'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, CalendarClock, Hourglass, Receipt, Telescope, TrendingUp, Wallet, Gauge, BarChart3, ListOrdered, Plus } from 'lucide-react';
import { usePebbleStore } from '@/store/usePebbleStore';
import { buildCategoryMeta } from '@/lib/data/categoryMeta';
import type { CategoryItem } from '@/lib/data/mappers';
import { formatCurrency, formatLongDate } from '@/lib/format';
import { computeCategorySpent } from '@/lib/stats';
import { isYmd, todayInZone } from '@/lib/recurring/occurrences';
import { useTimeZoneOverride } from '@/lib/time/TimeZoneOverrideContext';
import {
  DEFAULT_ANALYSIS_WINDOW,
  earliestDate,
  isAnalysisWindowKey,
  resolveAnalysisWindow,
  type AnalysisWindowKey,
} from '@/lib/analysis/windows';
import { computeMonthlySpend, computeSpendingSummary } from '@/lib/analysis/spending';
import { computeCashflow, computeCommitments } from '@/lib/analysis/cashflow';
import { computeIncomeSummary } from '@/lib/analysis/income';
import { estimateAnnualIncomeInWindow } from '@/lib/analysis/annualIncome';
import { computeCurrentMonth, computeCurrentMonthDaily } from '@/lib/analysis/currentMonth';
import { computeBudgetVariance, computeProjection, computeYearOverYear, yearProgress } from '@/lib/analysis/projection';
import { computeUpcoming } from '@/lib/analysis/upcoming';
import { requestShell } from '@/components/layout/shellEvents';
import { SectionHeader } from '@/components/kit/SectionHeader';
import { SegmentedControl } from '@/components/kit/SegmentedControl';
import { EmptyState } from '@/components/kit/EmptyState';
import { MonthlySpendChart } from '@/components/analysis/MonthlySpendChart';
import { CashflowChart, type CashflowView } from '@/components/analysis/CashflowChart';
import { DeductionChart, type DeductionView } from '@/components/analysis/DeductionChart';
import { YearOverYearChart } from '@/components/analysis/YearOverYearChart';
import { PeriodBar, type RailItem } from '@/components/analysis/PeriodBar';
import { AnalysisHero } from '@/components/analysis/AnalysisHero';
import { CurrentMonthCard } from '@/components/analysis/CurrentMonthCard';
import { AnalysisSkeleton } from '@/components/analysis/AnalysisSkeleton';
import { TopCategories } from '@/components/analysis/TopCategories';
import { PaycheckSplit, StabilityMeter } from '@/components/analysis/IncomeVisuals';
import { CommitmentsCard, CushionCard } from '@/components/analysis/CushionCard';
import { SeasonalityHeatmap } from '@/components/analysis/SeasonalityHeatmap';
import { ProjectionPath } from '@/components/analysis/ProjectionPath';
import { BudgetPaceList } from '@/components/analysis/BudgetPaceList';
import { UpcomingTimeline } from '@/components/analysis/UpcomingTimeline';
import { useStoredChoice } from '@/components/analysis/useStoredChoice';
import { CardHead, PeriodChip, ScopeBadge, Tile, countNote, monthsLabel, pct } from '@/components/analysis/parts';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { renderTemplate } from '@/lib/i18n/RichText';
import type { RecurringRule, Transaction } from '@/types';

interface AnalysisClientProps {
  transactions: Transaction[];
  categories: CategoryItem[];
  budgets: Record<string, number>;
  /** Unfiltered: getRecurringRules() excludes 'deleted' only, so active + paused. */
  rules: RecurringRule[];
  /** Derived server-side by computeCurrentBalances(), identical call to the dashboard's. */
  totalBalance: number;
}

const CASHFLOW_VIEWS = ['net', 'inout'] as const;
const DEDUCTION_VIEWS = ['rate', 'paycheck'] as const;

/**
 * Analysis as a cockpit: one sticky period bar (the period, its range and a
 * rail of the sections), then the period at a glance, the month in progress,
 * and Income, Spending, Cash flow and Outlook - each a grid of cards that sits
 * side by side on a wide screen and in this same order, one column, on a
 * phone.
 *
 * Every metric, note and explanation the page had is still here (21 metrics,
 * 22 explanations); where one moved, a comment at its new home says so.
 * Cards that follow the period wear its chip; the rest say what they cover
 * instead (All history, This calendar year, Next 3 months, Standing figure).
 *
 * NOTE: no current-month prop on any card. The window holds only complete
 * months, so every period metric covers exactly the same span - stated once,
 * in the period bar, instead of twenty-one times in twenty-one tooltips.
 */
export function AnalysisClient({ transactions, categories, budgets, rules, totalBalance }: AnalysisClientProps) {
  const { d, t, locale } = useTranslation();
  const x = d.ux.analysis;
  const timeZoneOverride = useTimeZoneOverride();
  const categoryMeta = useMemo(() => buildCategoryMeta(categories, budgets), [categories, budgets]);

  // Static and date-free, so the server render and the first client render are
  // byte-identical. Real values depend on today's date and on localStorage,
  // neither of which exists on the server.
  const [today, setToday] = useState<string | null>(null);
  const [windowKey, setWindowKey] = useState<AnalysisWindowKey>(DEFAULT_ANALYSIS_WINDOW);
  const [restored, setRestored] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [cashflowView, setCashflowView] = useStoredChoice<CashflowView>('pebble-analysis-cashflow-view', CASHFLOW_VIEWS, 'net');
  const [deductionView, setDeductionView] = useStoredChoice<DeductionView>('pebble-analysis-deduction-view', DEDUCTION_VIEWS, 'rate');

  useEffect(() => {
    // Resolved in the BROWSER, from the browser's own IANA zone. getToday() is
    // avoided outright: it reads container-local time, which is UTC on Vercel,
    // so a New Jersey evening is already tomorrow. An unrecognized zone makes
    // Intl THROW, hence the try; `today` then stays null and date-dependent
    // metrics skip. We never fall back to UTC.
    try {
      const zone = timeZoneOverride ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (zone) {
        const ymd = todayInZone(zone);
        if (isYmd(ymd)) setToday(ymd);
      }
    } catch {
      /* zone unavailable - date-dependent metrics skip */
    }

    const saved = usePebbleStore.getState().analysisPrefs;
    if (saved && isAnalysisWindowKey(saved.window)) setWindowKey(saved.window);

    // Set LAST: the persist effect is gated on it, so flipping it early would
    // write the static default over the stored preference on first paint.
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    usePebbleStore.getState().setAnalysisPrefs({ window: windowKey });
  }, [restored, windowKey]);

  const earliest = useMemo(() => earliestDate(transactions), [transactions]);

  // locale threaded through: rangeLabel and currentMonthLabel are genuinely
  // localized in windows.ts, not just passed through English.
  // Named analysisWindow, not `window`: that name shadowed the browser global
  // for everything below it.
  const analysisWindow = useMemo(
    () => (today ? resolveAnalysisWindow(windowKey, today, earliest, locale) : null),
    [windowKey, today, earliest, locale],
  );

  // --- the month in progress, deliberately outside every window ---
  const current = useMemo(
    () => (today && analysisWindow
      ? computeCurrentMonth(transactions, today, analysisWindow.currentMonthStartYmd, analysisWindow.currentMonthLabel)
      : null),
    [transactions, today, analysisWindow],
  );
  const currentDaily = useMemo(
    () => (today && analysisWindow ? computeCurrentMonthDaily(transactions, today, analysisWindow.currentMonthStartYmd) : []),
    [transactions, today, analysisWindow],
  );

  // --- window-driven: all of these cover exactly the same complete months ---
  const spending = useMemo(
    () => (analysisWindow ? computeSpendingSummary(transactions, analysisWindow) : null),
    [transactions, analysisWindow],
  );
  const monthly = useMemo(
    () => (analysisWindow ? computeMonthlySpend(transactions, analysisWindow, locale) : []),
    [transactions, analysisWindow, locale],
  );
  const incomeSummary = useMemo(
    () => (analysisWindow ? computeIncomeSummary(transactions, analysisWindow, locale) : null),
    [transactions, analysisWindow, locale],
  );
  const annualIncome = useMemo(
    () => (analysisWindow ? estimateAnnualIncomeInWindow(transactions, analysisWindow) : null),
    [transactions, analysisWindow],
  );
  const cashflow = useMemo(
    () => (analysisWindow ? computeCashflow(transactions, analysisWindow, totalBalance, locale) : null),
    [transactions, analysisWindow, totalBalance, locale],
  );

  // --- fixed-scope: deliberately NOT driven by the period selector ---
  const commitments = useMemo(() => computeCommitments(rules), [rules]);
  const yoy = useMemo(
    () => (today ? computeYearOverYear(transactions, today) : []),
    [transactions, today],
  );
  // Every complete month on record, for the seasonality grid: the same
  // cash-flow figures, over the 'all' window instead of the period.
  const allMonths = useMemo(
    () => (today && earliest ? computeCashflow(transactions, resolveAnalysisWindow('all', today, earliest, locale), totalBalance, locale).months : []),
    [transactions, today, earliest, totalBalance, locale],
  );
  const projection = useMemo(
    () => (today && cashflow ? computeProjection(transactions, today, totalBalance, cashflow.avgMonthlyNet) : null),
    [transactions, today, totalBalance, cashflow],
  );
  const variance = useMemo(() => {
    if (!today) return [];
    return computeBudgetVariance(computeCategorySpent(transactions, Number(today.slice(0, 4))), budgets);
  }, [transactions, today, budgets]);
  const upcoming = useMemo(
    () => (today ? computeUpcoming(rules, today, 3, locale) : null),
    [rules, today, locale],
  );
  const pace = today ? yearProgress(today) : null;

  const topN = Math.min(3, spending?.categories.length ?? 0);
  const hasComplete = analysisWindow?.hasCompleteMonth === true;
  const noCompleteMonth = analysisWindow !== null && !analysisWindow.hasCompleteMonth;
  const range = analysisWindow?.rangeLabel ?? '';

  // The rail lists the sections actually on the page, in page order.
  const rail: RailItem[] = useMemo(() => {
    if (!analysisWindow) return [];
    const items: RailItem[] = [{ id: 'pb-ana-overview', label: x.overview }];
    if (hasComplete) {
      items.push(
        { id: 'pb-ana-income', label: d.analysis.income.title },
        { id: 'pb-ana-spending', label: d.analysis.spending.title },
        { id: 'pb-ana-cashflow', label: d.analysis.cashflow.title },
      );
    }
    if (today) items.push({ id: 'pb-ana-outlook', label: x.outlook });
    return items;
  }, [analysisWindow, hasComplete, today, d, x]);

  // Scroll-spy: the section crossing the upper part of the screen lights its
  // rail chip. globalThis rather than window, in keeping with the rename above.
  useEffect(() => {
    if (rail.length === 0 || typeof IntersectionObserver === 'undefined') return;
    const els = rail.map((r) => document.getElementById(r.id)).filter((e): e is HTMLElement => e !== null);
    const seen = new Map<string, boolean>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) seen.set(e.target.id, e.isIntersecting);
      const first = rail.find((r) => seen.get(r.id));
      if (first) setActive(first.id);
    }, { rootMargin: '-30% 0px -60% 0px' });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [rail]);

  const jump = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const reduce = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    setActive(id);
  };

  const addTransaction = (
    <button type="button" className="btn-primary pb-ana-action" onClick={() => requestShell('addTransaction')}>
      <Plus size={15} aria-hidden="true" />{x.addTransaction}
    </button>
  );

  const pairSpan = (both: boolean, wide: 'a' | 'b') => (both ? (wide === 'a' ? 'pb-ana-span-7' : 'pb-ana-span-5') : 'pb-ana-span-12');

  return (
    <div className="pb-ana">
      <PeriodBar
        windowKey={windowKey} onChange={setWindowKey} analysisWindow={analysisWindow}
        rail={rail} active={active} onJump={jump}
      />

      {/* Until the zone-aware date is known: the page's shape, not a blank.
          After that a missing date (Intl failed) shows only the bar, as before. */}
      {!restored && <AnalysisSkeleton />}

      {analysisWindow && (
        <section id="pb-ana-overview" className="pb-ana-section" aria-label={x.overview}>
          <div className="pb-ana-grid">
            {hasComplete && cashflow && (
              <div className="pb-ana-span-hero"><AnalysisHero cashflow={cashflow} range={range} /></div>
            )}
            {current && (
              // With no complete month the card stands alone, full width,
              // ABOVE the notice - whose text refers to "the card above".
              <div className={noCompleteMonth ? 'pb-ana-span-12' : 'pb-ana-span-now'}>
                <CurrentMonthCard current={current} daily={currentDaily} typical={hasComplete ? spending?.monthlyAverage ?? null : null} />
              </div>
            )}
            {noCompleteMonth && (
              <div className="card pb-ana-card pb-ana-span-12">
                <EmptyState compact icon={Hourglass} title={x.noCompleteTitle} body={d.analysis.noCompleteMonth} />
              </div>
            )}
          </div>
        </section>
      )}

      {/* ---------------- Income ---------------- */}
      {incomeSummary && hasComplete && (
        <section id="pb-ana-income" className="pb-ana-section" aria-labelledby="pb-ana-income-title">
          <SectionHeader as="h2" id="pb-ana-income-title" icon={Wallet} title={d.analysis.income.title} actions={<PeriodChip range={range} />} />
          {incomeSummary.monthsWithIncome === 0 ? (
            <div className="card pb-ana-card">
              <EmptyState compact icon={Wallet} title={x.incomeEmptyTitle} body={d.analysis.income.empty} action={addTransaction} />
            </div>
          ) : (
            <div className="pb-ana-grid">
              <div className="stat-tabs pb-ana-tiles is-quad pb-ana-span-5">
                <Tile
                  label={d.analysis.income.annualLabel}
                  tooltipLabel={d.analysis.income.annualTooltipLabel}
                  value={annualIncome?.annual == null ? '—' : formatCurrency(annualIncome.annual)}
                  note={d.analysis.income.annualNote}
                >
                  {renderTemplate(d.analysis.income.annualTooltip, {
                    emphasis: <strong>{d.analysis.income.annualEmphasis}</strong>,
                  })}
                </Tile>

                <Tile
                  label={d.analysis.income.avgLabel}
                  tooltipLabel={d.analysis.income.avgTooltipLabel}
                  value={incomeSummary.avgMonthlyNet === null ? '—' : formatCurrency(incomeSummary.avgMonthlyNet)}
                  note={<span className="pb-tnum">{t(incomeSummary.recordedMonths === 1 ? d.budgetModal.recordedMonthsOne : d.budgetModal.recordedMonthsOther, { count: incomeSummary.recordedMonths })}</span>}
                >
                  {d.analysis.income.avgTooltip}
                </Tile>

                {/* A rate, not money: readable in privacy mode. */}
                <Tile
                  money={false}
                  label={d.analysis.income.deductionLabel}
                  tooltipLabel={d.analysis.income.deductionTooltipLabel}
                  value={incomeSummary.deductionRate === null ? '—' : `${incomeSummary.deductionRate.toFixed(2)}%`}
                  note={d.analysis.income.deductionNote}
                  extra={incomeSummary.deductionRate !== null ? <PaycheckSplit rate={incomeSummary.deductionRate} /> : undefined}
                >
                  {renderTemplate(d.analysis.income.deductionTooltip, {
                    emphasis: <strong>{d.analysis.income.deductionEmphasis}</strong>,
                  })}
                </Tile>

                {/* A band word, not money: it no longer blurs in privacy mode. */}
                <Tile
                  money={false}
                  label={d.analysis.income.stabilityLabel}
                  tooltipLabel={d.analysis.income.stabilityTooltipLabel}
                  value={incomeSummary.stability ? d.analysis.stability[incomeSummary.stability] : '—'}
                  note={incomeSummary.cv === null ? d.analysis.income.stabilityNeedsTwo : t(d.analysis.income.stabilityVariation, { pct: (incomeSummary.cv * 100).toFixed(0) })}
                  extra={incomeSummary.cv !== null ? <StabilityMeter cv={incomeSummary.cv} band={incomeSummary.stability} /> : undefined}
                >
                  {d.analysis.income.stabilityTooltip}
                </Tile>
              </div>

              <section className="card pb-ana-card pb-ana-span-7" aria-labelledby="pb-ana-ded-title">
                <CardHead
                  id="pb-ana-ded-title"
                  icon={<Receipt size={15} />}
                  title={d.analysis.income.deductionsChartTitle}
                  tooltipLabel={d.analysis.income.deductionsChartTooltipLabel}
                  tooltip={<>{d.analysis.income.deductionsChartTooltip} {x.paycheckTooltip}</>}
                  actions={(
                    <SegmentedControl<DeductionView>
                      size="sm" ariaLabel={x.chartView} value={deductionView} onChange={setDeductionView}
                      options={[{ value: 'rate', label: x.viewRate }, { value: 'paycheck', label: x.viewPaycheck }]}
                    />
                  )}
                />
                <DeductionChart data={incomeSummary.monthlyDeductions} view={deductionView} />
                {deductionView === 'paycheck' && (
                  <div className="pb-ana-legend" aria-hidden="true">
                    <span><i style={{ background: 'var(--pine)' }} />{x.takeHome}</span>
                    <span><i style={{ background: 'var(--gold)' }} />{x.withheld}</span>
                  </div>
                )}
              </section>
            </div>
          )}
        </section>
      )}

      {/* ---------------- Spending ---------------- */}
      {spending && hasComplete && (
        <section id="pb-ana-spending" className="pb-ana-section" aria-labelledby="pb-ana-spending-title">
          <SectionHeader as="h2" id="pb-ana-spending-title" icon={Receipt} title={d.analysis.spending.title} actions={<PeriodChip range={range} />} />
          {spending.expenseCount === 0 ? (
            <div className="card pb-ana-card">
              <EmptyState compact icon={Receipt} title={x.spendingEmptyTitle} body={d.analysis.spending.empty} action={addTransaction} />
            </div>
          ) : (
            <div className="pb-ana-grid">
              <div className="stat-tabs pb-ana-tiles is-tri pb-ana-span-12">
                <Tile
                  label={d.analysis.spending.avgLabel}
                  tooltipLabel={d.analysis.spending.avgTooltipLabel}
                  value={spending.monthlyAverage === null ? '—' : formatCurrency(spending.monthlyAverage)}
                  note={
                    <span className="pb-tnum">
                      {t(spending.completeMonths === 1 ? d.budgetModal.recordedMonthsOne : d.budgetModal.recordedMonthsOther, { count: spending.completeMonths })
                        + (spending.dormantMonths > 0
                          ? t(spending.dormantMonths === 1 ? d.analysis.dormantSkippedOne : d.analysis.dormantSkippedOther, { count: spending.dormantMonths })
                          : '')}
                    </span>
                  }
                >
                  {d.analysis.spending.avgTooltip}
                </Tile>

                <Tile
                  label={d.analysis.spending.totalLabel}
                  tooltipLabel={d.analysis.spending.totalTooltipLabel}
                  value={formatCurrency(spending.total)}
                  note={<span className="pb-tnum">{countNote(spending.expenseCount, d, t)}</span>}
                >
                  {d.analysis.spending.totalTooltip}
                </Tile>

                <Tile
                  money={false}
                  label={d.analysis.spending.top3Label}
                  tooltipLabel={d.analysis.spending.top3TooltipLabel}
                  value={spending.top3Share === null ? '—' : pct(spending.top3Share)}
                  note={t(d.analysis.spending.top3Note, { categories: t(topN === 1 ? d.reports.categoriesOne : d.reports.categoriesOther, { count: topN }) })}
                >
                  {d.analysis.spending.top3Tooltip}
                </Tile>
              </div>

              <section className="card pb-ana-card pb-ana-span-7" aria-labelledby="pb-ana-monthly-title">
                <CardHead
                  id="pb-ana-monthly-title"
                  icon={<BarChart3 size={15} />}
                  title={d.analysis.spending.monthlyChartTitle}
                  tooltipLabel={d.analysis.spending.monthlyChartTooltipLabel}
                  tooltip={d.analysis.spending.monthlyChartTooltip}
                />
                <MonthlySpendChart data={monthly} average={spending.monthlyAverage} />
              </section>

              <section className="card pb-ana-card pb-ana-span-5" aria-labelledby="pb-ana-cats-title">
                <CardHead
                  id="pb-ana-cats-title"
                  icon={<ListOrdered size={15} />}
                  title={d.analysis.spending.topCategoriesTitle}
                  tooltipLabel={d.analysis.spending.topCategoriesTooltipLabel}
                  tooltip={d.analysis.spending.topCategoriesTooltip}
                />
                <TopCategories categories={spending.categories} categoryMeta={categoryMeta} />
              </section>
            </div>
          )}
        </section>
      )}

      {/* ---------------- Cash flow ---------------- */}
      {/* Savings rate and Average monthly net open the page now, in the
          At a glance hero; Runway and Months covered are the Cushion card. */}
      {cashflow && hasComplete && (
        <section id="pb-ana-cashflow" className="pb-ana-section" aria-labelledby="pb-ana-cashflow-title">
          <SectionHeader as="h2" id="pb-ana-cashflow-title" icon={ArrowLeftRight} title={d.analysis.cashflow.title} actions={<PeriodChip range={range} />} />
          <div className="pb-ana-grid">
            <section className="card pb-ana-card pb-ana-span-8 pb-ana-rows-2" aria-labelledby="pb-ana-flow-title">
              <CardHead
                id="pb-ana-flow-title"
                icon={<TrendingUp size={15} />}
                title={d.analysis.cashflow.chartTitle}
                tooltipLabel={d.analysis.cashflow.chartTooltipLabel}
                tooltip={<>{d.analysis.cashflow.chartTooltip} {x.inOutTooltip}</>}
                actions={(
                  <SegmentedControl<CashflowView>
                    size="sm" ariaLabel={x.chartView} value={cashflowView} onChange={setCashflowView}
                    options={[{ value: 'net', label: x.viewNet }, { value: 'inout', label: x.viewInOut }]}
                  />
                )}
              />
              <CashflowChart data={cashflow.months} view={cashflowView} />
              {cashflowView === 'inout' && (
                <div className="pb-ana-legend" aria-hidden="true">
                  <span><i style={{ background: 'var(--pine)' }} />{x.income}</span>
                  <span><i style={{ background: 'var(--wine)' }} />{x.spending}</span>
                  <span><i className="is-line" />{x.net}</span>
                </div>
              )}
              {cashflow.overspentMonths.length > 0 && (
                <p className="pb-ana-foot">
                  {renderTemplate(
                    t(cashflow.overspentMonths.length === 1 ? d.analysis.overspentMonthOne : d.analysis.overspentMonthOther, {
                      count: cashflow.overspentMonths.length,
                      list: '{list}',
                    }),
                    // Month names, not money: tabular, never blurred.
                    { list: <span className="pb-tnum">{cashflow.overspentMonths.map((m) => m.label).join(', ')}</span> },
                  )}
                </p>
              )}
            </section>

            <div className="pb-ana-span-4 pb-ana-stack">
              <CushionCard cashflow={cashflow} range={range} />
              <CommitmentsCard commitments={commitments} monthlyAverage={spending?.monthlyAverage ?? null} />
            </div>
          </div>
        </section>
      )}

      {/* ---------------- Comparison & outlook ---------------- */}
      {today && (
        <section id="pb-ana-outlook" className="pb-ana-section" aria-labelledby="pb-ana-outlook-title">
          <SectionHeader as="h2" id="pb-ana-outlook-title" icon={Telescope} title={d.analysis.outlook.title} />
          <div className="pb-ana-grid">
            {yoy.length > 0 && (
              <section className={`card pb-ana-card ${pairSpan(allMonths.length > 0, 'a')}`} aria-labelledby="pb-ana-yoy-title">
                <CardHead
                  id="pb-ana-yoy-title"
                  icon={<BarChart3 size={15} />}
                  title={d.analysis.outlook.yoyTitle}
                  tooltipLabel={d.analysis.outlook.yoyTooltipLabel}
                  tooltip={renderTemplate(d.analysis.outlook.yoyTooltip, { emphasis: d.analysis.outlook.yoyEmphasis })}
                  badge={<ScopeBadge>{x.allHistory}</ScopeBadge>}
                  scope={d.analysis.outlook.yoyScope}
                />
                <YearOverYearChart data={yoy} />
                {/* The per-year list became a table; '(so far)' and 'saved X%'
                    live on in the Year and Saved columns. */}
                <table className="pb-ana-yoy">
                  <thead>
                    <tr>
                      <th scope="col">{x.year}</th>
                      <th scope="col" className="is-wide">{x.income}</th>
                      <th scope="col" className="is-wide">{x.spending}</th>
                      <th scope="col">{x.net}</th>
                      <th scope="col">{x.saved}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* y.year is a raw number - locale-independent. */}
                    {yoy.map((y) => (
                      <tr key={y.year}>
                        <th scope="row">
                          <span className="pb-tnum">{y.year}</span>
                          {y.isCurrent && <span className="pb-ana-badge is-tiny">{x.soFar}</span>}
                        </th>
                        <td className="is-wide font-mono-tab">{formatCurrency(y.income)}</td>
                        <td className="is-wide font-mono-tab">{formatCurrency(y.spending)}</td>
                        <td className="font-mono-tab" style={{ color: y.net >= 0 ? 'var(--pine)' : 'var(--wine)' }}>{formatCurrency(y.net)}</td>
                        <td className="pb-tnum">
                          {y.savingsRate === null ? '—' : pct(y.savingsRate)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {/* Beside the year table: the month grid and the projection,
                stacked - both about how the year runs. */}
            {((allMonths.length > 0 && current) || projection) && (
              <div className={`pb-ana-stack ${pairSpan(yoy.length > 0, 'b')}`}>
                {allMonths.length > 0 && current && (
                  <SeasonalityHeatmap months={allMonths} today={today} currentLabel={current.label} />
                )}

                {projection && (
                  <section className="card pb-ana-card" aria-labelledby="pb-ana-proj-title">
                    <CardHead
                      id="pb-ana-proj-title"
                      icon={<Gauge size={15} />}
                      title={d.analysis.outlook.projectionTitle}
                      tooltipLabel={d.analysis.outlook.projectionTooltipLabel}
                      tooltip={renderTemplate(d.analysis.outlook.projectionTooltip, {
                        emphasis1: <strong>{d.analysis.outlook.projectionEmphasis1}</strong>,
                        emphasis2: <strong>{d.analysis.outlook.projectionEmphasis2}</strong>,
                      })}
                      // It follows the period through the average monthly net -
                      // now said with the chip, where it used to be silent.
                      badge={<PeriodChip range={range} />}
                      scope={t(d.analysis.outlook.projectionScope, { months: monthsLabel(projection.monthsRemaining, d, t) })}
                    />
                    <ProjectionPath projection={projection} balance={totalBalance} yearGone={pace ?? 0} />
                    <div className="stat-tabs pb-ana-pair">
                      <Tile label={d.analysis.outlook.flatEstimate} value={formatCurrency(projection.flat)} note={d.analysis.outlook.flatNote} className="is-flat" />
                      <Tile
                        label={d.analysis.outlook.seasonalLabel}
                        value={projection.seasonal === null ? '—' : formatCurrency(projection.seasonal)}
                        note={projection.seasonal === null ? d.analysis.outlook.seasonalNeedsTwo : d.analysis.outlook.seasonalNote}
                        className="is-seasonal"
                      />
                    </div>
                  </section>
                )}
              </div>
            )}

            {variance.length > 0 && pace !== null && (
              <section className="card pb-ana-card pb-ana-span-12" aria-labelledby="pb-ana-pace-title">
                <CardHead
                  id="pb-ana-pace-title"
                  icon={<Gauge size={15} />}
                  title={d.analysis.outlook.paceTitle}
                  tooltipLabel={d.analysis.outlook.paceTooltipLabel}
                  tooltip={renderTemplate(d.analysis.outlook.paceTooltip, {
                    emphasis: <strong>{d.analysis.outlook.paceEmphasis}</strong>,
                  })}
                  scope={t(d.analysis.outlook.paceScope, { pct: pct(pace) })}
                />
                <BudgetPaceList variance={variance} pace={pace} categoryMeta={categoryMeta} />
              </section>
            )}

            {upcoming && (
              <section className="card pb-ana-card pb-ana-span-12" aria-labelledby="pb-ana-up-title">
                <CardHead
                  id="pb-ana-up-title"
                  icon={<CalendarClock size={15} />}
                  title={d.analysis.outlook.comingUpTitle}
                  tooltipLabel={d.analysis.outlook.comingUpTooltipLabel}
                  tooltip={renderTemplate(d.analysis.outlook.comingUpTooltip, {
                    emphasis: <strong>{d.analysis.outlook.comingUpEmphasis}</strong>,
                  })}
                  badge={<ScopeBadge>{x.next3Months}</ScopeBadge>}
                  // A written date, where it used to print the raw YYYY-MM-DD.
                  scope={t(d.analysis.outlook.comingUpScope, { date: formatLongDate(upcoming.throughYmd, locale) })}
                />

                {upcoming.count === 0 ? (
                  <EmptyState
                    compact icon={CalendarClock} title={x.nothingDueTitle} body={d.analysis.outlook.nothingDue}
                    action={(
                      <button type="button" className="btn-primary pb-ana-action" onClick={() => requestShell('addSchedule')}>
                        <Plus size={15} aria-hidden="true" />{x.addSchedule}
                      </button>
                    )}
                  />
                ) : (
                  <>
                    <div className="stat-tabs pb-ana-pair">
                      <Tile label={d.analysis.outlook.dueOut} value={formatCurrency(upcoming.expenseTotal)} className="is-out" />
                      <Tile label={d.analysis.outlook.dueIn} value={formatCurrency(upcoming.incomeTotal)} className="is-in" />
                    </div>
                    {upcoming.expenseTotal + upcoming.incomeTotal > 0 && (
                      <span className="pb-ana-split is-thick pb-chart-fill" role="img" aria-label={x.inOutSplit}>
                        {/* Same order as the tiles above it: out, then in. */}
                        {upcoming.expenseTotal > 0 && <span className="is-out" style={{ flexGrow: upcoming.expenseTotal }} />}
                        {upcoming.incomeTotal > 0 && <span className="is-in" style={{ flexGrow: upcoming.incomeTotal }} />}
                      </span>
                    )}
                    <UpcomingTimeline months={upcoming.months} categoryMeta={categoryMeta} />
                  </>
                )}
              </section>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
