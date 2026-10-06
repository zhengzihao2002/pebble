'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { InlineBudgetEditor } from './BudgetEditor';
import { BudgetDetails, type BudgetHistory } from './BudgetDetails';
import type { BudgetEntry } from './types';

function UnbudgetedRow({ e, history }: { e: BudgetEntry; history: BudgetHistory | null }) {
  const { d } = useTranslation();
  const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const Icon = e.icon;

  return (
    <li className="pb-unb-row" style={{ flexWrap: 'wrap' }}>
      <span className="pb-budget-icon" style={{ backgroundColor: `${e.color}20` }}>
        <Icon size={15} style={{ color: e.color }} />
      </span>
      <span className="pb-unb-name">{e.name}</span>
      {e.spent > 0 && <span className="font-mono-tab pb-unb-amount">{formatCurrency(e.spent)}</span>}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
        {editing !== null ? (
          <InlineBudgetEditor name={e.name} initial={editing} onClose={() => setEditing(null)} />
        ) : (
          <>
            {e.spent > 0 && (
              <button
                type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
                style={{ background: 'none', border: 'none', padding: 0, color: 'var(--pine)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                {open ? d.budgetDetails.hide : d.budgetDetails.details}
                <ChevronDown size={14} aria-hidden="true" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform var(--pb-dur-std) var(--pb-ease-out)' }} />
              </button>
            )}
            <button type="button" className="pill" onClick={() => setEditing('')} style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>
              {d.budgetDetails.setBudget}
            </button>
          </>
        )}
      </span>
      {open && (
        <div className="goal-step" style={{ flexBasis: '100%', marginTop: '0.6rem' }}>
          <BudgetDetails name={e.name} color={e.color} budget={0} history={history} onSuggest={(yearly) => setEditing(String(yearly))} />
        </div>
      )}
    </li>
  );
}

/**
 * Categories with spending this year but no budget - quiet by design, not an
 * overspend - and, collapsed, every other category (no budget, no spending).
 * Each can be given a budget in place. Names are user data.
 */
export function UnbudgetedList({ entries, others, history }: { entries: BudgetEntry[]; others: BudgetEntry[]; history: BudgetHistory | null }) {
  const { d, t } = useTranslation();
  const [showOthers, setShowOthers] = useState(false);
  const rows = entries.filter((e) => e.budget === 0 && e.spent > 0).sort((a, b) => b.spent - a.spent);
  if (rows.length === 0 && others.length === 0) return null;

  return (
    <div className="card pb-unb">
      {rows.length > 0 && (
        <>
          <h3 className="pb-stats-title">{d.budgetPlan.unbudgetedTitle}</h3>
          <ul className="pb-unb-list">
            {rows.map((e) => <UnbudgetedRow key={e.name} e={e} history={history} />)}
          </ul>
        </>
      )}
      {others.length > 0 && (
        <div style={{ marginTop: rows.length > 0 ? '1rem' : 0 }}>
          <button
            type="button" onClick={() => setShowOthers((v) => !v)} aria-expanded={showOthers}
            style={{ background: 'none', border: 'none', padding: 0, color: 'var(--ink)', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            {t(d.budgetDetails.otherTitle, { count: others.length })}
            <ChevronDown size={15} aria-hidden="true" style={{ transform: showOthers ? 'rotate(180deg)' : 'none', transition: 'transform var(--pb-dur-std) var(--pb-ease-out)' }} />
          </button>
          {showOthers && (
            <>
              <p style={{ margin: '0.3rem 0 0.4rem', fontSize: '0.78rem', color: 'var(--ink-soft)' }}>{d.budgetDetails.otherHint}</p>
              <ul className="pb-unb-list goal-step">
                {others.map((e) => <UnbudgetedRow key={e.name} e={e} history={history} />)}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
