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
  ANALYSIS_WINDOW_LABELS,
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
const monthsLabel = (n: number) => `${n.toFixed(1)} month${n.toFixed(1) === '1.0' ? '' : 's'}`;

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

  const window = useMemo(
    () => (today ? resolveAnalysisWindow(windowKey, today, earliest) : null),
    [windowKey, today, earliest],
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
    () => (window ? computeMonthlySpend(transactions, window) : []),
    [transactions, window],
  );
  const incomeSummary = useMemo(
    () => (window ? computeIncomeSummary(transactions, window) : null),
    [transactions, window],
  );
  const annualIncome = useMemo(
    () => (window ? estimateAnnualIncomeInWindow(transactions, window) : null),
    [transactions, window],
  );
  const cashflow = useMemo(
    () => (window ? computeCashflow(transactions, window, totalBalance) : null),
    [transactions, window, totalBalance],
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
    () => (today ? computeUpcoming(rules, today, 3) : null),
    [rules, today],
  );
  const pace = today ? yearProgress(today) : null;

  const topN = Math.min(3, spending?.categories.length ?? 0);
  const noCompleteMonth = window !== null && !window.hasCompleteMonth;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* ---------------- Period ---------------- */}
      <section className="card" style={{ padding: '1.5rem' }}>
        <label className="filter-label" htmlFor="analysis-window">Period</label>
        <select
          id="analysis-window"
          value={windowKey}
          onChange={(e) => setWindowKey(e.target.value as AnalysisWindowKey)}
          style={{
            width: '100%', marginTop: 6, padding: '0.55rem 0.7rem', borderRadius: '0.7rem',
            border: '1px solid var(--line)', backgroundColor: 'var(--paper)', color: 'var(--ink)', fontSize: '0.9rem',
          }}
        >
          {ANALYSIS_WINDOW_KEYS.map((k) => (
            <option key={k} value={k}>{ANALYSIS_WINDOW_LABELS[k]}</option>
          ))}
        </select>
        {window && (
          <p style={{ fontSize: '0.78rem', color: 'var(--ink-soft)', marginTop: 8, display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="font-mono-tab">{window.rangeLabel}</span>
            {window.hasCompleteMonth && (
              <>
                <span style={{ margin: '0 6px' }}>·</span>
                <span className="font-mono-tab">{window.calendarMonths}</span>
                <span>&nbsp;complete month{window.calendarMonths === 1 ? '' : 's'}</span>
              </>
            )}
            <InfoTooltip label="What this period covers">
              Every figure below covers <strong>exactly these months</strong>. Analysis only ever
              uses complete calendar months, so <strong>{window.currentMonthLabel} is not included
              anywhere</strong> — a half-finished month would drag every average down and make your
              runway look longer than it is. It has its own card just below instead.
              {' '}This is why these numbers differ from your dashboard: the dashboard shows where
              you are right now, including today. This page shows your settled patterns.
            </InfoTooltip>
          </p>
        )}
      </section>

      {/* ---------------- The month in progress ---------------- */}
      {current && (
        <section className="card" style={{ padding: '1.5rem' }}>
          <CardHeading
            title={`${current.label} so far`}
            tooltipLabel="How this month so far is calculated"
            scope={`Day ${current.dayOfMonth} of ${current.daysInMonth} · not counted anywhere else on this page`}
          >
            Everything recorded from the 1st of this month up to today. Held apart from every other
            figure on the page because the month is not finished — mixing a part-month into an
            average understates it. Side Cash is excluded from the income figure, matching the rest
            of the page.
          </CardHeading>
          <div className="stat-tabs">
            <MiniTile label="Spent" value={formatCurrency(current.spending)} note={`${current.expenseCount} transaction${current.expenseCount === 1 ? '' : 's'}`} />
            <MiniTile label="Earned" value={formatCurrency(current.income)} note="take-home, excludes Side Cash" />
            <MiniTile
              label="Net"
              value={formatCurrency(current.net)}
              note={current.net >= 0 ? 'putting money aside' : 'drawing down'}
            />
          </div>
        </section>
      )}

      {noCompleteMonth && (
        <section className="card" style={{ padding: '1.5rem', color: 'var(--ink-soft)', fontSize: '0.85rem' }}>
          No complete month on record yet. Analysis fills in once your first calendar month finishes
          — until then, the card above is the whole picture.
        </section>
      )}

      {/* ---------------- Income ---------------- */}
      {incomeSummary && window?.hasCompleteMonth && (
        <section>
          <SectionHeading>Income</SectionHeading>
          {incomeSummary.monthsWithIncome === 0 ? (
            <div className="card" style={{ padding: '1.5rem', color: 'var(--ink-soft)', fontSize: '0.85rem' }}>
              No income recorded in these months.
            </div>
          ) : (
            <>
              <div className="stat-tabs">
                <Tile
                  label="Estimated annual income"
                  tooltipLabel="How estimated annual income is calculated"
                  value={annualIncome?.annual == null ? '—' : formatCurrency(annualIncome.annual)}
                  note="take-home, an estimate"
                >
                  <strong>Take-home Standard Income ÷ months you were recording × 12.</strong>
                  {' '}Side Cash is excluded, and this is take-home (net) pay, not salary before
                  deductions. A month where you were recording but received no pay counts as zero;
                  a stretch of 3 or more months with nothing recorded at all is skipped as time you
                  were not using Pebble. The Modify Budget dialog shows this same calculation over
                  a fixed 12 months, so the two agree when this period is set to Last 12 complete
                  months.
                </Tile>

                <Tile
                  label="Average monthly income"
                  tooltipLabel="How average monthly income is calculated"
                  value={incomeSummary.avgMonthlyNet === null ? '—' : formatCurrency(incomeSummary.avgMonthlyNet)}
                  note={`over ${incomeSummary.recordedMonths} recorded month${incomeSummary.recordedMonths === 1 ? '' : 's'}`}
                >
                  Take-home Standard Income divided by the number of months you were recording.
                  Months where you were recording but received no pay count as zero, because they
                  are real. Side Cash is excluded.
                </Tile>

                <Tile
                  label="Effective deduction rate"
                  tooltipLabel="How the deduction rate is calculated"
                  value={incomeSummary.deductionRate === null ? '—' : `${incomeSummary.deductionRate.toFixed(2)}%`}
                  note="of gross pay withheld"
                >
                  The share of your gross pay that never reaches your account: total gross minus
                  total take-home, divided by total gross. This covers <strong>everything
                  withheld</strong> — not just tax, but insurance and retirement contributions too.
                  Side Cash is excluded, since it usually has nothing withheld.
                </Tile>

                <Tile
                  label="Income stability"
                  tooltipLabel="How income stability is calculated"
                  value={incomeSummary.stability ?? '—'}
                  note={incomeSummary.cv === null ? 'Needs two months' : `variation ${(incomeSummary.cv * 100).toFixed(0)}%`}
                >
                  How much your monthly take-home varies, measured as the typical distance from
                  your average as a percentage of that average. Under 10% is very steady, under
                  25% steady, under 50% variable, above that highly variable. Months with no pay
                  count as zero, because a missed month is instability.
                </Tile>
              </div>

              <div className="card" style={{ padding: '1.5rem', marginTop: '1rem' }}>
                <CardHeading title="Deductions over time" tooltipLabel="How the deductions over time chart is calculated">
                  The share of gross pay withheld in each month. Gaps are months with no Standard
                  Income — the line breaks rather than dropping to zero, because no pay is not the
                  same as no deductions. A rising line means more of your pay is being withheld.
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
          <SectionHeading>Spending</SectionHeading>
          {spending.expenseCount === 0 ? (
            <div className="card" style={{ padding: '1.5rem', color: 'var(--ink-soft)', fontSize: '0.85rem' }}>
              No spending in these months.
            </div>
          ) : (
            <>
              <div className="stat-tabs">
                <Tile
                  label="Average monthly spend"
                  tooltipLabel="How average monthly spend is calculated"
                  value={spending.monthlyAverage === null ? '—' : formatCurrency(spending.monthlyAverage)}
                  note={`over ${spending.completeMonths} recorded month${spending.completeMonths === 1 ? '' : 's'}` +
                    (spending.dormantMonths > 0 ? `, ${spending.dormantMonths} dormant skipped` : '')}
                >
                  Total spending divided by the number of months you were recording. Any stretch of
                  3 or more consecutive months with no transactions at all is treated as time you
                  were not using Pebble and is skipped — counting those would make this look far
                  lower than your real spending. Balance adjustments are corrections, not spending,
                  so they are never included.
                </Tile>

                <Tile
                  label="Total spend"
                  tooltipLabel="How total spend is calculated"
                  value={formatCurrency(spending.total)}
                  note={`${spending.expenseCount} transaction${spending.expenseCount === 1 ? '' : 's'}`}
                >
                  Every expense in these months. Balance adjustments are excluded: they correct
                  your balance rather than record spending.
                </Tile>

                <Tile
                  label="Top 3 concentration"
                  tooltipLabel="How top 3 concentration is calculated"
                  value={spending.top3Share === null ? '—' : pct(spending.top3Share)}
                  note={`share held by ${topN} categor${topN === 1 ? 'y' : 'ies'}`}
                >
                  The share of your total spending held by your three largest categories. A high
                  figure means your spending is concentrated in a few places. With three or fewer
                  categories in the period this is 100% by definition.
                </Tile>
              </div>

              <div className="card" style={{ padding: '1.5rem', marginTop: '1rem' }}>
                <CardHeading title="Month by month" tooltipLabel="How the month by month chart is calculated">
                  Total expenses in each month of the period. Months with no spending are shown as
                  zero rather than skipped — a gap is information.
                </CardHeading>
                <div style={{ marginTop: '0.9rem' }}>
                  <MonthlySpendChart data={monthly} />
                </div>
              </div>

              <div className="card" style={{ padding: '1.5rem', marginTop: '1rem' }}>
                <CardHeading title="Top categories" tooltipLabel="How top categories are calculated">
                  Every expense in the period grouped by category and ranked by total. The
                  percentage is that category&apos;s share of total spending. Colours are the ones
                  set in your category settings, so they match the rest of Pebble.
                </CardHeading>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem', marginTop: '0.9rem' }}>
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
          <SectionHeading>Cash flow</SectionHeading>
          <div className="stat-tabs">
            <Tile
              label="Savings rate"
              tooltipLabel="How savings rate is calculated"
              value={cashflow.savingsRate === null ? '—' : pct(cashflow.savingsRate)}
              note={cashflow.savingsRate === null ? 'No income recorded' : 'income kept, not spent'}
            >
              Income minus spending, as a share of income, across these complete months.
              <strong> Side Cash is excluded</strong> — only Standard Income counts. Income means
              take-home pay, never gross, and balance adjustments are excluded.
              {' '}Your dashboard shows a different number for the same period because it includes
              the month in progress; this page uses only finished months.
            </Tile>

            <Tile
              label="Average monthly net"
              tooltipLabel="How average monthly net is calculated"
              value={cashflow.avgMonthlyNet === null ? '—' : formatCurrency(cashflow.avgMonthlyNet)}
              note={cashflow.avgMonthlyNet === null ? 'Needs one month' : cashflow.avgMonthlyNet >= 0 ? 'putting money aside' : 'drawing down'}
            >
              Average income minus average spending per recorded month. Positive means you are
              adding to your balance. Side Cash is excluded from the income side.
            </Tile>

            <Tile
              label="Runway"
              tooltipLabel="How runway is calculated"
              value={cashflow.runwayMonths === null ? '—' : monthsLabel(cashflow.runwayMonths)}
              note={cashflow.runwayMonths === null ? 'Income covers your spending' : 'at your current net burn'}
            >
              Your current balance divided by how much more you spend than you earn each month.
              Shown only when you are spending more than you earn — when income covers spending
              your balance is not being drawn down, so there is no runway to report. Your balance
              is today&apos;s actual balance and includes Side Cash, since that is money you have.
            </Tile>

            <Tile
              label="Months of expenses covered"
              tooltipLabel="How months of expenses covered is calculated"
              value={cashflow.expenseCoverMonths === null ? '—' : monthsLabel(cashflow.expenseCoverMonths)}
              note="if income stopped entirely"
            >
              Your current balance divided by average monthly spending, ignoring income. A
              worst-case cushion figure: how long you could keep spending at your usual rate with
              nothing coming in. Your balance includes <strong>all</strong> money you have, Side
              Cash included — it is left out of income figures, but it is still money in your
              account.
            </Tile>
          </div>

          <div className="card" style={{ padding: '1.5rem', marginTop: '1rem' }}>
            <CardHeading title="Money in versus out" tooltipLabel="How the money in versus out chart is calculated">
              Income minus spending for each month. Green months added to your balance, wine months
              drew it down. Side Cash is excluded from income.
            </CardHeading>
            <div style={{ marginTop: '0.9rem' }}>
              <CashflowChart data={cashflow.months} />
            </div>
            {cashflow.overspentMonths.length > 0 && (
              <p style={{ fontSize: '0.78rem', color: 'var(--ink-soft)', marginTop: '0.9rem' }}>
                Spending exceeded income in{' '}
                <span className="font-mono-tab">{cashflow.overspentMonths.length}</span>{' '}
                month{cashflow.overspentMonths.length === 1 ? '' : 's'}:{' '}
                <span className="font-mono-tab">{cashflow.overspentMonths.map((m) => m.label).join(', ')}</span>
              </p>
            )}
          </div>

          <div className="card" style={{ padding: '1.5rem', marginTop: '1rem' }}>
            <CardHeading
              title="Fixed monthly commitments"
              tooltipLabel="How fixed monthly commitments are calculated"
              scope="Standing figure — not affected by the period above"
            >
              Your active scheduled rules converted to a monthly figure — weekly counts 52 times a
              year, every-two-weeks 26, yearly once. Paused rules, one-off rules and rules that
              have finished their run are all excluded.
            </CardHeading>
            <div className="stat-tabs">
              <MiniTile
                label="Committed out"
                value={formatCurrency(commitments.expenseMonthly)}
                note={`${commitments.expenseCount} active rule${commitments.expenseCount === 1 ? '' : 's'}`}
              />
              <MiniTile
                label="Committed in"
                value={formatCurrency(commitments.incomeMonthly)}
                note={`${commitments.incomeCount} active rule${commitments.incomeCount === 1 ? '' : 's'}`}
              />
            </div>
          </div>
        </section>
      )}

      {/* ---------------- Comparison & outlook ---------------- */}
      {today && (
        <section>
          <SectionHeading>Comparison &amp; outlook</SectionHeading>

          {yoy.length > 0 && (
            <div className="card" style={{ padding: '1.5rem' }}>
              <CardHeading
                title="Year by year"
                tooltipLabel="How year by year is calculated"
                scope="Every year on record — not affected by the period above"
              >
                Total income and spending for each calendar year on record. Side Cash is excluded
                from income. The current year is marked &ldquo;so far&rdquo; because it is
                incomplete and will look smaller than a full year.
              </CardHeading>
              <YearOverYearChart data={yoy} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '1rem', fontSize: '0.8rem' }}>
                {yoy.map((y) => (
                  <div key={y.year} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                    <span className="font-mono-tab">{y.year}{y.isCurrent ? ' (so far)' : ''}</span>
                    <span className="font-mono-tab" style={{ color: 'var(--ink-soft)' }}>
                      saved {y.savingsRate === null ? '—' : pct(y.savingsRate)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {projection && (
            <div className="card" style={{ padding: '1.5rem', marginTop: '1rem' }}>
              <CardHeading
                title="Projected year-end balance"
                tooltipLabel="How the year-end projection is calculated"
                scope={`Estimate only — ${projection.monthsRemaining.toFixed(1)} months left this year`}
              >
                Your balance today plus your average monthly net flow for each month left in the
                year. <strong>Seasonally adjusted</strong> asks whether those particular months are
                typical for you: it looks at the same calendar months in past complete years and
                applies how they usually differ from an average month, so a habitually expensive
                December counts as one. The gap between the two figures is your seasonal exposure.
                Both are <strong>estimates</strong> from past behaviour, not predictions.
              </CardHeading>
              <div className="stat-tabs">
                <MiniTile label="Flat estimate" value={formatCurrency(projection.flat)} note="every month treated the same" />
                <MiniTile
                  label="Seasonally adjusted"
                  value={projection.seasonal === null ? '—' : formatCurrency(projection.seasonal)}
                  note={projection.seasonal === null ? 'needs two full years of history' : 'weighted by past years'}
                />
              </div>
            </div>
          )}

          {variance.length > 0 && pace !== null && (
            <div className="card" style={{ padding: '1.5rem', marginTop: '1rem' }}>
              <CardHeading
                title="Budget pace"
                tooltipLabel="How budget pace is calculated"
                scope={`This calendar year — you are ${pct(pace)} through it`}
              >
                What you have spent in each category so far this calendar year against its annual
                budget, <strong>including this month</strong> — a budget is about money actually
                gone. The vertical marker shows how far through the year you are: a bar past the
                marker means you are ahead of pace.
              </CardHeading>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
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
                title="Coming up"
                tooltipLabel="How coming up is calculated"
                scope={`Through ${upcoming.throughYmd} — not affected by the period above`}
              >
                Scheduled payments and income due over the next three months, worked out from your
                active rules. Paused rules and rules that have finished their run are left out.
                <strong> One-off scheduled items are included here</strong> — unlike the fixed
                commitments figure above, which counts only repeating obligations. Anything already
                added to your ledger is not shown again.
              </CardHeading>

              {upcoming.count === 0 ? (
                <p style={{ fontSize: '0.85rem', color: 'var(--ink-soft)' }}>Nothing scheduled in the next three months.</p>
              ) : (
                <>
                  <div className="stat-tabs" style={{ marginBottom: '1rem' }}>
                    <MiniTile label="Due out" value={formatCurrency(upcoming.expenseTotal)} />
                    <MiniTile label="Due in" value={formatCurrency(upcoming.incomeTotal)} />
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
