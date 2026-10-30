'use client';

import { useRef, useState } from 'react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { formatCurrency } from '@/lib/format';

export type CategoryDecision = '' | 'saved' | 'suggested' | 'average6' | 'last12' | 'same' | 'amount' | 'percent' | 'pendingPercent';
export function CategoryPlanChoice({ name, current, decision, suggested, average6, last12, onChoose }: {
  name: string; current: number; decision: CategoryDecision;
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
    const amount = method === 'suggested' ? suggested : method === 'average6' ? average6 : method === 'last12' ? last12 : current;
    if (amount !== null && Number.isFinite(amount)) onChoose(method, amount);
  };
  const apply = () => {
    const n = Number(percent);
    if (percent.trim() === '' || !Number.isFinite(n) || n < -100 || n > 1000) { setError(true); return; }
    setError(false); onChoose('percent', Math.min(9_999_999_999, Math.round(current * (1 + n/100))));
  };
  return <div className="pb-category-choice">
    <div className="pb-category-options" role="radiogroup" aria-label={t(x.chooseCategory, { name })}>
      {([
        {method:'suggested',label:x.categorySuggested,amount:suggested},
        {method:'average6',label:x.average6,amount:average6},
        {method:'last12',label:x.last12,amount:last12},
        {method:'same',label:x.keepSame,amount:current},
        {method:'percent',label:x.categoryPercent},
      ] as {method:CategoryDecision;label:string;amount?:number|null}[]).map(option => <button key={option.method} type="button" role="radio"
        aria-checked={decision === option.method || (option.method === 'percent' && decision === 'pendingPercent')}
        disabled={option.amount === null} onClick={() => choose(option.method)}>
        <span>{option.label}</span>{option.amount !== undefined && option.amount !== null && <small className="font-mono-tab">{formatCurrency(option.amount)}</small>}
      </button>)}
    </div>
    {(decision === 'percent' || decision === 'pendingPercent') && <div className="pb-category-percent">
      <label><span className="sr-only">{t(x.percentFor, { name })}</span><input ref={input} type="number" min="-100" max="1000" step="0.1" value={percent} onChange={e => { setPercent(e.target.value); onChoose('pendingPercent'); }} onKeyDown={e => { if(e.key==='Enter'){ e.preventDefault(); apply(); } }} /><span aria-hidden="true">%</span></label>
      <button type="button" className="pill" onClick={apply}>{x.applyAdjustment}</button>
    </div>}
    {(decision === 'percent' || decision === 'pendingPercent') && <small className="pb-category-percent-hint">{x.percentRounding}</small>}
    {error && <small role="alert">{x.invalidPercent}</small>}
  </div>;
}
