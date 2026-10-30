'use client';

import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import { useId, useLayoutEffect, useRef, useState } from 'react';
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
  const [incomeOpen, setIncomeOpen] = useState(false);
  const [incomeVisited, setIncomeVisited] = useState(false);
  const [stuck, setStuck] = useState(false);
  const balanceRef = useRef<HTMLElement>(null);
  const incomeId = useId();
  useLayoutEffect(() => {
    const bar = balanceRef.current;
    const parent = bar?.parentElement;
    const area = bar?.closest('.pebble-main-content') ?? bar?.closest('main');
    const root = bar?.closest('.pebble-root');
    if (!bar || !parent || !area || !root) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const content = parent.getBoundingClientRect();
      const available = area.getBoundingClientRect();
      bar.style.setProperty('--balance-bleed-left', `${Math.max(0, content.left - available.left)}px`);
      bar.style.setProperty('--balance-bleed-right', `${Math.max(0, available.right - content.right)}px`);
      const top = parseFloat(getComputedStyle(bar).top) || 0;
      setStuck(bar.getBoundingClientRect().top <= top + .5);
    };
    const queue = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(queue);
    observer.observe(parent);
    observer.observe(area);
    const header = root.querySelector('.pebble-header');
    if (header) observer.observe(header);
    root.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', queue);
    queue();
    return () => {
      observer.disconnect(); cancelAnimationFrame(frame);
      root.removeEventListener('scroll', queue); window.removeEventListener('scroll', queue); window.removeEventListener('resize', queue);
    };
  }, []);
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
    <div className="pb-annual-income-settings" data-open={incomeOpen}>
      <button type="button" className="pb-annual-income-toggle" aria-expanded={incomeOpen} aria-controls={incomeId}
        onClick={() => { setIncomeVisited(true); setIncomeOpen(value => !value); }}><SlidersHorizontal size={14} aria-hidden="true" /><span>{x.balanceIncomeSettings}</span><small>{control.mode === 'manual' ? d.ux.budgets.modeManual : estimate?.monthsLabel ?? d.ux.budgets.modeSystem}</small><ChevronDown size={14} aria-hidden="true" /></button>
      <div id={incomeId} className="pb-annual-income-reveal" inert={!incomeOpen} aria-hidden={!incomeOpen}><div>
        {incomeVisited && <div className="card"><IncomeControl {...control} /></div>}
      </div></div>
    </div>
    <section ref={balanceRef} className="pb-annual-balance" data-stuck={stuck} aria-label={t(x.balanceTitle, { year: String(year) })}>
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
