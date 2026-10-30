'use client';

import { useTranslation } from '@/lib/i18n/useTranslation';
import { formatCurrency } from '@/lib/format';

export type CategoryDecision = '' | 'saved' | 'suggested' | 'average6' | 'last12' | 'same' | 'amount';
export function CategoryPlanChoice({ name, current, decision, suggested, average6, last12, onChoose }: {
  name: string; current: number; decision: CategoryDecision;
  suggested: number | null; average6: number | null; last12: number | null;
  onChoose: (decision: CategoryDecision, amount?: number) => void;
}) {
  const { d, t } = useTranslation();
  const x = d.ux.annualBudgets;
  return <div className="pb-category-choice">
    <p className="pb-category-quick-title">{x.quickSet}</p>
    <div className="pb-category-options" role="radiogroup" aria-label={t(x.chooseCategory, { name })}
      onKeyDown={event => {
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
        const index = buttons.indexOf(event.target as HTMLButtonElement);
        if (index < 0) return;
        const next = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? (index + 1) % buttons.length
          : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? (index + buttons.length - 1) % buttons.length
          : event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : null;
        if (next !== null) { event.preventDefault(); buttons[next].focus(); buttons[next].click(); }
      }}>
      {([
        { method: 'suggested', label: x.categorySuggested, amount: suggested },
        { method: 'average6', label: x.average6, amount: average6 },
        { method: 'last12', label: x.last12, amount: last12 },
        { method: 'same', label: x.keepSame, amount: current },
      ] as const).map(option => <button key={option.method} type="button" role="radio"
        aria-checked={decision === option.method} disabled={option.amount === null}
        onClick={() => { if (option.amount !== null) onChoose(option.method, option.amount); }}>
        <span>{option.label}</span>{option.amount !== null && <small className="font-mono-tab">{formatCurrency(option.amount)}</small>}
      </button>)}
    </div>
  </div>;
}
