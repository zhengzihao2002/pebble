'use client';

import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import type { Transaction } from '@/types';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { formatCurrency } from '@/lib/format';
import { IncomeControl } from './IncomeControl';
import { useBudgetIncome } from './useBudgetIncome';

/** Lives immediately before category editing so the same summary can stay in view. */
export function AnnualPlanBalance({ year, budget, transactions, today }: { year: number; budget: number; transactions: Transaction[]; today: string }) {
  const { d, t } = useTranslation();
  const x = d.ux.annualBudgets;
  const { estimate, control } = useBudgetIncome(transactions, today);
  const income = control.effectiveAnnual;
  const safeBudget = Number.isFinite(budget) ? Math.max(0, budget) : 0;
  const known = income !== null && Number.isFinite(income) && income >= 0;
  const savings = known ? Math.round((income - safeBudget) * 100) / 100 : null;
  const shortfall = savings !== null && savings < 0;
  const scale = Math.max(income ?? 0, safeBudget, 1);
  const budgetShare = known ? Math.min(income, safeBudget) / scale * 100 : 0;
  const savingsShare = known ? Math.max(0, income - safeBudget) / scale * 100 : 0;
  const deficitShare = known ? Math.max(0, safeBudget - income) / scale * 100 : 0;
  return <>
    <details className="pb-annual-income-settings">
      <summary><SlidersHorizontal size={14} aria-hidden="true" /><span>{x.balanceIncomeSettings}</span><small>{control.mode === 'manual' ? d.ux.budgets.modeManual : estimate?.monthsLabel ?? d.ux.budgets.modeSystem}</small><ChevronDown size={14} aria-hidden="true" /></summary>
      <div className="card"><IncomeControl {...control} /></div>
    </details>
    <section className="card pb-annual-balance" aria-label={t(x.balanceTitle, { year: String(year) })}>
      <div className="pb-annual-balance-heading"><span>{t(x.balanceTitle, { year: String(year) })}</span><small>{x.balanceEstimated}</small></div>
      <div className="pb-annual-balance-track pb-chart-fade" role="img" aria-label={known ? t(shortfall ? x.balanceDeficitSummary : x.balanceSummary, { income: formatCurrency(income), budget: formatCurrency(safeBudget), savings: formatCurrency(Math.abs(savings ?? 0)) }) : x.balanceNeedsIncome}>
        <span className="pb-annual-balance-budget" style={{ width: `${budgetShare}%` }} />
        <span className="pb-annual-balance-saved" style={{ width: `${savingsShare}%` }} />
        <span className="pb-annual-balance-deficit" style={{ width: `${deficitShare}%` }} />
      </div>
      <dl className="pb-annual-balance-figures">
        <div><dt>{x.balanceIncome}</dt><dd className="font-mono-tab">{known ? formatCurrency(income) : '—'}</dd></div>
        <div data-tone="budget"><dt><i aria-hidden="true" />{x.balanceBudget}</dt><dd className="font-mono-tab">{formatCurrency(safeBudget)}</dd></div>
        <div data-tone={shortfall ? 'deficit' : 'saved'}><dt><i aria-hidden="true" />{shortfall ? x.balanceShortfall : x.balanceSavings}</dt><dd className="font-mono-tab">{savings !== null ? formatCurrency(Math.abs(savings)) : '—'}</dd></div>
      </dl>
      {!known && <p className="pb-annual-balance-note">{x.balanceNeedsIncome}</p>}
    </section>
  </>;
}
