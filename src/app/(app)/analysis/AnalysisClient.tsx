'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePebbleStore } from '@/store/usePebbleStore';
import { buildCategoryMeta } from '@/lib/data/categoryMeta';
import type { CategoryItem } from '@/lib/data/mappers';
import { formatCurrency } from '@/lib/format';
import { computeCategorySpent } from '@/lib/stats';
import { isYmd, todayInZone } from '@/lib/recurring/occurrences';
import {
  ANALYSIS_WINDOW_KEYS,
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
import { computeCurrentMonth } from '@/lib/analysis/currentMonth';
import { computeBudgetVariance, computeProjection, computeYearOverYear, yearProgress } from '@/lib/analysis/projection';
import { computeUpcoming } from '@/lib/analysis/upcoming';
import { InfoTooltip } from '@/components/shared/InfoTooltip';
import { MonthlySpendChart } from '@/components/analysis/MonthlySpendChart';
import { CashflowChart } from '@/components/analysis/CashflowChart';
import { DeductionChart } from '@/components/analysis/DeductionChart';
import { YearOverYearChart } from '@/components/analysis/YearOverYearChart';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { renderTemplate } from '@/lib/i18n/RichText';
import type { Dictionary } from '@/lib/i18n';
import { t as translate } from '@/lib/i18n';
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

const pct = (v: number) => `${(v * 100).toFixed(2)}%`;

// Was a local one-off ('X.X month(s)'). Now the fourth place in this project
// with this exact shape (Reports, the budget modal, CatchUpNotice), so it
// reuses the shared analysis.monthsOne/Other pair instead of adding a fifth.
const monthsLabel = (n: number, d: Dictionary, t: typeof translate) =>
  t(n.toFixed(1) === '1.0' ? d.analysis.monthsOne : d.analysis.monthsOther, { n: n.toFixed(1) });

// 'N transaction(s)' - identical wording to d.reports.transactionsOne/Other,
// reused rather than duplicated.
const countNote = (n: number, d: Dictionary, t: typeof translate) =>
  t(n === 1 ? d.reports.transactionsOne : d.reports.transactionsOther, { count: n });

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-display" style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '0.75rem' }}>{children}</h2>
  );
}

/**
 * Card heading with an explanation. NOTE: no current-month prop any more.
 * The window holds only complete months, so every metric on this page covers
 * exactly the same span - stated once, under the period selector, instead of
 * twenty-one times in twenty-one tooltips.
 */
function CardHeading({ title, tooltipLabel, scope, children }: {
  title: string; tooltipLabel: string; scope?: string; children: React.ReactNode;
}) {
  return (
    <>
      <h3 style={{ fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center' }}>
        {title}
        <InfoTooltip label={tooltipLabel}>{children}</InfoTooltip>
      </h3>
      {scope && <p style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', margin: '2px 0 0.9rem' }}>{scope}</p>}
    </>
  );
}

function Tile({ label, value, note, tooltipLabel, children }: {
  label: string; value: string; note?: string; tooltipLabel: string; children: React.ReactNode;
}) {
  return (
    <div className="stat-tab">
      <p style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', display: 'flex', alignItems: 'center' }}>
        {label}
        <InfoTooltip label={tooltipLabel}>{children}</InfoTooltip>
      </p>
      <p className="font-display font-mono-tab" style={{ fontSize: '1.35rem', fontWeight: 600, marginTop: 4 }}>{value}</p>
      {note && <p style={{ fontSize: '0.7rem', color: 'var(--ink-soft)', marginTop: 2 }}>{note}</p>}
    </div>
  );
}

/** Plain tile, for figures explained by their card heading. */
function MiniTile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="stat-tab">
      <p style={{ fontSize: '0.75rem', color: 'var(--ink-soft)' }}>{label}</p>
      <p className="font-display font-mono-tab" style={{ fontSize: '1.35rem', fontWeight: 600, marginTop: 4 }}>{value}</p>
      {note && <p style={{ fontSize: '0.7rem', color: 'var(--ink-soft)', marginTop: 2 }}>{note}</p>}
    </div>
  );
}

export function AnalysisClient({ transactions, categories, budgets, rules, totalBalance }: AnalysisClientProps) {
  const { d, t, locale } = useTranslation();
  const categoryMeta = useMemo(() => buildCategoryMeta(categories, budgets), [categories, budgets]);

  // Static and date-free, so the server render and the first client render are
  // byte-identical. Real values depend on today's date and on localStorage,
  // neither of which exists on the server.
  const [today, setToday] = useState<string | null>(null);
  const [windowKey, setWindowKey] = useState<AnalysisWindowKey>(DEFAULT_ANALYSIS_WINDOW);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    // Resolved in the BROWSER, from the browser's own IANA zone. getToday() is
    // avoided outright: it reads container-local time, which is UTC on Vercel,
    // so a New Jersey evening is already tomorrow. An unrecognized zone makes
    // Intl THROW, hence the try; `today` then stays null and date-dependent
    // metrics skip. We never fall back to UTC.
    try {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
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

  // locale threaded through: window.rangeLabel and window.currentMonthLabel
  // are now genuinely localized in windows.ts, not just passed through
  // English.
  const window = useMemo(
    () => (today ? resolveAnalysisWindow(windowKey, today, earliest, locale) : null),
    [windowKey, today, earliest, locale],
  );

  // --- the month in progress, deliberately outside every window ---
  const current = useMemo(
    () => (today && window
      ? computeCurrentMonth(transactions, today, window.currentMonthStartYmd, window.currentMonthLabel)
      : null),
    [transactions, today, window],
  );

  // --- window-driven: all of these cover exactly the same complete months ---
  const spending = useMemo(
    () => (window ? computeSpendingSummary(transactions, window) : null),
    [transactions, window],
  );
  const monthly = useMemo(
    () => (window ? computeMonthlySpend(transactions, window, locale) : []),
    [transactions, window, locale],
  );
  const incomeSummary = useMemo(
    () => (window ? computeIncomeSummary(transactions, window, locale) : null),
    [transactions, window, locale],
  );
  const annualIncome = useMemo(
    () => (window ? estimateAnnualIncomeInWindow(transactions, window) : null),
    [transactions, window],
  );
  const cashflow = useMemo(
    () => (window ? computeCashflow(transactions, window, totalBalance, locale) : null),
    [transactions, window, totalBalance, locale],
  );

  // --- fixed-scope: deliberately NOT driven by the period selector ---
  const commitments = useMemo(() => computeCommitments(rules), [rules]);
  const yoy = useMemo(
    () => (today ? computeYearOverYear(transactions, today) : []),
    [transactions, today],
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
  const noCompleteMonth = window !== null && !window.hasCompleteMonth;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* ---------------- Period ---------------- */}
      <section className="card" style={{ padding: '1.5rem' }}>
        <label className="filter-label" htmlFor="analysis-window">{d.analysis.period.label}</label>
        <select
          id="analysis-window"
          value={windowKey}
          onChange={(e) => setWindowKey(e.target.value as AnalysisWindowKey)}
          style={{
            width: '100%', marginTop: 6, padding: '0.55rem 0.7rem', borderRadius: '0.7rem',
            border: '1px solid var(--line)', backgroundColor: 'var(--paper)', color: 'var(--ink)', fontSize: '0.9rem',
          }}
        >
          {/* value is the stored AnalysisWindowKey; only the text is translated. */}
          {ANALYSIS_WINDOW_KEYS.map((k) => (
            <option key={k} value={k}>{d.analysis.windowLabels[k]}</option>
          ))}
        </select>
        {window && (
          <p style={{ fontSize: '0.78rem', color: 'var(--ink-soft)', marginTop: 8, display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="font-mono-tab">{window.rangeLabel || d.analysis.noCompleteRange}</span>
            {window.hasCompleteMonth && (
              <>
                <span style={{ margin: '0 6px' }}>·</span>
                <span className="font-mono-tab">{window.calendarMonths}</span>
                <span>&nbsp;{t(window.calendarMonths === 1 ? d.analysis.completeMonthsOne : d.analysis.completeMonthsOther, { count: window.calendarMonths }).replace(String(window.calendarMonths), '').trim()}</span>
              </>
            )}
            <InfoTooltip label={d.analysis.period.tooltipLabel}>
              {renderTemplate(d.analysis.period.tooltip, {
                exactly: <strong>{d.analysis.period.exactly}</strong>,
                excluded: <strong>{t(d.analysis.period.excluded, { month: window.currentMonthLabel })}</strong>,
              })}
            </InfoTooltip>
          </p>
        )}
      </section>

      {/* ---------------- The month in progress ---------------- */}
      {current && (
        <section className="card" style={{ padding: '1.5rem' }}>
          <CardHeading
            title={t(d.analysis.currentMonth.title, { month: current.label })}
            tooltipLabel={d.analysis.currentMonth.tooltipLabel}
            scope={t(d.analysis.currentMonth.scope, { day: current.dayOfMonth, total: current.daysInMonth })}
          >
            {d.analysis.currentMonth.tooltip}
          </CardHeading>
          <div className="stat-tabs">
            <MiniTile label={d.analysis.currentMonth.spent} value={formatCurrency(current.spending)} note={countNote(current.expenseCount, d, t)} />
            <MiniTile label={d.analysis.currentMonth.earned} value={formatCurrency(current.income)} note={d.analysis.currentMonth.earnedNote} />
            <MiniTile
              label={d.analysis.currentMonth.net}
              value={formatCurrency(current.net)}
              note={current.net >= 0 ? d.analysis.puttingAside : d.analysis.drawingDown}
            />
          </div>
        </section>
      )}

      {noCompleteMonth && (
        <section className="card" style={{ padding: '1.5rem', color: 'var(--ink-soft)', fontSize: '0.85rem' }}>
          {d.analysis.noCompleteMonth}
        </section>
      )}

      {/* ---------------- Income ---------------- */}
      {incomeSummary && window?.hasCompleteMonth && (
        <section>
          <SectionHeading>{d.analysis.income.title}</SectionHeading>
          {incomeSummary.monthsWithIncome === 0 ? (
            <div className="card" style={{ padding: '1.5rem', color: 'var(--ink-soft)', fontSize: '0.85rem' }}>
              {d.analysis.income.empty}
            </div>
          ) : (
            <>
              <div className="stat-tabs">
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
                  note={t(incomeSummary.recordedMonths === 1 ? d.budgetModal.recordedMonthsOne : d.budgetModal.recordedMonthsOther, { count: incomeSummary.recordedMonths })}
                >
                  {d.analysis.income.avgTooltip}
                </Tile>

                <Tile
                  label={d.analysis.income.deductionLabel}
                  tooltipLabel={d.analysis.income.deductionTooltipLabel}
                  value={incomeSummary.deductionRate === null ? '—' : `${incomeSummary.deductionRate.toFixed(2)}%`}
                  note={d.analysis.income.deductionNote}
                >
                  {renderTemplate(d.analysis.income.deductionTooltip, {
                    emphasis: <strong>{d.analysis.income.deductionEmphasis}</strong>,
                  })}
                </Tile>

                <Tile
                  label={d.analysis.income.stabilityLabel}
                  tooltipLabel={d.analysis.income.stabilityTooltipLabel}
                  value={incomeSummary.stability ? d.analysis.stability[incomeSummary.stability] : '—'}
                  note={incomeSummary.cv === null ? d.analysis.income.stabilityNeedsTwo : t(d.analysis.income.stabilityVariation, { pct: (incomeSummary.cv * 100).toFixed(0) })}
                >
                  {d.analysis.income.stabilityTooltip}
                </Tile>
              </div>

              <div className="card" style={{ padding: '1.5rem', marginTop: '1rem' }}>
                <CardHeading title={d.analysis.income.deductionsChartTitle} tooltipLabel={d.analysis.income.deductionsChartTooltipLabel}>
                  {d.analysis.income.deductionsChartTooltip}
                </CardHeading>
                <div style={{ marginTop: '0.9rem' }}>
                  <DeductionChart data={incomeSummary.monthlyDeductions} />
                </div>
              </div>
            </>
          )}
        </section>
      )}

      {/* ---------------- Spending ---------------- */}
      {spending && window?.hasCompleteMonth && (
        <section>
          <SectionHeading>{d.analysis.spending.title}</SectionHeading>
          {spending.expenseCount === 0 ? (
            <div className="card" style={{ padding: '1.5rem', color: 'var(--ink-soft)', fontSize: '0.85rem' }}>
              {d.analysis.spending.empty}
            </div>
          ) : (
            <>
              <div className="stat-tabs">
                <Tile
                  label={d.analysis.spending.avgLabel}
                  tooltipLabel={d.analysis.spending.avgTooltipLabel}
                  value={spending.monthlyAverage === null ? '—' : formatCurrency(spending.monthlyAverage)}
                  note={
                    t(spending.completeMonths === 1 ? d.budgetModal.recordedMonthsOne : d.budgetModal.recordedMonthsOther, { count: spending.completeMonths })
                    + (spending.dormantMonths > 0
                      ? t(spending.dormantMonths === 1 ? d.analysis.dormantSkippedOne : d.analysis.dormantSkippedOther, { count: spending.dormantMonths })
                      : '')
                  }
                >
                  {d.analysis.spending.avgTooltip}
                </Tile>

                <Tile
                  label={d.analysis.spending.totalLabel}
                  tooltipLabel={d.analysis.spending.totalTooltipLabel}
                  value={formatCurrency(spending.total)}
                  note={countNote(spending.expenseCount, d, t)}
                >
                  {d.analysis.spending.totalTooltip}
                </Tile>

                <Tile
                  label={d.analysis.spending.top3Label}
                  tooltipLabel={d.analysis.spending.top3TooltipLabel}
                  value={spending.top3Share === null ? '—' : pct(spending.top3Share)}
                  note={t(d.analysis.spending.top3Note, { categories: t(topN === 1 ? d.reports.categoriesOne : d.reports.categoriesOther, { count: topN }) })}
                >
                  {d.analysis.spending.top3Tooltip}
                </Tile>
              </div>

              <div className="card" style={{ padding: '1.5rem', marginTop: '1rem' }}>
                <CardHeading title={d.analysis.spending.monthlyChartTitle} tooltipLabel={d.analysis.spending.monthlyChartTooltipLabel}>
                  {d.analysis.spending.monthlyChartTooltip}
                </CardHeading>
                <div style={{ marginTop: '0.9rem' }}>
                  <MonthlySpendChart data={monthly} />
                </div>
              </div>

              <div className="card" style={{ padding: '1.5rem', marginTop: '1rem' }}>
                <CardHeading title={d.analysis.spending.topCategoriesTitle} tooltipLabel={d.analysis.spending.topCategoriesTooltipLabel}>
                  {d.analysis.spending.topCategoriesTooltip}
                </CardHeading>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem', marginTop: '0.9rem' }}>
                  {/* c.category is USER DATA and renders exactly as stored. */}
                  {spending.categories.slice(0, 8).map((c) => (
                    <div key={c.category}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', fontSize: '0.83rem', marginBottom: 4 }}>
                        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.category}</span>
                        <span className="font-mono-tab" style={{ flexShrink: 0, color: 'var(--ink-soft)' }}>
                          {formatCurrency(c.total)} · {pct(c.share)}
                        </span>
                      </div>
                      <div style={{ height: 8, borderRadius: 99, backgroundColor: 'var(--paper)', overflow: 'hidden' }}>
                        <div style={{
                          width: `${Math.max(c.share * 100, 1)}%`, height: '100%', borderRadius: 99,
                          backgroundColor: categoryMeta[c.category]?.color ?? 'var(--pine)',
                        }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </section>
      )}

      {/* ---------------- Cash flow ---------------- */}
      {cashflow && window?.hasCompleteMonth && (
        <section>
          <SectionHeading>{d.analysis.cashflow.title}</SectionHeading>
          <div className="stat-tabs">
            <Tile
              label={d.analysis.cashflow.savingsLabel}
              tooltipLabel={d.analysis.cashflow.savingsTooltipLabel}
              value={cashflow.savingsRate === null ? '—' : pct(cashflow.savingsRate)}
              note={cashflow.savingsRate === null ? d.analysis.cashflow.savingsNoIncome : d.analysis.cashflow.savingsNote}
            >
              {renderTemplate(d.analysis.cashflow.savingsTooltip, {
                emphasis: <strong>{d.analysis.cashflow.savingsEmphasis}</strong>,
              })}
            </Tile>

            <Tile
              label={d.analysis.cashflow.avgNetLabel}
              tooltipLabel={d.analysis.cashflow.avgNetTooltipLabel}
              value={cashflow.avgMonthlyNet === null ? '—' : formatCurrency(cashflow.avgMonthlyNet)}
              note={cashflow.avgMonthlyNet === null ? d.analysis.cashflow.avgNetNeedsOne : cashflow.avgMonthlyNet >= 0 ? d.analysis.puttingAside : d.analysis.drawingDown}
            >
              {d.analysis.cashflow.avgNetTooltip}
            </Tile>

            <Tile
              label={d.analysis.cashflow.runwayLabel}
              tooltipLabel={d.analysis.cashflow.runwayTooltipLabel}
              value={cashflow.runwayMonths === null ? '—' : monthsLabel(cashflow.runwayMonths, d, t)}
              note={cashflow.runwayMonths === null ? d.analysis.cashflow.runwayCovered : d.analysis.cashflow.runwayNote}
            >
              {d.analysis.cashflow.runwayTooltip}
            </Tile>

            <Tile
              label={d.analysis.cashflow.coverLabel}
              tooltipLabel={d.analysis.cashflow.coverTooltipLabel}
              value={cashflow.expenseCoverMonths === null ? '—' : monthsLabel(cashflow.expenseCoverMonths, d, t)}
              note={d.analysis.cashflow.coverNote}
            >
              {renderTemplate(d.analysis.cashflow.coverTooltip, {
                emphasis: <strong>{d.analysis.cashflow.coverEmphasis}</strong>,
              })}
            </Tile>
          </div>

          <div className="card" style={{ padding: '1.5rem', marginTop: '1rem' }}>
            <CardHeading title={d.analysis.cashflow.chartTitle} tooltipLabel={d.analysis.cashflow.chartTooltipLabel}>
              {d.analysis.cashflow.chartTooltip}
            </CardHeading>
            <div style={{ marginTop: '0.9rem' }}>
              <CashflowChart data={cashflow.months} />
            </div>
            {cashflow.overspentMonths.length > 0 && (
              <p style={{ fontSize: '0.78rem', color: 'var(--ink-soft)', marginTop: '0.9rem' }}>
                {renderTemplate(
                  t(cashflow.overspentMonths.length === 1 ? d.analysis.overspentMonthOne : d.analysis.overspentMonthOther, {
                    count: cashflow.overspentMonths.length,
                    list: '{list}',
                  }),
                  { list: <span className="font-mono-tab">{cashflow.overspentMonths.map((m) => m.label).join(', ')}</span> },
                )}
              </p>
            )}
          </div>

          <div className="card" style={{ padding: '1.5rem', marginTop: '1rem' }}>
            <CardHeading
              title={d.analysis.cashflow.commitmentsTitle}
              tooltipLabel={d.analysis.cashflow.commitmentsTooltipLabel}
              scope={d.analysis.cashflow.commitmentsScope}
            >
              {d.analysis.cashflow.commitmentsTooltip}
            </CardHeading>
            <div className="stat-tabs">
              <MiniTile
                label={d.analysis.cashflow.committedOut}
                value={formatCurrency(commitments.expenseMonthly)}
                note={t(commitments.expenseCount === 1 ? d.analysis.activeRuleOne : d.analysis.activeRuleOther, { count: commitments.expenseCount })}
              />
              <MiniTile
                label={d.analysis.cashflow.committedIn}
                value={formatCurrency(commitments.incomeMonthly)}
                note={t(commitments.incomeCount === 1 ? d.analysis.activeRuleOne : d.analysis.activeRuleOther, { count: commitments.incomeCount })}
              />
            </div>
          </div>
        </section>
      )}

      {/* ---------------- Comparison & outlook ---------------- */}
      {today && (
        <section>
          <SectionHeading>{d.analysis.outlook.title}</SectionHeading>

          {yoy.length > 0 && (
            <div className="card" style={{ padding: '1.5rem' }}>
              <CardHeading
                title={d.analysis.outlook.yoyTitle}
                tooltipLabel={d.analysis.outlook.yoyTooltipLabel}
                scope={d.analysis.outlook.yoyScope}
              >
                {renderTemplate(d.analysis.outlook.yoyTooltip, {
                  emphasis: d.analysis.outlook.yoyEmphasis,
                })}
              </CardHeading>
              <YearOverYearChart data={yoy} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '1rem', fontSize: '0.8rem' }}>
                {/* y.year is a raw number - locale-independent. */}
                {yoy.map((y) => (
                  <div key={y.year} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                    <span className="font-mono-tab">{y.year}{y.isCurrent ? d.analysis.outlook.yoySoFar : ''}</span>
                    <span className="font-mono-tab" style={{ color: 'var(--ink-soft)' }}>
                      {t(d.analysis.outlook.yoySaved, { pct: y.savingsRate === null ? '—' : pct(y.savingsRate) })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {projection && (
            <div className="card" style={{ padding: '1.5rem', marginTop: '1rem' }}>
              <CardHeading
                title={d.analysis.outlook.projectionTitle}
                tooltipLabel={d.analysis.outlook.projectionTooltipLabel}
                scope={t(d.analysis.outlook.projectionScope, { months: monthsLabel(projection.monthsRemaining, d, t) })}
              >
                {renderTemplate(d.analysis.outlook.projectionTooltip, {
                  emphasis1: <strong>{d.analysis.outlook.projectionEmphasis1}</strong>,
                  emphasis2: <strong>{d.analysis.outlook.projectionEmphasis2}</strong>,
                })}
              </CardHeading>
              <div className="stat-tabs">
                <MiniTile label={d.analysis.outlook.flatEstimate} value={formatCurrency(projection.flat)} note={d.analysis.outlook.flatNote} />
                <MiniTile
                  label={d.analysis.outlook.seasonalLabel}
                  value={projection.seasonal === null ? '—' : formatCurrency(projection.seasonal)}
                  note={projection.seasonal === null ? d.analysis.outlook.seasonalNeedsTwo : d.analysis.outlook.seasonalNote}
                />
              </div>
            </div>
          )}

          {variance.length > 0 && pace !== null && (
            <div className="card" style={{ padding: '1.5rem', marginTop: '1rem' }}>
              <CardHeading
                title={d.analysis.outlook.paceTitle}
                tooltipLabel={d.analysis.outlook.paceTooltipLabel}
                scope={t(d.analysis.outlook.paceScope, { pct: pct(pace) })}
              >
                {renderTemplate(d.analysis.outlook.paceTooltip, {
                  emphasis: <strong>{d.analysis.outlook.paceEmphasis}</strong>,
                })}
              </CardHeading>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                {/* v.category is USER DATA and renders exactly as stored. */}
                {variance.map((v) => (
                  <div key={v.category}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', fontSize: '0.83rem', marginBottom: 4 }}>
                      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.category}</span>
                      <span className="font-mono-tab" style={{ flexShrink: 0, color: v.overBudget ? 'var(--wine)' : 'var(--ink-soft)' }}>
                        {formatCurrency(v.spent)} / {formatCurrency(v.budget)} · {pct(v.usedShare)}
                      </span>
                    </div>
                    <div style={{ position: 'relative', height: 8, borderRadius: 99, backgroundColor: 'var(--paper)', overflow: 'hidden' }}>
                      <div style={{
                        width: `${Math.min(v.usedShare * 100, 100)}%`, height: '100%', borderRadius: 99,
                        backgroundColor: v.overBudget ? 'var(--wine)' : (categoryMeta[v.category]?.color ?? 'var(--pine)'),
                      }} />
                      <div style={{ position: 'absolute', top: -2, bottom: -2, left: `${pace * 100}%`, width: 2, backgroundColor: 'var(--ink-soft)', opacity: 0.55 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {upcoming && (
            <div className="card" style={{ padding: '1.5rem', marginTop: '1rem' }}>
              <CardHeading
                title={d.analysis.outlook.comingUpTitle}
                tooltipLabel={d.analysis.outlook.comingUpTooltipLabel}
                scope={t(d.analysis.outlook.comingUpScope, { date: upcoming.throughYmd })}
              >
                {renderTemplate(d.analysis.outlook.comingUpTooltip, {
                  emphasis: <strong>{d.analysis.outlook.comingUpEmphasis}</strong>,
                })}
              </CardHeading>

              {upcoming.count === 0 ? (
                <p style={{ fontSize: '0.85rem', color: 'var(--ink-soft)' }}>{d.analysis.outlook.nothingDue}</p>
              ) : (
                <>
                  <div className="stat-tabs" style={{ marginBottom: '1rem' }}>
                    <MiniTile label={d.analysis.outlook.dueOut} value={formatCurrency(upcoming.expenseTotal)} />
                    <MiniTile label={d.analysis.outlook.dueIn} value={formatCurrency(upcoming.incomeTotal)} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {upcoming.months.map((m) => (
                      <div key={m.key}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.45rem' }}>
                          <span>{m.label}</span>
                          <span className="font-mono-tab" style={{ color: 'var(--ink-soft)', fontWeight: 400 }}>
                            {m.expenseTotal > 0 && `−${formatCurrency(m.expenseTotal)}`}
                            {m.expenseTotal > 0 && m.incomeTotal > 0 && ' · '}
                            {m.incomeTotal > 0 && `+${formatCurrency(m.incomeTotal)}`}
                          </span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                          {/* it.description is USER DATA and renders as stored. */}
                          {m.items.map((it, i) => (
                            <div key={`${it.ruleId}-${it.date}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', fontSize: '0.8rem' }}>
                              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ink-soft)' }}>
                                <span className="font-mono-tab">{it.date.slice(8, 10)}</span>{' '}{it.description}
                              </span>
                              <span className="font-mono-tab" style={{ flexShrink: 0, color: it.kind === 'expense' ? 'var(--ink)' : 'var(--pine)' }}>
                                {it.kind === 'expense' ? '−' : '+'}{formatCurrency(Math.abs(it.amount))}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
