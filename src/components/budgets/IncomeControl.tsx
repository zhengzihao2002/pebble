'use client';

import { InfoTooltip } from '@/components/shared/InfoTooltip';
import { AmountInput } from '@/components/shared/AmountInput';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import type { IncomeEstimateMode, ManualIncomeFrequency } from '@/store/usePebbleStore';

// Fixed display order, not derived from the dictionary. No 'once': a one-off
// payment has no annual rate. See the type's comment in usePebbleStore.ts.
export const MANUAL_FREQUENCIES: ManualIncomeFrequency[] = ['weekly', 'biweekly', 'semimonthly', 'monthly', 'yearly'];
export const MANUAL_FREQUENCY_MULTIPLIER: Record<ManualIncomeFrequency, number> = {
  weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12, yearly: 1,
};

const smallField: React.CSSProperties = {
  fontSize: '0.8rem', padding: '0.35rem 0.5rem', borderRadius: '0.5rem', border: '1px solid var(--line)',
  color: 'var(--ink)', backgroundColor: 'var(--paper)', boxSizing: 'border-box',
};

interface IncomeControlProps {
  mode: IncomeEstimateMode;
  onModeChange: (m: IncomeEstimateMode) => void;
  frequency: ManualIncomeFrequency;
  onFrequencyChange: (f: ManualIncomeFrequency) => void;
  manualAmount: string;
  onManualAmountChange: (v: string) => void;
  /** The figure in effect (system estimate or manual x frequency), or null. */
  effectiveAnnual: number | null;
  /** Net of the latest Standard Income, for Import latest. Null if none. */
  latestStandardIncomeNet: number | null;
}

/**
 * Expected annual income for the plan card - what the Modify budget dialog
 * offered, on the page itself. 'system' is the trailing-12-month estimate;
 * 'manual' annualizes one paycheck. Neither is ever written to Postgres.
 */
export function IncomeControl({
  mode, onModeChange, frequency, onFrequencyChange, manualAmount, onManualAmountChange,
  effectiveAnnual, latestStandardIncomeNet,
}: IncomeControlProps) {
  const { d, t } = useTranslation();
  const manual = mode === 'manual';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <span style={{ fontSize: '0.8rem', color: 'var(--ink-soft)', display: 'inline-flex', alignItems: 'center' }}>
          {d.budgetModal.estimatedIncome}
          <InfoTooltip label={d.budgetModal.tooltipLabel}>
            {manual ? d.budgetModal.manualTooltip : (
              <>
                <strong>{d.budgetModal.tooltipHeadline}</strong>
                {' '}{d.budgetModal.tooltipBody}
                {' '}<strong>{t(d.budgetModal.tooltipCounts, { range: d.budgetModal.tooltipRangeFallback })}</strong>
                {' '}<strong>{d.budgetModal.tooltipFixed}</strong> {d.budgetModal.tooltipFixedRest}
              </>
            )}
          </InfoTooltip>
        </span>
        <span className="font-mono-tab" style={{ fontSize: '1rem', fontWeight: 600 }}>
          {effectiveAnnual !== null ? formatCurrency(effectiveAnnual) : '—'}
        </span>
        <select
          value={manual ? 'manual' : 'system'}
          onChange={(e) => onModeChange(e.target.value as IncomeEstimateMode)}
          aria-label={d.budgetModal.estimatedIncome}
          style={{ ...smallField, marginLeft: 'auto' }}
        >
          <option value="system">{d.budgetModal.estimateModeSystem}</option>
          <option value="manual">{d.budgetModal.estimateModeManual}</option>
        </select>
      </div>

      {manual && (
        <div style={{ display: 'flex', alignItems: 'flex-end', flexWrap: 'wrap', gap: '0.5rem' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: '0.72rem', color: 'var(--ink-soft)', flex: '1 1 120px', minWidth: 0 }}>
            {d.budgetModal.manualAmountLabel}
            <span style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-soft)', fontSize: '0.8rem' }}>$</span>
              <AmountInput
                value={manualAmount} onValueChange={onManualAmountChange} placeholder="0.00"
                className="font-mono-tab" style={{ ...smallField, width: '100%', paddingLeft: '1.2rem' }}
              />
            </span>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: '0.72rem', color: 'var(--ink-soft)', flex: '1 1 130px', minWidth: 0 }}>
            {d.budgetModal.manualFrequencyLabel}
            <select value={frequency} onChange={(e) => onFrequencyChange(e.target.value as ManualIncomeFrequency)} style={{ ...smallField, width: '100%' }}>
              {MANUAL_FREQUENCIES.map((f) => <option key={f} value={f}>{d.budgetModal.frequencies[f]}</option>)}
            </select>
          </label>
          <button
            type="button" className="pill"
            onClick={() => { if (latestStandardIncomeNet != null) onManualAmountChange(String(Math.round(latestStandardIncomeNet * 100) / 100)); }}
            disabled={latestStandardIncomeNet == null}
            title={latestStandardIncomeNet == null ? d.budgetModal.importNoData : undefined}
            aria-label={d.budgetModal.importAria}
            style={{ padding: '0.4rem 0.75rem', fontSize: '0.78rem', whiteSpace: 'nowrap', opacity: latestStandardIncomeNet == null ? 0.5 : 1 }}
          >
            {d.budgetModal.importButton}
          </button>
        </div>
      )}
      {manual && <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--ink-soft)' }}>{d.budgetModal.manualAnnualNote}</p>}
    </div>
  );
}
