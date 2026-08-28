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
import { usePebbleStore, type ManualIncomeFrequency, type IncomeEstimateMode } from '@/store/usePebbleStore';

interface ModifyBudgetModalProps {
  onClose: () => void;
}

// Multiplier to turn one paycheck into an annual figure. No 'once' - see the
// type's own comment in usePebbleStore.ts for why semimonthly exists here
// and nowhere else in Pebble.
const MANUAL_FREQUENCY_MULTIPLIER: Record<ManualIncomeFrequency, number> = {
  weekly: 52,
  biweekly: 26,
  semimonthly: 24,
  monthly: 12,
  yearly: 1,
};

// Fixed display order for the frequency dropdown - not derived from the
// dictionary, so a translation can never reorder it.
const MANUAL_FREQUENCIES: ManualIncomeFrequency[] = ['weekly', 'biweekly', 'semimonthly', 'monthly', 'yearly'];

const modeSelectStyle: React.CSSProperties = {
  fontSize: '0.78rem', padding: '0.3rem 0.5rem', borderRadius: '0.5rem',
  border: '1px solid var(--line)', color: 'var(--ink)', backgroundColor: 'var(--paper)',
};
const manualFieldStyle: React.CSSProperties = {
  padding: '0.4rem 0.55rem', borderRadius: '0.5rem', border: '1px solid var(--line)',
  fontSize: '0.85rem', color: 'var(--ink)', backgroundColor: 'var(--paper)', boxSizing: 'border-box', width: '100%',
};

export function ModifyBudgetModal({ onClose }: ModifyBudgetModalProps) {
  const { d, t, locale } = useTranslation();

  // Income-estimate mode and the manual entry itself are DEVICE preferences,
  // not financial data - see the comments in usePebbleStore.ts. Read directly
  // from the store with no restore-effect/mount-gate dance: this modal is
  // only ever mounted client-side, after a button click in AppShell, so
  // there is no server render of it to disagree with.
  const incomeEstimateMode = usePebbleStore((s) => s.incomeEstimateMode);
  const setIncomeEstimateMode = usePebbleStore((s) => s.setIncomeEstimateMode);
  const manualIncomePrefs = usePebbleStore((s) => s.manualIncomePrefs);
  const setManualIncomePrefs = usePebbleStore((s) => s.setManualIncomePrefs);

  const [values, setValues] = useState<Record<string, string>>({});
  const [categoryMeta, setCategoryMeta] = useState<CategoryMeta>({});
  // Renamed from `annualIncome`: this is specifically the SERVER-computed
  // trailing-12-month figure, distinguishing it from the manual entry and
  // from `effectiveAnnualIncome` below, which is whichever is in effect.
  const [systemAnnualIncome, setSystemAnnualIncome] = useState(0);
  const [incomeMonths, setIncomeMonths] = useState(0);
  // ⚠️ SERVER-GENERATED ENGLISH. This is a date range built in pebble.ts and
  // returned as prose, so it stays English in both locales. Localizing it
  // means changing what the action RETURNS - the same gap ActionError has -
  // and belongs in the 'use server' phase, not here.
  const [incomeMonthsLabel, setIncomeMonthsLabel] = useState('');
  // Net amount of the most recent Standard Income transaction, for the
  // "import latest" button. Null until loaded, or if there is none on record.
  const [latestStandardIncomeNet, setLatestStandardIncomeNet] = useState<number | null>(null);
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
      setSystemAnnualIncome(result.annualIncome);
      setIncomeMonths(result.incomeMonths);
      setIncomeMonthsLabel(result.incomeMonthsLabel);
      setLatestStandardIncomeNet(result.latestStandardIncomeNet);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Category names are USER DATA - keys, labels and the payload all use the
  // stored name untranslated.
  const categoryNames = Object.keys(categoryMeta);
  const totalBudgeted = categoryNames.reduce((s, name) => s + (Number(values[name]) || 0), 0);

  const manualAmountNum = Number(manualIncomePrefs.amount) || 0;
  const manualAnnual = manualAmountNum * MANUAL_FREQUENCY_MULTIPLIER[manualIncomePrefs.frequency];

  // Whichever figure is actually in effect. Used for the over-budget colour
  // check below, so that warning tracks whichever source the user has chosen
  // rather than always the system estimate.
  const effectiveAnnualIncome = incomeEstimateMode === 'manual' ? manualAnnual : systemAnnualIncome;

  const handleImportLatest = () => {
    if (latestStandardIncomeNet == null) return;
    // Rounded to cents: the stored value is a Postgres numeric and can carry
    // more precision than a dollar amount ever needs here.
    const rounded = Math.round(latestStandardIncomeNet * 100) / 100;
    setManualIncomePrefs({ amount: String(rounded) });
  };

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

        <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: '1.4rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', boxShadow: 'none', backgroundColor: 'var(--paper)' }}>
          <div style={{ flex: '1 1 260px', minWidth: 0 }}>
            <p style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', display: 'flex', alignItems: 'center' }}>
              {d.budgetModal.estimatedIncome}
              <InfoTooltip label={d.budgetModal.tooltipLabel}>
                {incomeEstimateMode === 'manual' ? (
                  d.budgetModal.manualTooltip
                ) : (
                  <>
                    {/* Broken into clause-sized keys rather than one string,
                        because the original interleaves <strong> runs with
                        plain prose. Each key is a complete clause, so word
                        order inside it is free to differ between languages. */}
                    <strong>{d.budgetModal.tooltipHeadline}</strong>
                    {' '}{d.budgetModal.tooltipBody}
                    {' '}<strong>{t(d.budgetModal.tooltipCounts, { range: incomeMonthsLabel || d.budgetModal.tooltipRangeFallback })}</strong>
                    {' '}<strong>{d.budgetModal.tooltipFixed}</strong> {d.budgetModal.tooltipFixedRest}
                  </>
                )}
              </InfoTooltip>
            </p>

            {/* Mode switch. A dropdown rather than a pill pair, matching every
                other mode selector in this app (Dashboard's period selector,
                Reports' grouping selector). */}
            <select
              value={incomeEstimateMode}
              onChange={(e) => setIncomeEstimateMode(e.target.value as IncomeEstimateMode)}
              style={{ ...modeSelectStyle, marginTop: '0.35rem', marginBottom: '0.6rem' }}
            >
              <option value="system">{d.budgetModal.estimateModeSystem}</option>
              <option value="manual">{d.budgetModal.estimateModeManual}</option>
            </select>

            {incomeEstimateMode === 'system' ? (
              <>
                <p className="font-mono-tab" style={{ fontSize: '1.15rem', fontWeight: 600 }}>{formatCurrency(systemAnnualIncome)}</p>
                <p style={{ fontSize: '0.7rem', color: 'var(--ink-soft)' }}>
                  {/* Plural chosen by key, as in CatchUpNotice. incomeMonthsLabel
                      is the server's English range - see the state declaration. */}
                  {incomeMonths > 0
                    ? `${incomeMonthsLabel} · ${t(incomeMonths === 1 ? d.budgetModal.recordedMonthsOne : d.budgetModal.recordedMonthsOther, { count: incomeMonths })}`
                    : d.budgetModal.incomeFallback}
                </p>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.55rem' }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.7rem', color: 'var(--ink-soft)', flex: '1 1 110px', minWidth: 0 }}>
                    {d.budgetModal.manualAmountLabel}
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-soft)', fontSize: '0.82rem' }}>$</span>
                      <input
                        type="number" min="0" step="0.01" placeholder="0.00"
                        value={manualIncomePrefs.amount}
                        onChange={(e) => setManualIncomePrefs({ amount: e.target.value })}
                        className="font-mono-tab"
                        style={{ ...manualFieldStyle, paddingLeft: '1.35rem' }}
                      />
                    </div>
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.7rem', color: 'var(--ink-soft)', flex: '1 1 120px', minWidth: 0 }}>
                    {d.budgetModal.manualFrequencyLabel}
                    <select
                      value={manualIncomePrefs.frequency}
                      onChange={(e) => setManualIncomePrefs({ frequency: e.target.value as ManualIncomeFrequency })}
                      style={manualFieldStyle}
                    >
                      {MANUAL_FREQUENCIES.map((f) => <option key={f} value={f}>{d.budgetModal.frequencies[f]}</option>)}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={handleImportLatest}
                    disabled={loading || latestStandardIncomeNet == null}
                    title={latestStandardIncomeNet == null ? d.budgetModal.importNoData : undefined}
                    aria-label={d.budgetModal.importAria}
                    className="pill"
                    style={{ padding: '0.4rem 0.75rem', fontSize: '0.78rem', alignSelf: 'flex-end', opacity: loading || latestStandardIncomeNet == null ? 0.5 : 1, whiteSpace: 'nowrap' }}
                  >
                    {d.budgetModal.importButton}
                  </button>
                </div>
                <p className="font-mono-tab" style={{ fontSize: '1.15rem', fontWeight: 600 }}>{formatCurrency(manualAnnual)}</p>
                <p style={{ fontSize: '0.7rem', color: 'var(--ink-soft)' }}>{d.budgetModal.manualAnnualNote}</p>
              </>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: '0.75rem', color: 'var(--ink-soft)' }}>{d.budgetModal.totalBudgeted}</p>
            <p className="font-mono-tab" style={{ fontSize: '1.15rem', fontWeight: 600, color: effectiveAnnualIncome > 0 && totalBudgeted > effectiveAnnualIncome ? 'var(--wine)' : 'var(--ink)' }}>
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
