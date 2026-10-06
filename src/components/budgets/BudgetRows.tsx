'use client';

import { useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { PACE_TOLERANCE, yearFraction } from '@/lib/budgetPace';
import { modifyBudgetsAction } from '@/lib/actions/pebble';
import { callAction } from '@/lib/actions/callAction';
import { translateActionError } from '@/lib/i18n/actionErrors';
import { AmountInput } from '@/components/shared/AmountInput';
import type { BudgetEntry } from './types';

interface BudgetRowsProps {
  entries: BudgetEntry[];
  /** Zone-aware 'YYYY-MM-DD', or null for the first frame. */
  today: string | null;
}

/**
 * The top-right "$spent of $budget" figure with a small modify button.
 * Editing swaps it for an inline field in the same cell and saves ONE
 * category through the existing modifyBudgetsAction, which only touches the
 * categories it is given (0 removes the budget).
 */
function RowFigs({ entry }: { entry: BudgetEntry }) {
  const { d, t, locale } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = () => { setValue(String(entry.budget)); setError(null); setEditing(true); };
  const cancel = () => { if (!saving) { setEditing(false); setError(null); } };
  const save = async () => {
    if (saving) return;
    const amount = Number(value);
    if (value.trim() === '' || !Number.isFinite(amount) || amount < 0) return;
    setSaving(true);
    setError(null);
    const result = await callAction(() => modifyBudgetsAction({ [entry.name]: amount }));
    setSaving(false);
    if (!result.ok) { setError(translateActionError(d, locale, result)); return; }
    setEditing(false);
  };

  const iconBtn: React.CSSProperties = {
    width: 36, height: 36, borderRadius: '50%', border: 'none', padding: 0, verticalAlign: 'middle',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  };

  return (
    <div className="font-mono-tab pb-row-figs">
      {editing ? (
        <span
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { e.stopPropagation(); cancel(); }
            else if (e.key === 'Enter') { e.preventDefault(); void save(); }
          }}
        >
          <span style={{ position: 'relative', display: 'inline-block', width: '6.5rem' }}>
            <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-soft)' }}>$</span>
            <AmountInput
              wholeDollars autoFocus value={value} onValueChange={setValue} disabled={saving}
              aria-label={`${d.budgetEdit.edit}: ${entry.name}`} className="font-mono-tab"
              style={{ width: '100%', boxSizing: 'border-box', padding: '0.3rem 0.45rem 0.3rem 1.2rem', borderRadius: '0.45rem', border: '1px solid var(--line)', fontSize: '0.8rem', color: 'var(--ink)', backgroundColor: 'var(--paper)' }}
            />
          </span>
          <button type="button" className="icon-btn" onClick={() => void save()} disabled={saving} aria-label={d.budgetEdit.save} title={d.budgetEdit.save} style={{ ...iconBtn, color: 'var(--pine)' }}><Check size={18} /></button>
          <button type="button" className="icon-btn" onClick={cancel} disabled={saving} aria-label={d.budgetEdit.cancel} title={d.budgetEdit.cancel} style={iconBtn}><X size={18} /></button>
        </span>
      ) : (
        <>
          {t(d.phrasing.ofAmount, { spent: formatCurrency(entry.spent), total: formatCurrency(entry.budget) })}
          <button
            type="button" className="icon-btn" onClick={start}
            aria-label={`${d.budgetEdit.edit}: ${entry.name}`} title={d.budgetEdit.edit}
            style={{ ...iconBtn, marginLeft: 8, backgroundColor: 'var(--pine-soft)', color: 'var(--pine)' }}
          >
            <Pencil size={18} />
          </button>
        </>
      )}
      {error && <span role="status" style={{ display: 'block', fontSize: '0.75rem', color: 'var(--wine)' }}>{error}</span>}
    </div>
  );
}

/**
 * One row per budget: name and the editable figure on top, the bar with a
 * marker at where spending would be if even through the year, and under it
 * how much is left (with pace) or over. Wine means over budget and nothing
 * else. Names are user data.
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
        let pace = '';
        if (!over && expected !== null) {
          const tol = e.budget * PACE_TOLERANCE;
          if (e.spent < expected - tol) pace = t(d.budgetPlan.underPaceBy, { amount: formatCurrency(expected - e.spent) });
          else if (e.spent > expected + tol) pace = t(d.budgetPlan.overPaceBy, { amount: formatCurrency(e.spent - expected) });
          else pace = d.budgetPlan.onPace;
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
            {/* Top right: the figure and its modify button. */}
            <RowFigs entry={e} />
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
            {/* Bottom centre, under the bar. */}
            <div className="pb-row-left">
              <span className="font-mono-tab" style={{ color: over ? 'var(--wine)' : 'var(--pine)' }}>
                {t(over ? d.budgetEdit.over : d.budgetEdit.left, { amount: formatCurrency(Math.abs(e.budget - e.spent)) })}
              </span>
              {pace && <span style={{ color: 'var(--ink-soft)', fontWeight: 400 }}>{' · '}{pace}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
