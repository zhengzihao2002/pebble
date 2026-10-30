'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, CalendarCheck, Check } from 'lucide-react';
import type { CategoryItem } from '@/lib/data/mappers';
import type { RecurringRule, Transaction } from '@/types';
import type { AnnualPlannerData, AnnualPlan } from '@/lib/budgets/annualTypes';
import { recommendAnnualBudgets } from '@/lib/budgets/recommendations';
import { saveAnnualPlanAction, cancelAnnualPlanAction } from '@/lib/actions/annualBudgets';
import { callAction } from '@/lib/actions/callAction';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { categoryLabel } from '@/lib/i18n/enumLabels';
import { resolveCategoryIcon } from '@/lib/data/icons';
import { formatCurrency } from '@/lib/format';
import { todayInZone } from '@/lib/recurring/occurrences';
import { AmountInput } from '@/components/shared/AmountInput';
import { CategoryPlanChoice, type CategoryDecision } from '@/components/budgets/CategoryPlanChoice';
import { budgetQuickSet, budgetHistoryThroughToday } from '@/lib/budgets/spendingProjection';
import { BudgetDetails, type BudgetHistory } from '@/components/budgets/BudgetDetails';
import { AnnualPlanCharts } from '@/components/budgets/AnnualPlanCharts';
import { CategoryPlanDetails } from '@/components/budgets/CategoryPlanDetails';
import { RecommendationEquation } from '@/components/budgets/RecommendationEquation';
import { SectionHeader } from '@/components/kit/SectionHeader';

const MAX_AMOUNT = 9_999_999_999;

function amountStrings(categories: CategoryItem[], amounts: Record<string, number>) {
  return Object.fromEntries(categories.map(c => [c.id, String(amounts[c.id] ?? 0)]));
}
function changePercent(amount: number, baseline: number) {
  return baseline > 0 ? ((amount - baseline) / baseline) * 100 : null;
}
function signedPercent(value: number) {
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(1).replace(/\.0$/, '')}`;
}

export function AnnualPlannerClient({ data, categories, transactions, today, recurringRules }: {
  data: AnnualPlannerData; categories: CategoryItem[]; transactions: Transaction[]; today: string; recurringRules?: RecurringRule[];
}) {
  const { d, t } = useTranslation();
  const x = d.ux.annualBudgets;
  const router = useRouter();
  const year = data.year + 1;
  const [savedPlan, setSavedPlan] = useState<AnnualPlan | null>(data.plan);
  const [values, setValues] = useState(() => amountStrings(categories, data.plan?.amounts ?? data.currentAmounts));
  const [baseAmounts, setBaseAmounts] = useState(data.plan?.baseAmounts ?? data.currentAmounts);
  const [decisions, setDecisions] = useState<Record<string, CategoryDecision>>(() => Object.fromEntries(categories.map(c => [c.id, data.plan?.state === 'scheduled' && data.plan.amounts[c.id] !== undefined ? 'saved' : ''])));
  const [saving, setSaving] = useState(false);
  const [review, setReview] = useState<'cancel' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadNeeded, setReloadNeeded] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const suggestions = useMemo(() => recommendAnnualBudgets({ transactions, categories, currentAmounts: data.currentAmounts, today, recurringRules }), [transactions, categories, data.currentAmounts, today, recurringRules]);
  const recommendations = useMemo(() => new Map(suggestions.map(r => [r.categoryId, r])), [suggestions]);
  const history = useMemo<BudgetHistory>(() => budgetHistoryThroughToday(transactions, today), [transactions, today]);
  const savedValues = amountStrings(categories, savedPlan?.amounts ?? data.currentAmounts);
  const dirty = categories.some(c => values[c.id] !== savedValues[c.id]);
  const chosen = categories.filter(c => decisions[c.id]).length;
  const allChosen = chosen === categories.length;

  const baseChanged = savedPlan !== null && categories.some(c => (savedPlan.baseAmounts[c.id] ?? 0) !== (data.currentAmounts[c.id] ?? 0));
  const amounts = Object.fromEntries(categories.map(c => [c.id, Number(values[c.id])]));
  const valid = categories.every(c => values[c.id]?.trim() !== '' && Number.isFinite(amounts[c.id]) && amounts[c.id] >= 0 && amounts[c.id] <= MAX_AMOUNT);
  const currentTotal = categories.reduce((sum, c) => sum + (data.currentAmounts[c.id] ?? 0), 0);
  const nextTotal = categories.reduce((sum, c) => sum + (Number.isFinite(amounts[c.id]) ? amounts[c.id] : 0), 0);
  const delta = nextTotal - currentTotal;
  const totalPct = changePercent(nextTotal, currentTotal);
  const signedMoney = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatCurrency(Math.abs(n))}`;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const changeValues = (next: Record<string, string>) => {
    setValues(next); setReview(null); setError(null); setNotice(null);
  };
  const chooseCategory = (id: string, decision: CategoryDecision, amount?: number) => {
    setDecisions(previous => ({ ...previous, [id]: decision }));
    if (amount !== undefined) {
      changeValues({ ...values, [id]: String(amount) });
      setBaseAmounts(previous => ({ ...previous, [id]: data.currentAmounts[id] ?? 0 }));
    } else { setReview(null); setError(null); }
  };
  const checkYear = () => {
    if (Number(todayInZone(data.timeZone).slice(0, 4)) !== data.year) {
      setError(x.yearChanged); setReloadNeeded(true); setReview(null); return false;
    }
    return true;
  };
  const save = async () => {
    if (saving || !checkYear()) return;
    if (!valid) { setError(x.invalidAmount); setReview(null); return; }
    if (!allChosen) { setError(x.chooseAll); setReview(null); return; }
    setSaving(true); setError(null); setNotice(null);
    // Keep the editable snapshot aligned with today's category IDs. Historical
    // snapshots may still contain deleted categories, and new ones start at zero.
    const currentBase = Object.fromEntries(categories.map(c => [c.id, baseAmounts[c.id] ?? 0]));
    const result = await callAction(() => saveAnnualPlanAction({ year, timeZone: data.timeZone, state: 'scheduled',
      revision: savedPlan?.revision ?? null, amounts, baseAmounts: currentBase }));
    setSaving(false); setReview(null);
    if (!result.ok) {
      const reason = 'reason' in result ? result.reason : null;
      setError(reason === 'conflict' ? x.conflict : reason === 'year' ? x.yearChanged : reason === 'unavailable' ? x.unavailable : result.error);
      if (reason === 'conflict' || reason === 'year') setReloadNeeded(true);
      return;
    }
    setSavedPlan(result.plan);
    if (result.plan) { setValues(amountStrings(categories, result.plan.amounts)); setBaseAmounts(result.plan.baseAmounts); }
    setNotice(x.savedSchedule);
    router.refresh();
  };
  const cancel = async () => {
    if (saving || !savedPlan || !checkYear()) return;
    setSaving(true); setError(null); setNotice(null);
    const result = await callAction(() => cancelAnnualPlanAction(year, savedPlan.revision));
    setSaving(false); setReview(null);
    if (!result.ok) {
      const reason = 'reason' in result ? result.reason : null;
      setError(reason === 'conflict' ? x.conflict : reason === 'year' ? x.yearChanged : result.error);
      if (reason === 'conflict' || reason === 'year') setReloadNeeded(true);
      return;
    }
    setSavedPlan(result.plan); setValues(amountStrings(categories, result.plan?.amounts ?? data.currentAmounts));
    setBaseAmounts(result.plan?.baseAmounts ?? data.currentAmounts); setDecisions({}); setNotice(x.canceled); router.refresh();
  };


  return (
    <div className="pb-annual">
      <Link href="/budgets" className="pb-annual-back" onClick={e => { if ((dirty || saving) && !window.confirm(x.leave)) e.preventDefault(); }}><ArrowLeft size={16} />{x.editCurrent}</Link>
      <header className="pb-annual-heading">
        <div><p className="pb-annual-eyebrow">{x.subtitle}</p><h2>{t(x.title, { year: String(year) })}</h2></div>
        <span className="pb-annual-date"><CalendarCheck size={17} /><span>{t(x.starts, { year: String(year) })}<small>{t(x.zone, { zone: data.timeZone })}</small></span></span>
      </header>
      {!data.available && <div className="card pb-annual-message" role="status">{x.unavailable}</div>}
      <section className="card pb-annual-summary" aria-label={t(x.title, { year: String(year) })}>
        <div><span>{t(x.currentYear, { year: String(data.year) })}</span><strong className="font-mono-tab">{formatCurrency(currentTotal)}</strong><small>{t(x.monthly, { amount: formatCurrency(currentTotal / 12) })}</small></div>
        <ArrowRight size={22} className="pb-annual-summary-arrow" aria-hidden="true" />
        <div><span>{t(x.nextYear, { year: String(year) })}</span><strong className="font-mono-tab">{formatCurrency(nextTotal)}</strong><small>{t(x.monthly, { amount: formatCurrency(nextTotal / 12) })}</small></div>
        <div className="pb-annual-difference"><span>{x.difference}</span><strong className="font-mono-tab">{delta === 0 ? x.same : signedMoney(delta)}</strong><small>{totalPct !== null && delta !== 0 ? `${signedPercent(totalPct)}% · ` : ''}{t(x.monthly, { amount: signedMoney(delta / 12) })}</small></div>
      </section>
      <AnnualPlanCharts categories={categories} current={data.currentAmounts} proposed={amounts} />
      {savedPlan?.state === 'scheduled' && <p className="pb-annual-scheduled-note"><CalendarCheck size={16} aria-hidden="true" />{x.editScheduled}</p>}
      {baseChanged && <aside className="pb-annual-base-note" role="status">{x.baseChanged}</aside>}
      <fieldset className="card pb-annual-categories" disabled={saving || !data.available || reloadNeeded}>
        <SectionHeader title={x.categories} subtitle={x.pickEachNote} actions={<span className="pb-annual-reviewed-count" role="status">{t(x.chosenCount, { count: String(chosen), total: String(categories.length) })}</span>} />
        <div className="pb-annual-column-head" aria-hidden="true"><span>{x.category}</span><span>{x.thisYear}</span><span>{x.next}</span></div>
        {categories.length === 0 && <p className="pb-annual-message">{x.empty}</p>}
        {categories.map(c => {
          const Icon = resolveCategoryIcon(c.iconKey);
          const current = data.currentAmounts[c.id] ?? 0;
          const amount = amounts[c.id];
          const percent = Number.isFinite(amount) ? changePercent(amount, current) : null;
          const recommendation = recommendations.get(c.id);
          const name = categoryLabel(d, c.name);
          const quick = budgetQuickSet(history, c.name);
          const decision = decisions[c.id] ?? "";
          const isChosen = decision !== "";
          return <article key={c.id} className="pb-annual-row">
            <div className="pb-annual-category"><span className="pb-budget-icon" style={{ backgroundColor: `${c.color}20`, color: c.color }}><Icon size={19} /></span><strong>{name}</strong>{isChosen && <Check size={14} className="pb-category-chosen" aria-label={x.categoryChosen} />}</div>
            <div className="pb-annual-current"><span className="pb-annual-mobile-label">{x.thisYear}</span><span className="font-mono-tab">{formatCurrency(current)}</span></div>
            <label className="pb-annual-amount"><span className="pb-annual-mobile-label">{x.next}</span><span className="pb-annual-money"><span aria-hidden="true">$</span><AmountInput wholeDollars value={values[c.id] ?? '0'} aria-label={t(x.annualAmount, { name })} className="font-mono-tab" onValueChange={value => { setDecisions(previous => ({ ...previous, [c.id]: 'amount' })); setBaseAmounts(previous => ({ ...previous, [c.id]: current })); changeValues({ ...values, [c.id]: value }); }} /></span>
            </label>
            <CategoryPlanChoice name={name}
              suggested={recommendation?.amount ?? null} average6={quick.sixMonthAnnual} last12={quick.last12Total}
              summary={<><span>{Number.isFinite(amount) && amount >= 0 ? current === 0 ? amount > 0 ? x.newBudget : x.same : percent === 0 ? x.same : t(x.change, { percent: signedPercent(percent ?? 0) }) : '—'}</span>
              {Number.isFinite(amount) && amount >= 0 && <span>{t(x.monthly, { amount: formatCurrency(amount / 12) })}</span>}</>}
              onChoose={(method, chosenAmount) => chooseCategory(c.id, method, chosenAmount)} />
            <CategoryPlanDetails name={name} history={<>
              <p className="pb-plan-history-note">{x.historyNote}</p>
              <BudgetDetails name={c.name} color={c.color} budget={current} history={history} today={today} hideQuickSet
                onSuggest={value => chooseCategory(c.id, 'amount', value)} />
            </>} suggested={recommendation ? <>
              <RecommendationEquation recommendation={recommendation} current={current} />
              <button type="button" className="pill" onClick={() => chooseCategory(c.id, 'suggested', recommendation.amount)}>{x.applySuggestion}</button>
            </> : null} />
          </article>;
        })}
      </fieldset>
      <div className="pb-annual-feedback" aria-live="polite">{error && <p className="pb-annual-error" role="alert">{error}</p>}{notice && <p className="pb-annual-success"><Check size={16} />{notice}</p>}{reloadNeeded && <button type="button" className="pill" onClick={() => window.location.reload()}>{x.reload}</button>}</div>
      {review && <section className="card pb-annual-review" aria-labelledby="pb-annual-review-title"><CalendarCheck size={24} /><div><h3 id="pb-annual-review-title">{x.cancelTitle}</h3><p>{x.cancelNote}</p><div className="pb-annual-review-actions"><button type="button" className="pill" disabled={saving} onClick={() => setReview(null)}>{x.backToEdit}</button><button type="button" className="btn-primary" disabled={saving || reloadNeeded} onClick={() => void cancel()}>{saving ? x.saving : x.confirmCancel}</button></div></div></section>}
      <footer className="pb-annual-footer"><div><span>{dirty ? x.unsaved : savedPlan ? t(savedPlan.state === 'scheduled' ? x.scheduled : x.draft, { year: String(year) }) : t(x.starts, { year: String(year) })}</span><small>{!allChosen ? x.chooseAll : t(x.saveHint, { year: String(year) })}</small></div><div className="pb-annual-footer-actions">
        {savedPlan?.state === 'scheduled' && <button type="button" className="pill" disabled={saving || reloadNeeded || !data.available} onClick={() => { setReview('cancel'); setError(null); }}>{x.cancelSchedule}</button>}
        <button type="button" className="btn-primary" disabled={saving || reloadNeeded || !data.available || categories.length === 0 || !allChosen || (savedPlan?.state === 'scheduled' && !dirty)} onClick={() => void save()}>{saving ? x.saving : x.savePlan}</button>
      </div></footer>
    </div>
  );
}
