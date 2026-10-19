'use client';

import { useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { renderTemplate } from '@/lib/i18n/RichText';
import { SectionHeader } from '@/components/kit/SectionHeader';
import { InlineBudgetEditor } from './BudgetEditor';
import { BudgetDetails, type BudgetHistory } from './BudgetDetails';
import type { BudgetEntry } from './types';

function UnbudgetedRow({ e, history, today, max }: { e: BudgetEntry; history: BudgetHistory | null; today: string | null; max: number }) {
  const { d } = useTranslation();
  const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const Icon = e.icon;

  return (
    <li className="pb-unb-row pb-bud-unb-row">
      <span className="pb-bud-unb-main">
        <span className="pb-budget-icon" style={{ backgroundColor: `${e.color}20` }}>
          <Icon size={16} style={{ color: e.color }} />
        </span>
        <span className="pb-unb-name">{e.name}</span>
        <span className="font-mono-tab pb-unb-amount">{formatCurrency(e.spent)}</span>
        {/* NEW: how big this is next to the largest, as a hairline in the
            category's own colour - a magnitude, not a limit against a
            budget, so never pine or wine and never a progress track. */}
        <span className="pb-bud-unb-mag" aria-hidden="true">
          <span style={{ width: `${max > 0 ? Math.max(2, (e.spent / max) * 100) : 0}%`, backgroundColor: e.color }} />
        </span>
      </span>
      <span className="pb-bud-unb-actions">
        {editing !== null ? (
          <InlineBudgetEditor name={e.name} initial={editing} onClose={() => setEditing(null)} />
        ) : (
          <>
            <button type="button" className="pb-bud-more" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
              {open ? d.budgetDetails.hide : d.budgetDetails.details}
              <ChevronDown size={14} aria-hidden="true" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform var(--pb-dur-std) var(--pb-ease-out)' }} />
            </button>
            <button type="button" className="pill pb-bud-set" onClick={() => setEditing('')}>
              <Plus size={14} aria-hidden="true" />
              {d.budgetDetails.setBudget}
            </button>
          </>
        )}
      </span>
      {open && (
        <div className="pb-bud-unb-details goal-step">
          <BudgetDetails name={e.name} color={e.color} budget={0} history={history} today={today} onSuggest={(yearly) => setEditing(String(yearly))} />
        </div>
      )}
    </li>
  );
}

/** NEW: a category with no budget and no spending, as a chip that turns into the editor in place. */
function OtherChip({ e }: { e: BudgetEntry }) {
  const { d } = useTranslation();
  const [editing, setEditing] = useState(false);
  const Icon = e.icon;
  if (editing) {
    return (
      <li className="pb-bud-chip is-editing">
        <span className="pb-bud-chip-name">
          <span className="pb-budget-icon pb-bud-chip-icon" style={{ backgroundColor: `${e.color}20` }}>
            <Icon size={13} style={{ color: e.color }} />
          </span>
          <span>{e.name}</span>
        </span>
        <InlineBudgetEditor name={e.name} initial="" onClose={() => setEditing(false)} />
      </li>
    );
  }
  return (
    <li className="pb-bud-chip">
      <button type="button" className="pb-bud-chip-btn" onClick={() => setEditing(true)} aria-label={`${d.budgetDetails.setBudget}: ${e.name}`}>
        <span className="pb-budget-icon pb-bud-chip-icon" style={{ backgroundColor: `${e.color}20` }}>
          <Icon size={13} style={{ color: e.color }} />
        </span>
        <span className="pb-bud-chip-label">{e.name}</span>
        <Plus size={14} className="pb-bud-chip-plus" aria-hidden="true" />
      </button>
    </li>
  );
}

/**
 * Categories with spending this year but no budget - quiet by design, not an
 * overspend - and, collapsed, every other category (no budget, no spending).
 * Each can be given a budget in place. Names are user data.
 */
export function UnbudgetedList({ entries, others, history, today = null }: { entries: BudgetEntry[]; others: BudgetEntry[]; history: BudgetHistory | null; today?: string | null }) {
  const { d, t } = useTranslation();
  const ux = d.ux.budgets;
  const [showOthers, setShowOthers] = useState(false);
  const rows = entries.filter((e) => e.budget === 0 && e.spent > 0).sort((a, b) => b.spent - a.spent);
  if (rows.length === 0 && others.length === 0) return null;
  const total = rows.reduce((s, e) => s + e.spent, 0);
  const max = rows.length > 0 ? rows[0].spent : 0;

  return (
    <section className="card pb-unb pb-bud-unb">
      {rows.length > 0 && (
        <>
          <SectionHeader
            title={d.budgetPlan.unbudgetedTitle}
            subtitle={renderTemplate(rows.length === 1 ? ux.unbSummaryOne : ux.unbSummaryOther, {
              count: <span className="pb-tnum">{rows.length}</span>,
              amount: <span className="font-mono-tab">{formatCurrency(total)}</span>,
            })}
          />
          <ul className="pb-unb-list">
            {rows.map((e) => <UnbudgetedRow key={e.name} e={e} history={history} today={today} max={max} />)}
          </ul>
        </>
      )}
      {others.length > 0 && (
        <div className="pb-bud-others" data-alone={rows.length === 0 ? '' : undefined}>
          <button type="button" className="pb-bud-others-toggle" onClick={() => setShowOthers((v) => !v)} aria-expanded={showOthers}>
            {t(d.budgetDetails.otherTitle, { count: others.length })}
            <ChevronDown size={15} aria-hidden="true" style={{ transform: showOthers ? 'rotate(180deg)' : 'none', transition: 'transform var(--pb-dur-std) var(--pb-ease-out)' }} />
          </button>
          {showOthers && (
            <>
              <p className="pb-bud-others-hint">{d.budgetDetails.otherHint}</p>
              <ul className="pb-bud-chips goal-step">
                {others.map((e) => <OtherChip key={e.name} e={e} />)}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}
