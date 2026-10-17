'use client';

import Link from 'next/link';
import { ChevronRight, PiggyBank } from 'lucide-react';
import type { CategoryMeta, Transaction } from '@/types';
import { computeCategorySpent } from '@/lib/stats';
import { BudgetRow } from '@/components/shared/BudgetRow';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { renderTemplate } from '@/lib/i18n/RichText';
import { PACE_TOLERANCE, yearFraction } from '@/lib/budgetPace';
import { ymdOf } from '@/lib/periodCompare';
import { SectionHeader } from '@/components/kit/SectionHeader';
import { EmptyState } from '@/components/kit/EmptyState';
import { RowsSkeleton } from './DashSkeletons';

interface NeedsAttentionCardProps {
  transactions: Transaction[];
  categoryMeta: CategoryMeta;
  /** Zone-aware today from DashboardClient; null until resolved. */
  today?: Date | null;
}

export function NeedsAttentionCard({ transactions, categoryMeta, today = null }: NeedsAttentionCardProps) {
  const { d } = useTranslation();
  const ux = d.ux.dashboard;

  const header = (
    <SectionHeader
      title={d.needsAttention.title}
      actions={<Link href="/budgets" prefetch={false} className="link-btn">{d.common.seeAll} <ChevronRight size={14} /></Link>}
    />
  );

  // The zone-aware today every sibling card uses, rather than getToday(): the
  // year (and the pace marker) follow the Settings time-zone override too.
  if (!today) {
    return <section className="card pb-dash-card pb-dash-attention">{header}<RowsSkeleton rows={3} minHeight={160} /></section>;
  }

  // Budgets are annual, so "spent" is always the CURRENT year - read per
  // render rather than from a module-load constant, which would keep showing
  // last year's totals for as long as the container stayed warm into January.
  const categorySpent = computeCategorySpent(transactions, today.getFullYear());
  const yf = yearFraction(ymdOf(today));

  const topBudgets = Object.entries(categoryMeta)
    .map(([name, meta]) => {
      const spent = categorySpent[name] || 0;
      const pct = meta.budget > 0 ? (spent / meta.budget) * 100 : (spent > 0 ? 100 : 0);
      return { name, ...meta, spent, pct };
    })
    .filter((e) => e.budget > 0 || e.spent > 0)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 4);

  const money = (n: number) => <span className="pb-money">{formatCurrency(n)}</span>;

  // The Budgets page's status words: over budget, then over / under / on pace.
  const statusOf = (b: (typeof topBudgets)[number]) => {
    if (b.budget <= 0) return { text: ux.noBudget, color: 'var(--ink-soft)' };
    const expected = b.budget * yf;
    if (b.spent > b.budget) return { text: renderTemplate(d.budgetPlan.overBudgetBy, { amount: money(b.spent - b.budget) }), color: 'var(--wine)' };
    if (Math.abs(b.spent - expected) <= PACE_TOLERANCE * b.budget) return { text: d.budgetPlan.onPace, color: 'var(--pine)' };
    return b.spent > expected
      ? { text: renderTemplate(d.budgetPlan.overPaceBy, { amount: money(b.spent - expected) }), color: 'var(--gold)' }
      : { text: renderTemplate(d.budgetPlan.underPaceBy, { amount: money(expected - b.spent) }), color: 'var(--pine)' };
  };

  return (
    <section className="card pb-dash-card pb-dash-attention">
      {header}
      {topBudgets.length === 0 ? (
        <EmptyState
          compact icon={PiggyBank} title={d.budgetPlan.noBudgets}
          action={<Link href="/budgets" prefetch={false} className="btn-primary pb-dash-cta">{ux.setBudgets}</Link>}
        />
      ) : (
        <div className="pb-dash-budgets">
          {topBudgets.map((b) => {
            const s = statusOf(b);
            return (
              <BudgetRow
                key={b.name} {...b}
                yearFraction={yf}
                status={s.text} statusColor={s.color}
                markerLabel={ux.paceMarker}
                markerTip={renderTemplate(d.budgetPlan.expectedByToday, { amount: money(b.budget * yf) })}
                note={renderTemplate(d.budgetRow.spent, { amount: <span className="font-mono-tab">{formatCurrency(b.spent)}</span> })}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
