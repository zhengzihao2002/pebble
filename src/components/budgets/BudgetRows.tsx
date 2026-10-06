'use client';

import { useState } from 'react';
import { ChevronDown, Pencil } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { PACE_TOLERANCE, yearFraction } from '@/lib/budgetPace';
import { InlineBudgetEditor, budgetIconBtn } from './BudgetEditor';
import { BudgetDetails, type BudgetHistory } from './BudgetDetails';
import type { BudgetEntry } from './types';

interface BudgetRowsProps {
  entries: BudgetEntry[];
  /** Zone-aware 'YYYY-MM-DD', or null for the first frame. */
  today: string | null;
  history: BudgetHistory | null;
}

// Pulls the line under the bar up against it: the row's own grid gap left it
// floating too far below.
const UNDER_BAR_PULL = '-0.4rem';

function BudgetRow({ e, fraction, history }: { e: BudgetEntry; fraction: number | null; history: BudgetHistory | null }) {
  const { d, t } = useTranslation();
  const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const Icon = e.icon;
  const over = e.spent > e.budget;
  const expected = fraction === null ? null : e.budget * fraction;
  let pace = '';
  if (!over && expected !== null) {
    const tol = e.budget * PACE_TOLERANCE;
    if (e.spent < expected - tol) pace = t(d.budgetPlan.underPaceBy, { amount: formatCurrency(expected - e.spent) });
    else if (e.spent > expected + tol) pace = t(d.budgetPlan.overPaceBy, { amount: formatCurrency(e.spent - expected) });
    else pace = d.budgetPlan.onPace;
  }
  const fill = Math.min((e.spent / e.budget) * 100, 100);

  return (
    <div className="pb-row">
      <div className="pb-row-name">
        <span className="pb-budget-icon" style={{ backgroundColor: `${e.color}20` }}>
          <Icon size={15} style={{ color: e.color }} />
        </span>
        <span>{e.name}</span>
      </div>
      {/* Top right: yearly budget over its monthly share, the modify button beside both. */}
      <div className="pb-row-figs">
        {editing !== null ? (
          <InlineBudgetEditor name={e.name} initial={editing} onClose={() => setEditing(null)} />
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.3 }}>
              <span className="font-mono-tab" style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--ink)' }}>
                {t(d.budgetRow.yearly, { amount: formatCurrency(e.budget) })}
              </span>
              <span className="font-mono-tab" style={{ fontSize: '0.76rem', color: 'var(--ink-soft)' }}>
                {t(d.budgetRow.monthly, { amount: formatCurrency(e.budget / 12) })}
              </span>
            </span>
            <button
              type="button" className="icon-btn" onClick={() => setEditing(String(e.budget))}
              aria-label={`${d.budgetEdit.edit}: ${e.name}`} title={d.budgetEdit.edit}
              style={{ ...budgetIconBtn, backgroundColor: 'var(--pine-soft)', color: 'var(--pine)' }}
            >
              <Pencil size={18} />
            </button>
          </span>
        )}
      </div>
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
      {/* Bottom centre, close under the bar: spent, then left or over, then pace. */}
      <div className="pb-row-left" style={{ marginTop: UNDER_BAR_PULL }}>
        <span className="font-mono-tab" style={{ color: 'var(--ink)' }}>
          {t(d.budgetRow.spent, { amount: formatCurrency(e.spent) })}
        </span>
        {' · '}
        <span className="font-mono-tab" style={{ color: over ? 'var(--wine)' : 'var(--pine)' }}>
          {t(over ? d.budgetEdit.over : d.budgetEdit.left, { amount: formatCurrency(Math.abs(e.budget - e.spent)) })}
        </span>
        {pace && <span style={{ color: 'var(--ink-soft)', fontWeight: 400 }}>{' · '}{pace}</span>}
      </div>
      {/* Bottom right: the details toggle, on the same line. */}
      <div className="pb-row-more" style={{ marginTop: UNDER_BAR_PULL }}>
        <button
          type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
          style={{ background: 'none', border: 'none', padding: '0.2rem 0', color: 'var(--pine)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          {open ? d.budgetDetails.hide : d.budgetDetails.details}
          <ChevronDown size={14} aria-hidden="true" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform var(--pb-dur-std) var(--pb-ease-out)' }} />
        </button>
      </div>
      {open && (
        <div className="pb-row-details goal-step">
          <BudgetDetails
            name={e.name} color={e.color} budget={e.budget} history={history}
            onSuggest={(yearly) => setEditing(String(yearly))}
          />
        </div>
      )}
    </div>
  );
}

/**
 * One row per yearly budget: name, then the yearly budget over its monthly
 * share with a modify button; the bar with a marker at where spending would
 * be if even through the year; close under it what has been spent, how much
 * is left (with pace) or over; and an expandable 12-month history with Quick
 * set. Wine means over budget and nothing else. Names are user data.
 */
export function BudgetRows({ entries, today, history }: BudgetRowsProps) {
  const { d } = useTranslation();
  // Most of its budget used first, so bars shorten down the page and anything
  // near or over its limit is on top. Ties fall back to the larger budget.
  const rows = entries.filter((e) => e.budget > 0)
    .sort((a, b) => (b.spent / b.budget) - (a.spent / a.budget) || b.budget - a.budget);
  if (rows.length === 0) return null;
  const fraction = today ? yearFraction(today) : null;

  return (
    <div className="card pb-rows">
      <p className="pb-rows-note">{d.budgetRow.yearlyNote}{' · '}{d.budgetPlan.sortedBy}</p>
      {rows.map((e) => <BudgetRow key={e.name} e={e} fraction={fraction} history={history} />)}
    </div>
  );
}
