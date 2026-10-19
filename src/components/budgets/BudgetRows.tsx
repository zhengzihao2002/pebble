'use client';

import { useState } from 'react';
import { Check, ChevronDown, CircleAlert, Pencil, TrendingDown, TrendingUp } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { renderTemplate } from '@/lib/i18n/RichText';
import { yearFraction } from '@/lib/budgetPace';
import { SectionHeader } from '@/components/kit/SectionHeader';
import { Skeleton } from '@/components/kit/Skeleton';
import { InlineBudgetEditor } from './BudgetEditor';
import { BudgetDetails, type BudgetHistory } from './BudgetDetails';
import { MiniSpark } from './MiniSpark';
import { paceStatus, type PaceStatus } from './pace';
import type { BudgetEntry } from './types';

interface BudgetRowsProps {
  entries: BudgetEntry[];
  /** Zone-aware 'YYYY-MM-DD', or null for the first frame. */
  today: string | null;
  history: BudgetHistory | null;
}

const GROUP_ICON: Record<PaceStatus, typeof Check> = {
  over: CircleAlert, overPace: TrendingUp, onPace: Check, underPace: TrendingDown,
};

/** This year's months (January first) from the history, null after the current one. */
function thisYear(history: BudgetHistory, name: string): { values: (number | null)[]; current: number } {
  const year = history.current.slice(0, 4);
  const current = Number(history.current.slice(5, 7)) - 1;
  const series = history.byCat[name];
  const indexOf = new Map(history.months.map((k, i) => [k, i]));
  const values = Array.from({ length: 12 }, (_, mi) => {
    if (mi > current) return null;
    const i = indexOf.get(`${year}-${String(mi + 1).padStart(2, '0')}`);
    return series && i !== undefined ? series[i] : 0;
  });
  return { values, current };
}

function BudgetRow({ e, fraction, history, today }: { e: BudgetEntry; fraction: number | null; history: BudgetHistory | null; today: string | null }) {
  const { d, t } = useTranslation();
  const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const Icon = e.icon;
  const over = e.spent > e.budget;
  const expected = fraction === null ? null : e.budget * fraction;
  let pace = '';
  if (!over && expected !== null) {
    const status = paceStatus(e.spent, e.budget, fraction as number);
    if (status === 'underPace') pace = t(d.budgetPlan.underPaceBy, { amount: formatCurrency(expected - e.spent) });
    else if (status === 'overPace') pace = t(d.budgetPlan.overPaceBy, { amount: formatCurrency(e.spent - expected) });
    else pace = d.budgetPlan.onPace;
  }
  const fill = Math.min((e.spent / e.budget) * 100, 100);
  const spark = history ? thisYear(history, e.name) : null;

  return (
    <div className={`pb-row pb-bud-row${editing !== null ? ' is-editing' : ''}`}>
      {/* Name, with the yearly budget and its monthly share as a quiet subtitle. */}
      <div className="pb-row-name">
        <span className="pb-budget-icon" style={{ backgroundColor: `${e.color}20` }}>
          <Icon size={16} style={{ color: e.color }} />
        </span>
        <span className="pb-bud-row-title">
          <span className="pb-bud-row-name">{e.name}</span>
          <span className="pb-bud-row-sub">
            <span className="font-mono-tab">{t(d.budgetRow.yearly, { amount: formatCurrency(e.budget) })}</span>
            <span aria-hidden="true">{' · '}</span>
            <span className="font-mono-tab">{t(d.budgetRow.monthly, { amount: formatCurrency(e.budget / 12) })}</span>
          </span>
        </span>
      </div>
      <div className="pb-bud-row-spark">
        {spark && <MiniSpark values={spark.values} currentIndex={spark.current} color={e.color} monthlyBudget={e.budget / 12} />}
      </div>
      {/* Right: what is left (or over) as the row's figure, the modify button beside it. */}
      <div className="pb-row-figs">
        {editing !== null ? (
          <InlineBudgetEditor name={e.name} initial={editing} onClose={() => setEditing(null)} />
        ) : (
          <span className="pb-bud-row-figs">
            <span className={`font-mono-tab pb-bud-row-left${over ? ' is-over' : ''}`}>
              {renderTemplate(over ? d.budgetEdit.over : d.budgetEdit.left, {
                amount: <span className="pb-bud-row-amt">{formatCurrency(Math.abs(e.budget - e.spent))}</span>,
              })}
            </span>
            <button
              type="button" className="icon-btn pb-bud-edit" onClick={() => setEditing(String(e.budget))}
              aria-label={`${d.budgetEdit.edit}: ${e.name}`} title={d.budgetEdit.edit}
            >
              <Pencil size={15} />
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
      {/* Under the bar: what has been spent, then the pace. */}
      <div className="pb-row-left">
        <span className="font-mono-tab" style={{ color: 'var(--ink)' }}>
          {t(d.budgetRow.spent, { amount: formatCurrency(e.spent) })}
        </span>
        {pace && <span className="pb-bud-row-pace">{' · '}<span className="font-mono-tab">{pace}</span></span>}
      </div>
      <div className="pb-row-more">
        <button type="button" className="pb-bud-more" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? d.budgetDetails.hide : d.budgetDetails.details}
          <ChevronDown size={14} aria-hidden="true" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform var(--pb-dur-std) var(--pb-ease-out)' }} />
        </button>
      </div>
      {open && (
        <div className="pb-row-details goal-step">
          <BudgetDetails
            name={e.name} color={e.color} budget={e.budget} history={history} today={today}
            onSuggest={(yearly) => setEditing(String(yearly))}
          />
        </div>
      )}
    </div>
  );
}

/**
 * One row per yearly budget: name with the yearly budget and its monthly
 * share, this year's months as a strip, what is left (or over) with a modify
 * button; the bar with a marker at where spending would be if even through
 * the year; under it what has been spent and the pace; and an expandable
 * history with Quick set. Wine means over budget and nothing else. Names are
 * user data.
 *
 * NEW: sections. Every row's pace is judged against the same share of the
 * year, with a tolerance proportional to its own budget, so the sort below
 * (share of budget used) already lines rows up as over budget, over pace, on
 * pace, under pace. The headers are laid over runs of that order - never a
 * re-sort - and stick under the page header while their rows scroll.
 */
export function BudgetRows({ entries, today, history }: BudgetRowsProps) {
  const { d, t } = useTranslation();
  const ux = d.ux.budgets;
  // Most of its budget used first, so bars shorten down the page and anything
  // near or over its limit is on top. Ties fall back to the larger budget.
  const rows = entries.filter((e) => e.budget > 0)
    .sort((a, b) => (b.spent / b.budget) - (a.spent / a.budget) || b.budget - a.budget);
  if (rows.length === 0) return null;
  const fraction = today ? yearFraction(today) : null;

  const header = (
    <div className="pb-bud-rows-head">
      <SectionHeader
        title={ux.rowsTitle}
        subtitle={(
          <p className="pb-rows-note">
            <span className="pb-tnum">{rows.length === 1 ? ux.groupCountOne : t(ux.groupCount, { count: rows.length })}</span>
            {' · '}{d.budgetRow.yearlyNote}{' · '}{d.budgetPlan.sortedBy}
          </p>
        )}
        actions={<span className="pb-bud-key"><span className="pb-bud-key-tick" aria-hidden="true" />{ux.paceKey}</span>}
      />
    </div>
  );

  // First frame (today unknown): the rows' shape, not bars without markers.
  if (fraction === null) {
    return (
      <section className="card pb-rows pb-bud-rows">
        {header}
        <p className="pb-bud-sr" role="status">{ux.loading}</p>
        {rows.slice(0, 6).map((e) => (
          <div key={e.name} className="pb-bud-skel-row" aria-hidden="true">
            <Skeleton width={36} height={36} radius="0.7rem" />
            <span className="pb-bud-skel-lines">
              <Skeleton width="38%" height="0.85rem" />
              <Skeleton width="100%" height="8px" radius="99px" />
            </span>
          </div>
        ))}
      </section>
    );
  }

  // Runs of one status, in the sorted order.
  const groups: { status: PaceStatus; rows: BudgetEntry[] }[] = [];
  for (const e of rows) {
    const status = paceStatus(e.spent, e.budget, fraction);
    const last = groups[groups.length - 1];
    if (last && last.status === status) last.rows.push(e);
    else groups.push({ status, rows: [e] });
  }
  const groupLabel: Record<PaceStatus, string> = {
    over: ux.groupOver, overPace: d.budgetPlan.overPace, onPace: d.budgetPlan.onPace, underPace: d.budgetPlan.underPace,
  };

  return (
    <section className="card pb-rows pb-bud-rows">
      {header}
      {groups.map((g) => {
        const Icon = GROUP_ICON[g.status];
        const total = g.rows.reduce((s, e) => s + (g.status === 'over' ? e.spent - e.budget : e.budget - e.spent), 0);
        return (
          <div key={g.status} className="pb-bud-group" data-status={g.status}>
            <div className="pb-bud-group-head">
              <span className="pb-bud-group-title">
                <span className="pb-bud-group-icon" aria-hidden="true"><Icon size={12} strokeWidth={2.6} /></span>
                {groupLabel[g.status]}
                <span className="pb-bud-group-count pb-tnum">{g.rows.length}</span>
              </span>
              <span className="pb-bud-group-sum font-mono-tab">
                {t(g.status === 'over' ? d.budgetEdit.over : d.budgetEdit.left, { amount: formatCurrency(total) })}
              </span>
            </div>
            {g.rows.map((e) => <BudgetRow key={e.name} e={e} fraction={fraction} history={history} today={today} />)}
          </div>
        );
      })}
    </section>
  );
}
