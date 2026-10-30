'use client';

import type { BudgetRecommendation } from '@/lib/budgets/recommendations';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { formatCurrency } from '@/lib/format';

export function RecommendationEquation({ recommendation: r }: { recommendation: BudgetRecommendation }) {
  const { d, t } = useTranslation();
  const x = d.ux.annualBudgets;
  const c = r.calculation;
  if (!c) return <div className="pb-plan-no-calculation"><strong className="font-mono-tab">{formatCurrency(r.amount)}</strong><p>{r.reason === 'inactiveCategory' ? x.inactiveCategory : r.reason === 'noHistory' ? x.noHistory : r.reason === 'seasonalSpending' ? x.seasonalSpending : x.limitedHistory}</p></div>;
  const guarded = c.keepCurrent || (c.minimumAnnual !== null && c.withBuffer < c.minimumAnnual) || c.withBuffer > 9_999_999_999;
  const result = guarded ? c.withBuffer : r.amount;
  const period = `${r.windowStart} – ${r.windowEnd}`;
  const basis = c.method === 'trend' ? x.equationTrend : c.method === 'spike' ? x.equationSpike : r.sampleMonths === 12 ? x.equationLast12 : t(x.equationAnnualized, { count: String(r.sampleMonths) });
  return <>
    <div className="pb-plan-equation">
      <div className="pb-plan-equation-box"><strong className="font-mono-tab">{formatCurrency(c.basisAnnual)}</strong><small>{basis}</small><small>{period}</small></div>
      <span className="pb-plan-equation-sign" aria-hidden="true">+</span>
      <div className="pb-plan-equation-box"><strong className="font-mono-tab">{formatCurrency(c.bufferAmount)}</strong><small>{t(x.equationRoom, { percent: String(r.bufferPercent) })}</small></div>
      <span className="pb-plan-equation-sign" aria-hidden="true">{result === c.withBuffer ? '=' : '≈'}</span>
      <div className="pb-plan-equation-box pb-plan-equation-result"><strong className="font-mono-tab">{formatCurrency(result)}</strong><small>{guarded ? x.equationCalculated : x.categorySuggested}</small></div>
    </div>
    {c.method === 'trend' && <p className="pb-plan-equation-note">{t(x.equationBlend, { recent: formatCurrency(r.recentAnnual ?? 0), history: formatCurrency(r.baselineAnnual ?? 0) })}</p>}
    {r.excludedSpikeAmount > 0 && <p className="pb-plan-equation-note">{t(x.equationExcluded, { amount: formatCurrency(r.excludedSpikeAmount) })}</p>}
    {guarded ? <p className="pb-plan-equation-note"><strong>{t(x.suggestion, { amount: formatCurrency(r.amount) })}</strong> · {c.keepCurrent ? x.equationKeep : c.withBuffer > 9_999_999_999 ? x.equationCap : x.equationFloor}</p> : result !== c.withBuffer ? <p className="pb-plan-equation-note">{x.equationRounded}</p> : null}
  </>;
}
