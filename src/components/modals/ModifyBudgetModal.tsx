'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { LoadingBlock, LoadingOverlay } from '@/components/shared/Spinner';
import { getBudgetModalDataAction, modifyBudgetsAction } from '@/lib/actions/pebble';
import { callAction } from '@/lib/actions/callAction';
import type { FailureKind } from '@/lib/actions/failureKind';
import { ActionError } from '@/components/shared/ActionError';
import { buildCategoryMeta } from '@/lib/data/categoryMeta';
import type { CategoryMeta } from '@/types';
import { formatCurrency } from '@/lib/format';
import { InfoTooltip } from '@/components/shared/InfoTooltip';
import { todayInZone } from '@/lib/recurring/occurrences';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { translateActionError } from '@/lib/i18n/actionErrors';

interface ModifyBudgetModalProps {
  onClose: () => void;
}

export function ModifyBudgetModal({ onClose }: ModifyBudgetModalProps) {
  const { d, t, locale } = useTranslation();
  const [values, setValues] = useState<Record<string, string>>({});
  const [categoryMeta, setCategoryMeta] = useState<CategoryMeta>({});
  const [annualIncome, setAnnualIncome] = useState(0);
  const [incomeMonths, setIncomeMonths] = useState(0);
  // ⚠️ SERVER-GENERATED ENGLISH. This is a date range built in pebble.ts and
  // returned as prose, so it stays English in both locales. Localizing it
  // means changing what the action RETURNS - the same gap ActionError has -
  // and belongs in the 'use server' phase, not here.
  const [incomeMonthsLabel, setIncomeMonthsLabel] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<FailureKind | undefined>(undefined);
  // Which call failed, so Try again repeats that one and not the other.
  const [loadFailed, setLoadFailed] = useState(false);

  // Budgets are loaded on open rather than fetched by the layout: this modal
  // is mounted in AppShell, so a layout-level fetch would run on every page
  // navigation for data that is usually never displayed.
  const aliveRef = useRef(true);
  // Set to true on mount, not just false on unmount: Strict Mode's dev
  // double-invoke unmounts and remounts, and a ref that is only ever
  // cleared stays false forever afterwards - every setState below the
  // guard is then skipped and the modal spins on 'Loading your budgets'
  // with no error, because the failure path is behind the same guard.
  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  const load = () => {
    setLoading(true);
    setError(null);
    setLoadFailed(false);
    // today is resolved HERE, in the browser, from the browser's own IANA
    // zone: the server clock is UTC on Vercel. An unrecognized zone makes Intl
    // throw, so an empty string is sent and the server skips the estimate
    // rather than falling back to a wrong date.
    //
    // NOTE: this is a DATE, not a locale-formatted string. todayInZone returns
    // 'YYYY-MM-DD' and the server compares it lexicographically. Language must
    // never touch it.
    let today = '';
    try {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (zone) today = todayInZone(zone);
    } catch { /* leave empty - the server will skip the estimate */ }

    callAction(() => getBudgetModalDataAction(today), d.budgetModal.loadFailed).then((result) => {
      if (!aliveRef.current) return;
      if (!result.ok) { setError(translateActionError(d, locale, result)); setErrorKind(result.kind); setLoadFailed(true); setLoading(false); return; }
      const meta = buildCategoryMeta(result.categories, result.budgets);
      setCategoryMeta(meta);
      const initial: Record<string, string> = {};
      Object.entries(meta).forEach(([name, entry]) => {
        initial[name] = entry.budget > 0 ? String(entry.budget) : '';
      });
      setValues(initial);
      setAnnualIncome(result.annualIncome);
      setIncomeMonths(result.incomeMonths);
      setIncomeMonthsLabel(result.incomeMonthsLabel);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Category names are USER DATA - keys, labels and the payload all use the
  // stored name untranslated.
  const categoryNames = Object.keys(categoryMeta);
  const totalBudgeted = categoryNames.reduce((s, name) => s + (Number(values[name]) || 0), 0);

  // A write in flight must not be cancellable - see AddTransactionModal.
  // Only `saving` blocks: closing during the initial read is harmless, since
  // nothing is being written.
  const requestClose = () => { if (saving) return; onClose(); };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (saving || loading) return;
    const budgets: Record<string, number> = {};
    categoryNames.forEach((name) => { budgets[name] = Number(values[name]) || 0; });
    setSaving(true);
    setError(null);
    const result = await callAction(() => modifyBudgetsAction(budgets));
    setSaving(false);
    if (!result.ok) { setError(translateActionError(d, locale, result)); setErrorKind(result.kind); setLoadFailed(false); return; }
    onClose();
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,20,18,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 50, overflowY: 'auto' }}
      onClick={requestClose}
    >
      <div className="card" style={{ padding: '1.75rem', width: '100%', maxWidth: 680, boxSizing: 'border-box', margin: '1rem 0', position: 'relative' }} onClick={(e) => e.stopPropagation()}>
        {saving && <LoadingOverlay label={d.budgetModal.saving} />}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <h2 className="font-display" style={{ fontSize: '1.3rem', fontWeight: 600 }}>{d.budgetModal.title}</h2>
          <button onClick={requestClose} disabled={saving} className="icon-btn" style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', flexShrink: 0, opacity: saving ? 0.4 : 1 }}><X size={18} /></button>
        </div>
        <p style={{ fontSize: '0.83rem', color: 'var(--ink-soft)', marginBottom: '1.25rem' }}>
          {d.budgetModal.intro}
        </p>

        <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: '1.4rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', boxShadow: 'none', backgroundColor: 'var(--paper)' }}>
          <div>
            <p style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', display: 'flex', alignItems: 'center' }}>
              {d.budgetModal.estimatedIncome}
              <InfoTooltip label={d.budgetModal.tooltipLabel}>
                {/* Broken into clause-sized keys rather than one string,
                    because the original interleaves <strong> runs with plain
                    prose. Each key is a complete clause, so word order inside
                    it is free to differ between languages.

                    The duplicated "The month in progress is left out until it
                    finishes." sentence from the original is dropped - it
                    appeared twice, which was a pre-existing copy-paste. */}
                <strong>{d.budgetModal.tooltipHeadline}</strong>
                {' '}{d.budgetModal.tooltipBody}
                {' '}<strong>{t(d.budgetModal.tooltipCounts, { range: incomeMonthsLabel || d.budgetModal.tooltipRangeFallback })}</strong>
                {' '}<strong>{d.budgetModal.tooltipFixed}</strong> {d.budgetModal.tooltipFixedRest}
              </InfoTooltip>
            </p>
            <p className="font-mono-tab" style={{ fontSize: '1.15rem', fontWeight: 600 }}>{formatCurrency(annualIncome)}</p>
            <p style={{ fontSize: '0.7rem', color: 'var(--ink-soft)' }}>
              {/* Plural chosen by key, as in CatchUpNotice. incomeMonthsLabel
                  is the server's English range - see the state declaration. */}
              {incomeMonths > 0
                ? `${incomeMonthsLabel} · ${t(incomeMonths === 1 ? d.budgetModal.recordedMonthsOne : d.budgetModal.recordedMonthsOther, { count: incomeMonths })}`
                : d.budgetModal.incomeFallback}
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: '0.75rem', color: 'var(--ink-soft)' }}>{d.budgetModal.totalBudgeted}</p>
            <p className="font-mono-tab" style={{ fontSize: '1.15rem', fontWeight: 600, color: annualIncome > 0 && totalBudgeted > annualIncome ? 'var(--wine)' : 'var(--ink)' }}>
              {formatCurrency(totalBudgeted)}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {loading && <LoadingBlock label={d.budgetModal.loadingBudgets} minHeight={160} />}
          <div className="themed-scroll" style={{ maxHeight: '48vh', overflowY: 'auto', paddingRight: '0.25rem', display: loading ? 'none' : undefined }}>
            {categoryNames.map((name) => {
              const meta = categoryMeta[name];
              return (
                <div key={name} className="budget-modify-row">
                  <span className="budget-modify-label">
                    <meta.icon size={16} style={{ color: meta.color, flexShrink: 0 }} />
                    {name}
                  </span>
                  <div className="budget-modify-input-wrap">
                    <span style={{ color: 'var(--ink-soft)', fontSize: '0.85rem' }}>$</span>
                    <input
                      type="number" min="0" step="1" placeholder="0" value={values[name] ?? ''} disabled={loading}
                      onChange={(e) => setValues((prev) => ({ ...prev, [name]: e.target.value }))}
                      className="font-mono-tab"
                      style={{ width: '100%', padding: '0.5rem 0.6rem', borderRadius: '0.5rem', border: '1px solid var(--line)', fontSize: '0.87rem', color: 'var(--ink)', backgroundColor: 'var(--paper)', boxSizing: 'border-box' }}
                    />
                    <span style={{ color: 'var(--ink-soft)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{d.budgetModal.perYear}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <ActionError
            message={error} kind={errorKind}
            onRetry={loadFailed ? load : () => void handleSubmit()}
            busy={saving || loading}
            style={{ marginTop: '0.9rem' }}
          />

          <button type="submit" disabled={loading || saving} className="btn-primary" style={{ marginTop: '1.25rem', padding: '0.75rem', width: '100%', opacity: loading || saving ? 0.6 : 1 }}>
            {loading ? d.common.loading : saving ? d.common.saving : d.budgetModal.saveBudgets}
          </button>
        </form>
      </div>
    </div>
  );
}
