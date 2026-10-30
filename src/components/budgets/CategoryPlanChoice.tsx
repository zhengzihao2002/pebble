'use client';

import { useRef, useState } from 'react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { formatCurrency } from '@/lib/format';

export type CategoryDecision = '' | 'saved' | 'suggested' | 'average6' | 'last12' | 'same' | 'amount' | 'percent' | 'pendingPercent';
export function CategoryPlanChoice({ name, current, value, decision, suggested, average6, last12, onChoose }: {
  name: string; current: number; value: string; decision: CategoryDecision;
  suggested: number | null; average6: number | null; last12: number | null;
  onChoose: (decision: CategoryDecision, amount?: number) => void;
}) {
  const { d, t } = useTranslation();
  const x = d.ux.annualBudgets;
  const [percent, setPercent] = useState('0');
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState(false);
  const choose = (method: CategoryDecision) => {
    setError(false);
    if (method === 'percent') { onChoose('pendingPercent'); requestAnimationFrame(() => input.current?.focus()); return; }
    if (method === 'amount' && value.trim() === '') { onChoose('amount'); return; }
    const amount = method === 'suggested' ? suggested : method === 'average6' ? average6 : method === 'last12' ? last12 : method === 'same' ? current : Number(value);
    if (amount !== null && Number.isFinite(amount)) onChoose(method, amount);
  };
  const apply = () => {
    const n = Number(percent);
    if (percent.trim() === '' || !Number.isFinite(n) || n < -100 || n > 1000) { setError(true); return; }
    setError(false); onChoose('percent', Math.min(9_999_999_999, Math.round(current * (1 + n/100))));
  };
  return <div className="pb-category-choice">
    <label><span className="sr-only">{t(x.chooseCategory, { name })}</span>
      <select value={decision === 'pendingPercent' ? 'percent' : decision} onChange={e => choose(e.target.value as CategoryDecision)}>
        <option value="" disabled>{x.chooseBasis}</option>
        {decision === 'saved' && <option value="saved">{x.savedAmount}</option>}
        <option value="suggested" disabled={suggested === null}>{x.categorySuggested}{suggested !== null ? ` · ${formatCurrency(suggested)}` : ''}</option>
        <option value="average6" disabled={average6 === null}>{x.average6}{average6 !== null ? ` · ${formatCurrency(average6)}` : ''}</option>
        <option value="last12" disabled={last12 === null}>{x.last12}{last12 !== null ? ` · ${formatCurrency(last12)}` : ''}</option>
        <option value="same">{x.keepSame}</option><option value="percent">{x.categoryPercent}</option><option value="amount">{x.categoryAmount}</option>
      </select>
    </label>
    {(decision === 'percent' || decision === 'pendingPercent') && <div className="pb-category-percent">
      <label><span className="sr-only">{t(x.percentFor, { name })}</span><input ref={input} type="number" min="-100" max="1000" step="0.1" value={percent} onChange={e => { setPercent(e.target.value); onChoose('pendingPercent'); }} onKeyDown={e => { if(e.key==='Enter'){ e.preventDefault(); apply(); } }} /><span aria-hidden="true">%</span></label>
      <button type="button" className="pill" onClick={apply}>{x.applyAdjustment}</button>
    </div>}
    {(decision === 'percent' || decision === 'pendingPercent') && <small className="pb-category-percent-hint">{x.percentRounding}</small>}
    {error && <small role="alert">{x.invalidPercent}</small>}
  </div>;
}
