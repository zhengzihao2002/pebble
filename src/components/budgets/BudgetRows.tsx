'use client';

import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { PACE_TOLERANCE, yearFraction } from '@/lib/budgetPace';
import type { BudgetEntry } from './types';

interface BudgetRowsProps {
  entries: BudgetEntry[];
  /** Zone-aware 'YYYY-MM-DD', or null for the first frame. */
  today: string | null;
}

/**
 * One row per budget: name, a bar of spent against the budget with a marker
 * at where spending would be if even through the year, and the figures.
 * Wine means over budget and nothing else. Names are user data.
 */
export function BudgetRows({ entries, today }: BudgetRowsProps) {
  const { d, t } = useTranslation();
  // Most of its budget used first, so bars shorten down the page and anything
  // near or over its limit is on top. Ties fall back to the larger budget.
  const rows = entries.filter((e) => e.budget > 0)
    .sort((a, b) => (b.spent / b.budget) - (a.spent / a.budget) || b.budget - a.budget);
  if (rows.length === 0) return null;
  const fraction = today ? yearFraction(today) : null;

  return (
    <div className="card pb-rows">
      <p className="pb-rows-note">{d.budgetPlan.sortedBy}</p>
      {rows.map((e) => {
        const Icon = e.icon;
        const over = e.spent > e.budget;
        const expected = fraction === null ? null : e.budget * fraction;
        let status = '';
        let statusColor = 'var(--ink-soft)';
        if (over) {
          status = t(d.budgetPlan.overBudgetBy, { amount: formatCurrency(e.spent - e.budget) });
          statusColor = 'var(--wine)';
        } else if (expected !== null) {
          const tol = e.budget * PACE_TOLERANCE;
          if (e.spent < expected - tol) status = t(d.budgetPlan.underPaceBy, { amount: formatCurrency(expected - e.spent) });
          else if (e.spent > expected + tol) status = t(d.budgetPlan.overPaceBy, { amount: formatCurrency(e.spent - expected) });
          else status = d.budgetPlan.onPace;
        }
        const fill = Math.min((e.spent / e.budget) * 100, 100);

        return (
          <div key={e.name} className="pb-row">
            <div className="pb-row-name">
              <span className="pb-budget-icon" style={{ backgroundColor: `${e.color}20` }}>
                <Icon size={15} style={{ color: e.color }} />
              </span>
              <span>{e.name}</span>
            </div>
            <div className="pb-row-status" style={{ color: statusColor, fontWeight: over ? 600 : 400 }}>{status}</div>
            <div className="pb-row-bar">
              <div className="pb-row-track">
                <div className="pb-row-fill" style={{ width: `${fill}%`, backgroundColor: over ? 'var(--wine)' : 'var(--pine)' }} />
              </div>
              {expected !== null && (
                <span
                  className="pb-row-marker" tabIndex={0}
                  style={{ left: `${Math.min(fraction! * 100, 100)}%` }}
                  aria-label={t(d.budgetPlan.expectedByToday, { amount: formatCurrency(expected) })}
                  data-tip={t(d.budgetPlan.expectedByToday, { amount: formatCurrency(expected) })}
                />
              )}
            </div>
            <div className="font-mono-tab pb-row-figs">
              {t(d.phrasing.ofAmount, { spent: formatCurrency(e.spent), total: formatCurrency(e.budget) })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
