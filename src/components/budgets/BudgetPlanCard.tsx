'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronLeft, ChevronRight, CircleAlert, Gauge, PiggyBank, Receipt, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { PACE_TOLERANCE, yearFraction } from '@/lib/budgetPace';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { SectionHeader } from '@/components/kit/SectionHeader';
import { YearForecast, YearRing } from './YearGlance';
import type { PaceStatus } from './pace';
import type { BudgetEntry } from './types';

interface BudgetPlanCardProps {
  entries: BudgetEntry[];
  /** The same totals the old summary card showed - never recomputed here. */
  totalBudget: number;
  totalSpent: number;
  /** Expected annual income in effect (system estimate or manual). Null when unknown. */
  annualIncome: number | null;
  /** Zone-aware 'YYYY-MM-DD', or null for the first frame. */
  today: string | null;
  /** The expected-income control, rendered above the bar. */
  incomeControl?: ReactNode;
}

// Legend rows per page: six on a phone (as always), twelve in two columns
// once the card is wide, so on a Mac most plans show whole with no pager.
const PAGE_SIZE = 6;
const PAGE_SIZE_WIDE = 12;
const WIDE_LEGEND_PX = 720;
// The ribbon names a segment under itself once it is this share of the bar;
// narrower ones are named by the popup and the legend.
const LABEL_SHARE = 0.1;

function formatShare(value: number, total: number): string {
  if (total <= 0) return '0.0%';
  const pct = (value / total) * 100;
  return pct > 0 && pct < 0.1 ? '<0.1%' : `${pct.toFixed(1)}%`;
}

const PACE_ICON: Record<PaceStatus, typeof Check> = {
  over: CircleAlert, overPace: TrendingUp, onPace: Check, underPace: TrendingDown,
};

/**
 * The year's PLAN. It opens with the year at a glance - a ring for how much
 * of the budgets is used, with a tick where an even pace would be today - the
 * four headline figures beside it, and where spending lands on Dec 31 at the
 * current rate. Then one ribbon splitting expected income into each budget
 * plus what is left over as planned savings - all from the budgets set, not
 * from spending.
 *
 * Category names are user data and are shown exactly as stored.
 */
export function BudgetPlanCard({ entries, totalBudget, totalSpent, annualIncome, today, incomeControl }: BudgetPlanCardProps) {
  const { d, t } = useTranslation();
  const ux = d.ux.budgets;
  const [page, setPage] = useState(0);
  // The segment under the pointer (or focus), and where to centre its popup.
  const [hover, setHover] = useState<{ key: string; left: number } | null>(null);
  // Page size follows the card's own width (6 until measured, so the server
  // and first client render agree).
  const cardRef = useRef<HTMLElement>(null);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const measure = () => setPageSize(el.clientWidth >= WIDE_LEGEND_PX ? PAGE_SIZE_WIDE : PAGE_SIZE);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const budgeted = entries.filter((e) => e.budget > 0).sort((a, b) => b.budget - a.budget);
  const income = annualIncome !== null && annualIncome > 0 ? annualIncome : null;
  const savings = income !== null ? income - totalBudget : null;
  const showSavings = savings !== null && savings > 0;
  // The bar's 100%: expected income when savings shows, otherwise the budgets.
  const base = showSavings ? (income as number) : totalBudget;

  const rows = [
    ...budgeted.map((e) => ({ key: `b:${e.name}`, name: e.name, color: e.color, value: e.budget, savings: false })),
    ...(showSavings ? [{ key: 'savings', name: d.budgetPlan.savings, color: 'var(--pine)', value: savings as number, savings: true }] : []),
  ];
  const largest = rows.reduce((m, r) => Math.max(m, r.value), 0);

  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pages - 1);
  const pageRows = rows.slice(current * pageSize, current * pageSize + pageSize);
  const fillers = pages > 1 ? pageSize - pageRows.length : 0;

  const fraction = today ? yearFraction(today) : null;
  let paceLabel = '—';
  let pace: PaceStatus | null = null;
  let paceNote = '';
  if (fraction !== null && totalBudget > 0) {
    const expected = totalBudget * fraction;
    const tolerance = totalBudget * PACE_TOLERANCE;
    pace = totalSpent < expected - tolerance ? 'underPace' : totalSpent > expected + tolerance ? 'overPace' : 'onPace';
    paceLabel = pace === 'underPace' ? d.budgetPlan.underPace : pace === 'overPace' ? d.budgetPlan.overPace : d.budgetPlan.onPace;
    paceNote = pace === 'underPace' ? t(d.budgetPlan.underPaceBy, { amount: formatCurrency(expected - totalSpent) })
      : pace === 'overPace' ? t(d.budgetPlan.overPaceBy, { amount: formatCurrency(totalSpent - expected) })
      : '';
  }
  const left = totalBudget - totalSpent;
  const overall = totalSpent > totalBudget;
  // The pill's tone: wine only once spending passes the budgets (the label
  // keeps its own test above, unchanged).
  const paceTone: PaceStatus | null = pace === null ? null : overall && totalBudget > 0 ? 'over' : pace;
  if (paceTone === 'over') paceNote = t(d.budgetPlan.overBudgetBy, { amount: formatCurrency(totalSpent - totalBudget) });
  const unbudgetedSpent = entries.reduce((s, e) => (e.budget === 0 ? s + e.spent : s), 0);

  // NEW notes under the figures, derived from the same totals: the monthly
  // share of the budgets, the average month so far, and what is left spread
  // over the rest of the year.
  const monthsGone = fraction === null ? null : fraction * 12;
  const monthsLeft = fraction === null ? null : (1 - fraction) * 12;
  const cells = [
    {
      key: 'budget', label: d.budgetPlan.annualBudget, value: formatCurrency(totalBudget), color: 'var(--ink)', icon: Wallet, tone: 'var(--pine)',
      note: totalBudget > 0 ? t(d.budgetRow.monthly, { amount: formatCurrency(totalBudget / 12) }) : '',
    },
    {
      key: 'spent', label: d.budgetPlan.spent, value: formatCurrency(totalSpent), color: overall ? 'var(--wine)' : 'var(--ink)', icon: Receipt, tone: 'var(--wine)',
      note: monthsGone !== null && monthsGone > 0 && totalSpent > 0 ? t(ux.avgMonthly, { amount: formatCurrency(totalSpent / monthsGone) }) : '',
    },
    {
      key: 'left', label: d.budgetPlan.left, value: formatCurrency(left), color: left < 0 ? 'var(--wine)' : 'var(--ink)', icon: PiggyBank, tone: 'var(--gold)',
      note: monthsLeft !== null && monthsLeft >= 0.5 && left > 0 ? t(ux.leftPerMonth, { amount: formatCurrency(left / monthsLeft) }) : '',
    },
    { key: 'pace', label: d.budgetPlan.pace, value: paceLabel, color: 'var(--ink)', icon: Gauge, tone: 'var(--ink-soft)', note: paceNote },
  ];

  return (
    <section ref={cardRef} className="card pb-plan-card pb-bud-plan">
      <div className="pb-plan-head">
        <SectionHeader title={d.budgetPlan.title} subtitle={d.budgetPage.planBasis} />
      </div>

      <div className="pb-bud-glance">
        <YearRing totalBudget={totalBudget} totalSpent={totalSpent} fraction={fraction} />
        <div className="pb-stats-grid">
          {cells.map((c) => {
            const Icon = c.icon;
            const PaceIcon = c.key === 'pace' && paceTone ? PACE_ICON[paceTone] : null;
            return (
              <div key={c.key} className="pb-stats-cell">
                <div className="pb-stats-label">
                  <span className="pb-stats-icon" style={{ color: c.tone }} aria-hidden="true"><Icon size={14} /></span>
                  <span>{c.label}</span>
                </div>
                <div className="font-mono-tab pb-stats-value" style={{ color: c.color }}>
                  {PaceIcon ? (
                    <span className="pb-bud-pace" data-tone={paceTone}>
                      <PaceIcon size={15} strokeWidth={2.4} aria-hidden="true" />{c.value}
                    </span>
                  ) : c.value}
                </div>
                {/* Every cell reserves its note line, so the four stay level. */}
                <div className="pb-stats-note font-mono-tab" aria-hidden={c.note ? undefined : true} style={c.note ? (c.key === 'pace' && paceTone === 'over' ? { color: 'var(--wine)' } : undefined) : { visibility: 'hidden' }}>
                  {c.note || ' '}
                </div>
              </div>
            );
          })}
        </div>
        <YearForecast totalBudget={totalBudget} totalSpent={totalSpent} fraction={fraction} status={pace} unbudgetedSpent={unbudgetedSpent} />
      </div>

      <div className="pb-plan-body">
        {incomeControl}
        {rows.length === 0 ? (
          <p className="pb-plan-caption" style={{ margin: 0 }}>{d.budgetPlan.noBudgets}</p>
        ) : (
          <>
            <div className={`pb-plan-barwrap${hover ? ' has-active' : ''}`}>
              <div className="pb-bar-track" role="group" aria-label={d.budgetPlan.barLabel}>
                {rows.map((r) => {
                  const show = (el: HTMLElement) => setHover({ key: r.key, left: el.offsetLeft + el.offsetWidth / 2 });
                  return (
                    <span
                      key={r.key}
                      tabIndex={0}
                      className={`pb-bar-seg pb-plan-seg${r.savings ? ' pb-plan-savings' : ''}${hover?.key === r.key ? ' active' : ''}`}
                      style={{ flexGrow: r.value, ...(r.savings ? {} : { backgroundColor: r.color }) }}
                      aria-label={`${r.name}: ${formatCurrency(r.value)}, ${formatShare(r.value, base)}`}
                      onPointerEnter={(e) => show(e.currentTarget)}
                      onPointerLeave={(e) => { if (e.pointerType === 'mouse') setHover(null); }}
                      onClick={(e) => show(e.currentTarget)}
                      onFocus={(e) => show(e.currentTarget)}
                      onBlur={() => setHover(null)}
                    />
                  );
                })}
              </div>
              {/* NEW: direct labels under the wide segments, laid out with the
                  same flex weights and gaps so each sits under its segment.
                  Text stays in ink; decorative (the legend and the segments'
                  own labels carry it for assistive tech). */}
              <div className="pb-bud-ribbon-labels" aria-hidden="true">
                {rows.map((r) => (
                  <span key={r.key} style={{ flexGrow: r.value }}>
                    {base > 0 && r.value / base >= LABEL_SHARE && (
                      <>
                        <span className="pb-bud-ribbon-name">{r.name}</span>
                        <span className="pb-bud-ribbon-share font-mono-tab">{formatShare(r.value, base)}</span>
                      </>
                    )}
                  </span>
                ))}
              </div>
              {hover && (() => {
                const r = rows.find((x) => x.key === hover.key);
                if (!r) return null;
                return (
                  <div className="pb-plan-pop" role="status" style={{ left: `clamp(8rem, ${hover.left}px, calc(100% - 8rem))` }}>
                    <div className="pb-plan-pop-title">
                      <span
                        className={`pb-donut-dot${r.savings ? ' pb-plan-savings' : ''}`}
                        style={r.savings ? undefined : { backgroundColor: r.color }}
                        aria-hidden="true"
                      />
                      <span>{r.name}</span>
                    </div>
                    <div className="font-mono-tab pb-plan-pop-figs">
                      {formatCurrency(r.value)} · {formatShare(r.value, base)}
                    </div>
                    {r.savings && <div className="pb-plan-pop-note">{d.budgetPage.plannedSavingsHint}</div>}
                  </div>
                );
              })()}
            </div>

            {today && annualIncome === null && (
              <p className="pb-plan-caption">{d.budgetPlan.noIncome}</p>
            )}
            {savings !== null && savings < 0 && (
              <p className="pb-plan-caption" style={{ color: 'var(--wine)' }}>
                {t(d.budgetPlan.overIncome, { amount: formatCurrency(Math.abs(savings)) })}
              </p>
            )}

            <ul className="pb-donut-legend" data-wide={pageSize === PAGE_SIZE_WIDE ? '' : undefined}>
              {pageRows.map((r) => (
                <li key={r.key} className="pb-donut-row">
                  <span
                    className={`pb-donut-dot${r.savings ? ' pb-plan-savings' : ''}`}
                    style={r.savings ? undefined : { backgroundColor: r.color }}
                    aria-hidden="true"
                  />
                  <span className="pb-donut-name">{r.name}</span>
                  <span className="pb-donut-share font-mono-tab">{formatShare(r.value, base)}</span>
                  <span className="pb-donut-amount font-mono-tab">{formatCurrency(r.value)}</span>
                  {/* NEW: a hairline of the row's size against the largest, so
                      the list reads as magnitudes, not only numbers. */}
                  <span className="pb-bud-legend-bar" aria-hidden="true">
                    <span
                      className={r.savings ? 'pb-plan-savings' : undefined}
                      style={{ width: `${largest > 0 ? Math.max(1, (r.value / largest) * 100) : 0}%`, ...(r.savings ? {} : { backgroundColor: r.color }) }}
                    />
                  </span>
                </li>
              ))}
              {Array.from({ length: fillers }, (_, i) => (
                <li key={`filler-${i}`} className="pb-donut-row pb-donut-filler" aria-hidden="true">
                  <span className="pb-donut-dot" />
                  <span className="pb-donut-name">&nbsp;</span>
                  <span />
                  <span />
                  <span className="pb-bud-legend-bar" />
                </li>
              ))}
            </ul>

            {pages > 1 && (
              <div className="pb-donut-pager">
                <button
                  type="button" className="icon-btn" onClick={() => setPage(current - 1)} disabled={current === 0}
                  aria-label={d.donutChart.prevPage} style={{ width: 30, height: 30, borderRadius: '50%', opacity: current === 0 ? 0.4 : 1 }}
                >
                  <ChevronLeft size={15} />
                </button>
                <span className="pb-tnum" aria-live="polite">{current + 1} / {pages}</span>
                <button
                  type="button" className="icon-btn" onClick={() => setPage(current + 1)} disabled={current === pages - 1}
                  aria-label={d.donutChart.nextPage} style={{ width: 30, height: 30, borderRadius: '50%', opacity: current === pages - 1 ? 0.4 : 1 }}
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
