'use client';

import type { ReactNode } from 'react';
import type { BudgetRecommendation } from '@/lib/budgets/recommendations';
import { recommendationAdjustments } from '@/lib/budgets/recommendationExplanation';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { formatCurrency } from '@/lib/format';

function Box({ amount, label, detail, final = false }: { amount: number; label: string; detail?: ReactNode; final?: boolean }) {
  return <div className={`pb-plan-equation-box${final ? ' pb-plan-equation-result' : ''}`} data-final={final || undefined}>
    <strong className="font-mono-tab">{formatCurrency(amount)}</strong><small>{label}</small>{detail && <small>{detail}</small>}
  </div>;
}

/** Every path ends at the actual suggestion, including holds, limits and rounding. */
export function RecommendationEquation({ recommendation: r, current }: { recommendation: BudgetRecommendation; current: number }) {
  const { d, t } = useTranslation();
  const x = d.ux.annualBudgets;
  const c = r.calculation;
  const period = `${r.windowStart} – ${r.windowEnd}`;
  if (!c) {
    const quiet = r.reason === 'inactiveCategory';
    const reason = quiet ? x.traceQuiet : r.reason === 'noHistory' ? x.traceNoHistory : r.reason === 'seasonalSpending' ? x.tracePartialSeason : x.traceLimited;
    return <div className="pb-plan-equation pb-plan-equation-hold">
      <Box amount={quiet ? r.recordedTotal : current} label={quiet ? x.traceQuietBasis : x.thisYear} detail={quiet ? period : undefined} />
      <span className="pb-plan-equation-sign" aria-hidden="true">→</span>
      <Box amount={r.amount} label={x.categorySuggested} detail={reason} final />
    </div>;
  }
  const steps = recommendationAdjustments(r, current);
  const basis = c.method === 'trend' ? x.equationTrend : c.method === 'spike' ? x.equationSpike : r.sampleMonths === 12 ? x.equationLast12 : t(x.equationAnnualized, { count: String(r.sampleMonths) });
  const basisFormula = c.method === 'spike'
    ? `(${formatCurrency(r.recordedTotal)} − ${formatCurrency(r.excludedSpikeAmount)}) ÷ ${r.sampleMonths} × 12`
    : c.method === 'history' && r.sampleMonths !== 12 && r.recordedTotal !== c.basisAnnual
      ? `${formatCurrency(r.recordedTotal)} ÷ ${r.sampleMonths} × 12` : null;
  const labels = { keep: x.traceKeep, limitCut: x.traceLimitCut, seasonal: x.traceSeasonal, spike: x.traceSpike, round: x.equationRounded, cap: x.equationCap };
  // Round displayed weighted contributions to cents, assigning the possible
  // one-cent residual to history so the displayed sum equals the actual basis.
  const recentPart = Math.round((r.recentAnnual ?? 0) * 70) / 100;
  const historyPart = (Math.round(c.basisAnnual * 100) - Math.round(recentPart * 100)) / 100;
  const centAdjustment = (Math.round(historyPart * 100) - Math.round((r.baselineAnnual ?? 0) * 30)) / 100;
  const endMonth = Number(r.windowEnd.slice(0, 4)) * 12 + Number(r.windowEnd.slice(5, 7)) - 1;
  const recentStart = `${Math.floor((endMonth - 2) / 12)}-${String((endMonth - 2) % 12 + 1).padStart(2, '0')}`;
  return <div className="pb-plan-calculation-trace">
    {c.method === 'trend' && <div className="pb-plan-equation">
      <Box amount={recentPart} label={x.traceRecentWeight} detail={<>{formatCurrency(r.recentAnnual ?? 0)} × 70%<br />{recentStart} – {r.windowEnd}</>} />
      <span className="pb-plan-equation-sign" aria-hidden="true">+</span>
      <Box amount={historyPart} label={x.traceHistoryWeight} detail={<>{formatCurrency(r.baselineAnnual ?? 0)} × 30%{centAdjustment !== 0 && <> {centAdjustment < 0 ? '−' : '+'} {formatCurrency(Math.abs(centAdjustment))} ({x.traceCentRounding})</>}<br />{period}</>} />
      <span className="pb-plan-equation-sign" aria-hidden="true">=</span>
      <Box amount={c.basisAnnual} label={x.equationTrend} />
    </div>}
    <div className="pb-plan-equation">
      <Box amount={c.basisAnnual} label={basis} detail={c.method === 'trend' ? undefined : <>{period}{basisFormula && <><br />{basisFormula}</>}</>} />
      <span className="pb-plan-equation-sign" aria-hidden="true">+</span>
      <Box amount={c.bufferAmount} label={t(x.equationRoom, { percent: String(r.bufferPercent) })} />
      <span className="pb-plan-equation-sign" aria-hidden="true">=</span>
      <Box amount={c.withBuffer} label={steps.length ? x.traceWithRoom : x.categorySuggested} final={!steps.length} />
    </div>
    {steps.map((step, index) => <div className="pb-plan-equation" key={step.kind}>
      <Box amount={step.from} label={index === 0 ? x.traceWithRoom : x.traceAdjusted} />
      <span className="pb-plan-equation-sign" aria-hidden="true">{step.delta < 0 ? '−' : '+'}</span>
      <Box amount={Math.abs(step.delta)} label={labels[step.kind]} />
      <span className="pb-plan-equation-sign" aria-hidden="true">=</span>
      <Box amount={step.to} label={index === steps.length - 1 ? x.categorySuggested : x.traceAdjusted} final={index === steps.length - 1} />
    </div>)}
  </div>;
}
