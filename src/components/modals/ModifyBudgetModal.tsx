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

interface ModifyBudgetModalProps {
  onClose: () => void;
}

export function ModifyBudgetModal({ onClose }: ModifyBudgetModalProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [categoryMeta, setCategoryMeta] = useState<CategoryMeta>({});
  const [annualIncome, setAnnualIncome] = useState(0);
  const [incomeMonths, setIncomeMonths] = useState(0);
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
    let today = '';
    try {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (zone) today = todayInZone(zone);
    } catch { /* leave empty - the server will skip the estimate */ }

    callAction(() => getBudgetModalDataAction(today), "Couldn't load your budgets.").then((result) => {
      if (!aliveRef.current) return;
      if (!result.ok) { setError(result.error); setErrorKind(result.kind); setLoadFailed(true); setLoading(false); return; }
      const meta = buildCategoryMeta(result.categories, result.budgets);
      setCategoryMeta(meta);
      const initial: Record<string, string> = {};
      Object.entries(meta).forEach(([name, entry]) => {
        initial[name] = entry.budget > 0 ? String(entry.budget) : '';
      });
      setValues(initial);
      setAnnualIncome(result.annualIncome);
      setIncomeMonths(result.incomeMonths);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, []);

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
    if (!result.ok) { setError(result.error); setErrorKind(result.kind); setLoadFailed(false); return; }
    onClose();
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,20,18,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 50, overflowY: 'auto' }}
      onClick={requestClose}
    >
      <div className="card" style={{ padding: '1.75rem', width: '100%', maxWidth: 680, boxSizing: 'border-box', margin: '1rem 0', position: 'relative' }} onClick={(e) => e.stopPropagation()}>
        {saving && <LoadingOverlay label="Saving budgets…" />}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <h2 className="font-display" style={{ fontSize: '1.3rem', fontWeight: 600 }}>Modify budget</h2>
          <button onClick={requestClose} disabled={saving} className="icon-btn" style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', flexShrink: 0, opacity: saving ? 0.4 : 1 }}><X size={18} /></button>
        </div>
        <p style={{ fontSize: '0.83rem', color: 'var(--ink-soft)', marginBottom: '1.25rem' }}>
          Set an annual budget for each category. Leave a box blank for no budget — that category stays hidden on the Budgets page until you spend something in it.
        </p>

        <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: '1.4rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', boxShadow: 'none', backgroundColor: 'var(--paper)' }}>
          <div>
            <p style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', display: 'flex', alignItems: 'center' }}>
              Estimated annual income
              <InfoTooltip label="How estimated annual income is calculated">
                <strong>Take-home Standard Income over the last 12 months, divided by the number of
                months you were recording, × 12.</strong>
                {' '}Side Cash is excluded, and this is take-home (net) pay rather than salary
                before deductions. A month where you were recording but received no pay counts as
                zero; a stretch of 3 or more months with nothing recorded at all is skipped as time
                you were not using Pebble. The month in progress is left out until it finishes.
                {' '}<strong>Fixed to the last 12 months</strong> — recent enough to follow a change
                of job, long enough to cover a full year. The Analysis page shows the same
                calculation over whichever period you select there, so the two agree when that is
                set to Last 12 months.
              </InfoTooltip>
            </p>
            <p className="font-mono-tab" style={{ fontSize: '1.15rem', fontWeight: 600 }}>{formatCurrency(annualIncome)}</p>
            <p style={{ fontSize: '0.7rem', color: 'var(--ink-soft)' }}>
              {incomeMonths > 0
                ? `Last 12 months · ${incomeMonths} recorded month${incomeMonths === 1 ? '' : 's'}`
                : 'Based on your Standard Income history'}
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: '0.75rem', color: 'var(--ink-soft)' }}>Total budgeted</p>
            <p className="font-mono-tab" style={{ fontSize: '1.15rem', fontWeight: 600, color: annualIncome > 0 && totalBudgeted > annualIncome ? 'var(--wine)' : 'var(--ink)' }}>
              {formatCurrency(totalBudgeted)}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {loading && <LoadingBlock label="Loading your budgets…" minHeight={160} />}
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
                    <span style={{ color: 'var(--ink-soft)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>/ yr</span>
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
            {loading ? 'Loading…' : saving ? 'Saving…' : 'Save budgets'}
          </button>
        </form>
      </div>
    </div>
  );
}
