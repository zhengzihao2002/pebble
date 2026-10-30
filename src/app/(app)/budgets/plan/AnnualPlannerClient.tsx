'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, CalendarCheck, Check, ChevronDown, Lightbulb, Sparkles } from 'lucide-react';
import type { CategoryItem } from '@/lib/data/mappers';
import type { Transaction } from '@/types';
import type { AnnualPlannerData, AnnualPlan } from '@/lib/budgets/annualTypes';
import { recommendAnnualBudgets, type BudgetRecommendation } from '@/lib/budgets/recommendations';
import { saveAnnualPlanAction, cancelAnnualPlanAction } from '@/lib/actions/annualBudgets';
import { callAction } from '@/lib/actions/callAction';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { categoryLabel } from '@/lib/i18n/enumLabels';
import { resolveCategoryIcon } from '@/lib/data/icons';
import { formatCurrency } from '@/lib/format';
import { todayInZone } from '@/lib/recurring/occurrences';
import { AmountInput } from '@/components/shared/AmountInput';
import { SegmentedControl } from '@/components/kit/SegmentedControl';
import { SectionHeader } from '@/components/kit/SectionHeader';

type Starter = 'same' | 'recommended' | '3' | '5' | 'custom';
type Copy = ReturnType<typeof useTranslation>['d']['ux']['annualBudgets'];
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
function reasonText(r: BudgetRecommendation, x: Copy) {
  const reasons = {
    noHistory: x.noHistory, limitedHistory: x.limitedHistory, newBudget: x.newBudgetReason,
    steadySpending: x.steadySpending, risingSpending: x.risingSpending, fallingSpending: x.fallingSpending,
    unusedRoom: x.unusedRoom, seasonalSpending: x.seasonalSpending, unusualSpike: x.unusualSpike,
  };
  return reasons[r.reason];
}

export function AnnualPlannerClient({ data, categories, transactions, today }: {
  data: AnnualPlannerData; categories: CategoryItem[]; transactions: Transaction[]; today: string;
}) {
  const { d, t } = useTranslation();
  const x = d.ux.annualBudgets;
  const router = useRouter();
  const year = data.year + 1;
  const [savedPlan, setSavedPlan] = useState<AnnualPlan | null>(data.plan);
  const [values, setValues] = useState(() => amountStrings(categories, data.plan?.amounts ?? data.currentAmounts));
  const [baseAmounts, setBaseAmounts] = useState(data.plan?.baseAmounts ?? data.currentAmounts);
  const [starter, setStarter] = useState<Starter>(data.plan ? 'custom' : 'same');
  const [customOpen, setCustomOpen] = useState(false);
  const [customPercent, setCustomPercent] = useState('0');
  const [saving, setSaving] = useState(false);
  const [review, setReview] = useState<'schedule' | 'cancel' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadNeeded, setReloadNeeded] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const suggestions = useMemo(() => recommendAnnualBudgets({ transactions, categories, currentAmounts: data.currentAmounts, today }), [transactions, categories, data.currentAmounts, today]);
  const recommendations = useMemo(() => new Map(suggestions.map(r => [r.categoryId, r])), [suggestions]);
  const savedValues = amountStrings(categories, savedPlan?.amounts ?? data.currentAmounts);
  const dirty = categories.some(c => values[c.id] !== savedValues[c.id]);
  const baseChanged = savedPlan !== null && categories.some(c => (savedPlan.baseAmounts[c.id] ?? 0) !== (data.currentAmounts[c.id] ?? 0));
  const amounts = Object.fromEntries(categories.map(c => [c.id, Number(values[c.id])]));
  const valid = categories.every(c => values[c.id]?.trim() !== '' && Number.isFinite(amounts[c.id]) && amounts[c.id] >= 0 && amounts[c.id] <= MAX_AMOUNT);
  const currentTotal = categories.reduce((sum, c) => sum + (data.currentAmounts[c.id] ?? 0), 0);
  const nextTotal = categories.reduce((sum, c) => sum + (Number.isFinite(amounts[c.id]) ? amounts[c.id] : 0), 0);
  const delta = nextTotal - currentTotal;
  const totalPct = changePercent(nextTotal, currentTotal);
  const signedMoney = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatCurrency(Math.abs(n))}`;
  const startOptions: { value: Starter; label: string }[] = [
    { value: 'same', label: x.keepSame }, { value: 'recommended', label: x.recommended },
    { value: '3', label: '+3%' }, { value: '5', label: '+5%' }, { value: 'custom', label: x.custom },
  ];

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const changeValues = (next: Record<string, string>) => {
    setValues(next); setReview(null); setError(null); setNotice(null);
  };
  const applyPercent = (percent: number) => {
    if (!Number.isFinite(percent) || percent < -100 || percent > 1000) { setError(x.invalidPercent); return; }
    changeValues(Object.fromEntries(categories.map(c => [c.id, String(Math.min(MAX_AMOUNT, Math.round((data.currentAmounts[c.id] ?? 0) * (1 + percent / 100))))])));
    setBaseAmounts(data.currentAmounts);
  };
  const chooseStarter = (choice: Starter) => {
    setStarter(choice); setCustomOpen(choice === 'custom');
    if (choice === 'same') { changeValues(amountStrings(categories, data.currentAmounts)); setBaseAmounts(data.currentAmounts); }
    else if (choice === 'recommended') {
      changeValues(Object.fromEntries(categories.map(c => [c.id, String(recommendations.get(c.id)?.amount ?? data.currentAmounts[c.id] ?? 0)])));
      setBaseAmounts(data.currentAmounts);
    } else if (choice !== 'custom') applyPercent(Number(choice));
  };
  const checkYear = () => {
    if (Number(todayInZone(data.timeZone).slice(0, 4)) !== data.year) {
      setError(x.yearChanged); setReloadNeeded(true); setReview(null); return false;
    }
    return true;
  };
  const save = async (state: 'draft' | 'scheduled') => {
    if (saving || !checkYear()) return;
    if (!valid) { setError(x.invalidAmount); setReview(null); return; }
    setSaving(true); setError(null); setNotice(null);
    // Keep the editable snapshot aligned with today's category IDs. Historical
    // snapshots may still contain deleted categories, and new ones start at zero.
    const currentBase = Object.fromEntries(categories.map(c => [c.id, baseAmounts[c.id] ?? 0]));
    const result = await callAction(() => saveAnnualPlanAction({ year, timeZone: data.timeZone, state,
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
    setNotice(state === 'draft' ? x.savedDraft : x.savedSchedule);
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
    setBaseAmounts(result.plan?.baseAmounts ?? data.currentAmounts); setStarter(result.plan ? 'custom' : 'same'); setCustomOpen(false); setNotice(x.canceled); router.refresh();
  };
  const startReview = () => {
    if (!checkYear()) return;
    if (!valid) { setError(x.invalidAmount); return; }
    setReview('schedule'); setError(null); setNotice(null);
  };

  return (
    <div className="pb-annual">
      <Link href="/budgets" className="pb-annual-back" onClick={e => { if ((dirty || saving) && !window.confirm(x.leave)) e.preventDefault(); }}><ArrowLeft size={16} />{x.back}</Link>
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
      <fieldset className="card pb-annual-start" disabled={saving || !data.available || reloadNeeded}>
        <SectionHeader icon={Sparkles} title={x.startWith} subtitle={x.startNote} />
        <div className="pb-annual-starter-desktop"><SegmentedControl options={startOptions} value={starter} onChange={chooseStarter} ariaLabel={x.startWith} /></div>
        <label className="pb-annual-starter-mobile"><span>{x.startWith}</span><span className="pb-annual-native"><select value={starter} onChange={e => chooseStarter(e.target.value as Starter)}>{startOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select><ChevronDown size={16} aria-hidden="true" /></span></label>
        {customOpen && <div className="pb-annual-custom"><label>{x.adjustment}<input type="number" min="-100" max="1000" step="0.1" value={customPercent} onChange={e => setCustomPercent(e.target.value)} /></label><button type="button" className="pill" onClick={() => customPercent.trim() === '' ? setError(x.invalidPercent) : applyPercent(Number(customPercent))}>{x.applyAdjustment}</button></div>}
        <p className="pb-annual-insight-note"><Lightbulb size={16} aria-hidden="true" />{x.recommendedNote}</p>
      </fieldset>
      {baseChanged && <aside className="pb-annual-base-note" role="status"><span>{x.baseChanged}</span><button type="button" className="pill" disabled={saving} onClick={() => { if (!dirty || window.confirm(x.updateBaseNote)) chooseStarter('same'); }}>{x.updateBase}</button></aside>}
      <fieldset className="card pb-annual-categories" disabled={saving || !data.available || reloadNeeded}>
        <SectionHeader title={x.categories} subtitle={x.categoryNote} />
        <div className="pb-annual-column-head" aria-hidden="true"><span>{x.category}</span><span>{x.thisYear}</span><span>{x.next}</span></div>
        {categories.length === 0 && <p className="pb-annual-message">{x.empty}</p>}
        {categories.map(c => {
          const Icon = resolveCategoryIcon(c.iconKey);
          const current = data.currentAmounts[c.id] ?? 0;
          const amount = amounts[c.id];
          const percent = Number.isFinite(amount) ? changePercent(amount, current) : null;
          const recommendation = recommendations.get(c.id);
          const applied = recommendation !== undefined && amount === recommendation.amount;
          const name = categoryLabel(d, c.name);
          return <article key={c.id} className="pb-annual-row">
            <div className="pb-annual-category"><span className="pb-budget-icon" style={{ backgroundColor: `${c.color}20`, color: c.color }}><Icon size={19} /></span><strong>{name}</strong></div>
            <div className="pb-annual-current"><span className="pb-annual-mobile-label">{x.thisYear}</span><span className="font-mono-tab">{formatCurrency(current)}</span></div>
            <label className="pb-annual-amount"><span className="pb-annual-mobile-label">{x.next}</span><span className="pb-annual-money"><span aria-hidden="true">$</span><AmountInput wholeDollars value={values[c.id] ?? '0'} aria-label={t(x.annualAmount, { name })} className="font-mono-tab" onValueChange={value => { setStarter('custom'); setCustomOpen(false); changeValues({ ...values, [c.id]: value }); }} /></span>
              <small>{Number.isFinite(amount) && amount >= 0 ? current === 0 ? amount > 0 ? x.newBudget : x.same : percent === 0 ? x.same : t(x.change, { percent: signedPercent(percent ?? 0) }) : '—'}</small>
              {Number.isFinite(amount) && amount >= 0 && <small>{t(x.monthly, { amount: formatCurrency(amount / 12) })}</small>}
            </label>
            {recommendation && <details className="pb-annual-recommendation">
              <summary><Lightbulb size={15} aria-hidden="true" /><span>{t(x.suggestion, { amount: formatCurrency(recommendation.amount) })}</span><span className="pb-annual-rec-percent">{recommendation.changePercent === null ? recommendation.amount > 0 ? x.newBudget : x.same : recommendation.changePercent === 0 ? x.same : `${signedPercent(recommendation.changePercent)}%`}</span><ChevronDown size={14} aria-hidden="true" /></summary>
              <div className="pb-annual-reason"><p>{reasonText(recommendation, x)}</p><div className="pb-annual-evidence"><span>{recommendation.confidence === 'high' ? x.confidenceHigh : recommendation.confidence === 'medium' ? x.confidenceMedium : x.confidenceLow}</span><span>{t(x.months, { count: String(recommendation.sampleMonths) })}</span>{recommendation.windowStart && recommendation.windowEnd && <span>{t(x.window, { from: recommendation.windowStart, to: recommendation.windowEnd })}</span>}</div>
                {recommendation.baselineAnnual !== null && <p>{t(x.baseline, { amount: formatCurrency(recommendation.baselineAnnual) })}</p>}
                {recommendation.recentAnnual !== null && recommendation.reason === 'risingSpending' && <p>{t(x.recent, { amount: formatCurrency(recommendation.recentAnnual) })}</p>}
                {recommendation.trendPercent !== null && (recommendation.reason === 'risingSpending' || recommendation.reason === 'fallingSpending') && <p>{t(x.trend, { percent: signedPercent(recommendation.trendPercent) })}</p>}
                {recommendation.excludedSpikeAmount > 0 && <p>{t(x.spike, { amount: formatCurrency(recommendation.excludedSpikeAmount) })}</p>}
                {recommendation.baselineAnnual !== null && recommendation.amount > 0 && recommendation.reason !== 'limitedHistory' && recommendation.reason !== 'seasonalSpending' && <p>{t(x.buffer, { percent: String(recommendation.bufferPercent) })}</p>}
                <button type="button" className="pill" disabled={applied} onClick={() => { setStarter('custom'); setCustomOpen(false); changeValues({ ...values, [c.id]: String(recommendation.amount) }); }}>{applied ? <><Check size={14} />{x.selectedSuggestion}</> : x.applySuggestion}</button>
              </div>
            </details>}
          </article>;
        })}
      </fieldset>
      <div className="pb-annual-feedback" aria-live="polite">{error && <p className="pb-annual-error" role="alert">{error}</p>}{notice && <p className="pb-annual-success"><Check size={16} />{notice}</p>}{reloadNeeded && <button type="button" className="pill" onClick={() => window.location.reload()}>{x.reload}</button>}</div>
      {review && <section className="card pb-annual-review" aria-labelledby="pb-annual-review-title"><CalendarCheck size={24} /><div><h3 id="pb-annual-review-title">{review === 'schedule' ? t(x.reviewTitle, { year: String(year) }) : x.cancelTitle}</h3><p>{review === 'schedule' ? t(x.reviewNote, { amount: formatCurrency(nextTotal), year: String(year), zone: data.timeZone }) : x.cancelNote}</p><div className="pb-annual-review-actions"><button type="button" className="pill" disabled={saving} onClick={() => setReview(null)}>{x.backToEdit}</button><button type="button" className="btn-primary" disabled={saving || reloadNeeded} onClick={() => void (review === 'schedule' ? save('scheduled') : cancel())}>{saving ? x.saving : review === 'schedule' ? x.confirmSchedule : x.confirmCancel}</button></div></div></section>}
      <footer className="pb-annual-footer"><div><span>{dirty ? x.unsaved : savedPlan ? t(savedPlan.state === 'scheduled' ? x.scheduled : x.draft, { year: String(year) }) : t(x.starts, { year: String(year) })}</span><small>{x.savedNote}</small></div><div className="pb-annual-footer-actions">
        {savedPlan?.state === 'scheduled' ? <button type="button" className="pill" disabled={saving || reloadNeeded || !data.available} onClick={() => { setReview('cancel'); setError(null); }}>{x.cancelSchedule}</button> : <button type="button" className="pill" disabled={saving || reloadNeeded || !data.available || categories.length === 0} onClick={() => void save('draft')}>{saving ? x.saving : x.saveDraft}</button>}
        <button type="button" className="btn-primary" disabled={saving || reloadNeeded || !data.available || categories.length === 0 || (savedPlan?.state === 'scheduled' && !dirty)} onClick={startReview}>{savedPlan?.state === 'scheduled' ? x.saveChanges : x.schedule}</button>
      </div></footer>
    </div>
  );
}
