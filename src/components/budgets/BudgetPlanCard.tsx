'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { PACE_TOLERANCE, yearFraction } from '@/lib/budgetPace';
import { useTranslation } from '@/lib/i18n/useTranslation';
import type { BudgetEntry } from './types';

interface BudgetPlanCardProps {
  entries: BudgetEntry[];
  /** The same totals the old summary card showed - never recomputed here. */
  totalBudget: number;
  totalSpent: number;
  /** estimateAnnualIncomeTrailing12().annual - the Modify Budget figure. Null with no history. */
  annualIncome: number | null;
  /** Zone-aware 'YYYY-MM-DD', or null for the first frame. */
  today: string | null;
}

const PAGE_SIZE = 6;

function formatShare(value: number, total: number): string {
  if (total <= 0) return '0.0%';
  const pct = (value / total) * 100;
  return pct > 0 && pct < 0.1 ? '<0.1%' : `${pct.toFixed(1)}%`;
}

/**
 * The year's plan: four headline figures, then one bar splitting expected
 * income into each budget plus what is left over as savings.
 *
 * Expected income is the Modify Budget dialog's own figure (trailing 12
 * months of standard income), computed from transactions already on the
 * page. Category names are user data and are shown exactly as stored.
 */
export function BudgetPlanCard({ entries, totalBudget, totalSpent, annualIncome, today }: BudgetPlanCardProps) {
  const { d, t } = useTranslation();
  const [page, setPage] = useState(0);
  // The segment under the pointer (or focus), and where to centre its popup.
  const [hover, setHover] = useState<{ key: string; left: number } | null>(null);

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

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const pageRows = rows.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);
  const fillers = pages > 1 ? PAGE_SIZE - pageRows.length : 0;

  let paceLabel = '—';
  if (today && totalBudget > 0) {
    const expected = totalBudget * yearFraction(today);
    const tolerance = totalBudget * PACE_TOLERANCE;
    paceLabel = totalSpent < expected - tolerance ? d.budgetPlan.underPace
      : totalSpent > expected + tolerance ? d.budgetPlan.overPace
      : d.budgetPlan.onPace;
  }
  const left = totalBudget - totalSpent;
  const overall = totalSpent > totalBudget;

  const cells = [
    { key: 'budget', label: d.budgetPlan.annualBudget, value: formatCurrency(totalBudget), color: 'var(--ink)' },
    { key: 'spent', label: d.budgetPlan.spent, value: formatCurrency(totalSpent), color: overall ? 'var(--wine)' : 'var(--ink)' },
    { key: 'left', label: d.budgetPlan.left, value: formatCurrency(left), color: left < 0 ? 'var(--wine)' : 'var(--ink)' },
    { key: 'pace', label: d.budgetPlan.pace, value: paceLabel, color: 'var(--ink)' },
  ];

  return (
    <div className="card pb-plan-card">
      <div className="pb-plan-head">
        <h3 className="pb-stats-title">{d.budgetPlan.title}</h3>
      </div>

      <div className="pb-stats-grid">
        {cells.map((c) => (
          <div key={c.key} className="pb-stats-cell">
            <div className="pb-stats-label"><span>{c.label}</span></div>
            <div className="font-mono-tab pb-stats-value" style={{ color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      <div className="pb-plan-body">
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
                    {r.savings && <div className="pb-plan-pop-note">{d.budgetPlan.savingsHint}</div>}
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

            <ul className="pb-donut-legend">
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
                </li>
              ))}
              {Array.from({ length: fillers }, (_, i) => (
                <li key={`filler-${i}`} className="pb-donut-row pb-donut-filler" aria-hidden="true">
                  <span className="pb-donut-dot" />
                  <span className="pb-donut-name">&nbsp;</span>
                  <span />
                  <span />
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
                <span className="font-mono-tab" aria-live="polite">{current + 1} / {pages}</span>
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
    </div>
  );
}
