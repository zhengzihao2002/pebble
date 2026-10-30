'use client';

import { useTranslation } from '@/lib/i18n/useTranslation';
import { formatCurrency } from '@/lib/format';
import type { ReactNode } from 'react';

export type CategoryDecision = '' | 'saved' | 'suggested' | 'average6' | 'last12' | 'amount';
export function CategoryPlanChoice({ name, suggested, average6, last12, summary, onChoose }: {
  name: string;
  suggested: number | null; average6: number | null; last12: number | null;
  summary?: ReactNode;
  onChoose: (decision: CategoryDecision, amount?: number) => void;
}) {
  const { d } = useTranslation();
  const x = d.ux.annualBudgets;
  return <div className="pb-category-choice">
    <div className="pb-category-quick-head"><p className="pb-category-quick-title">{x.quickSet}</p><div className="pb-category-amount-summary">{summary}</div></div>
    <div className="pb-category-options" role="group" aria-label={`${x.quickSet}: ${name}`}>
      {([
        { method: 'suggested', label: x.categorySuggested, amount: suggested },
        { method: 'average6', label: x.average6, amount: average6 },
        { method: 'last12', label: x.last12, amount: last12 },
      ] as const).map(option => <button key={option.method} type="button"
        disabled={option.amount === null}
        onClick={() => { if (option.amount !== null) onChoose(option.method, option.amount); }}>
        <span>{option.label}</span>{option.amount !== null && <small className="font-mono-tab">{formatCurrency(option.amount)}</small>}
      </button>)}
    </div>
  </div>;
}
