'use client';

import { RollingAmount } from '@/components/shared/RollingAmount';
import { Download } from 'lucide-react';
import { InfoTooltip } from '@/components/shared/InfoTooltip';
import { SegmentedControl } from '@/components/kit/SegmentedControl';
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
 *
 * The mode is a two-way switch (kit SegmentedControl) rather than a form
 * select: it writes the same saved preference. The manual fields open under
 * it; the frequency stays a native select (five long labels, and the iOS
 * wheel suits it).
 */
export function IncomeControl({
  mode, onModeChange, frequency, onFrequencyChange, manualAmount, onManualAmountChange,
  effectiveAnnual, latestStandardIncomeNet,
}: IncomeControlProps) {
  const { d, t } = useTranslation();
  const ux = d.ux.budgets;
  const manual = mode === 'manual';

  return (
    <div className="pb-bud-income">
      <div className="pb-bud-income-head">
        <div className="pb-bud-income-fig">
          <span className="pb-bud-income-label">
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
          <span className="font-mono-tab pb-bud-income-value">
            <RollingAmount value={effectiveAnnual !== null ? formatCurrency(effectiveAnnual) : '—'} />
          </span>
          {/* A dash alone reads as broken: say what the estimate needs. */}
          {effectiveAnnual === null && !manual && <span className="pb-bud-income-needs">{ux.incomeNeeds}</span>}
        </div>
        <SegmentedControl<IncomeEstimateMode>
          size="sm"
          ariaLabel={d.budgetModal.estimatedIncome}
          value={manual ? 'manual' : 'system'}
          onChange={onModeChange}
          options={[
            { value: 'system', label: ux.modeSystem },
            { value: 'manual', label: ux.modeManual },
          ]}
          className="pb-bud-income-mode"
        />
      </div>

      {manual && (
        <div className="pb-bud-income-manual goal-step">
          <label className="pb-bud-field pb-bud-field-amount">
            {d.budgetModal.manualAmountLabel}
            <span className="pb-bud-field-money">
              <span aria-hidden="true">$</span>
              <AmountInput
                value={manualAmount} onValueChange={onManualAmountChange} placeholder="0.00"
                className="font-mono-tab pb-bud-input"
              />
            </span>
          </label>
          <label className="pb-bud-field">
            {d.budgetModal.manualFrequencyLabel}
            <select className="pb-bud-input" value={frequency} onChange={(e) => onFrequencyChange(e.target.value as ManualIncomeFrequency)}>
              {MANUAL_FREQUENCIES.map((f) => <option key={f} value={f}>{d.budgetModal.frequencies[f]}</option>)}
            </select>
          </label>
          <button
            type="button" className="pill pb-bud-import"
            onClick={() => { if (latestStandardIncomeNet != null) onManualAmountChange(String(Math.round(latestStandardIncomeNet * 100) / 100)); }}
            disabled={latestStandardIncomeNet == null}
            title={latestStandardIncomeNet == null ? d.budgetModal.importNoData : undefined}
            aria-label={d.budgetModal.importAria}
            style={{ opacity: latestStandardIncomeNet == null ? 0.5 : 1 }}
          >
            <Download size={14} aria-hidden="true" />
            {d.budgetModal.importButton}
          </button>
          <p className="pb-bud-income-note">{d.budgetModal.manualAnnualNote}</p>
        </div>
      )}
    </div>
  );
}
