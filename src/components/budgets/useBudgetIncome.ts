'use client';

import { useMemo, useState } from 'react';
import type { Transaction } from '@/types';
import { usePebbleStore, type IncomeEstimateMode } from '@/store/usePebbleStore';
import { estimateAnnualIncomeTrailing12 } from '@/lib/analysis/annualIncome';
import { MANUAL_FREQUENCY_MULTIPLIER } from './IncomeControl';

/** Same income basis and controls for this year's budgets and the next-year planner. */
export function useBudgetIncome(transactions: Transaction[], today: string) {
  const estimate = useMemo(() => today ? estimateAnnualIncomeTrailing12(transactions, today) : null, [transactions, today]);
  const mode: IncomeEstimateMode = usePebbleStore(s => s.incomeEstimateMode) === 'manual' ? 'manual' : 'system';
  const onModeChange = usePebbleStore(s => s.setIncomeEstimateMode);
  const frequency = usePebbleStore(s => s.manualIncomeFrequency);
  const onFrequencyChange = usePebbleStore(s => s.setManualIncomeFrequency);
  const [manualAmount, onManualAmountChange] = useState('');
  const manualAnnual = (Number(manualAmount) || 0) * (MANUAL_FREQUENCY_MULTIPLIER[frequency] ?? 12);
  const effectiveAnnual = mode === 'manual' ? Number.isFinite(manualAnnual) && manualAnnual > 0 ? manualAnnual : null : estimate?.annual ?? null;
  const latestStandardIncomeNet = useMemo(() => {
    let best: Transaction | null = null;
    for (const transaction of transactions) {
      if (transaction.type !== 'income' || transaction.category !== 'Standard Income') continue;
      if (!best || transaction.date > best.date) best = transaction;
    }
    return best?.type === 'income' ? best.netAmount : null;
  }, [transactions]);
  return { estimate, control: { mode, onModeChange, frequency, onFrequencyChange, manualAmount, onManualAmountChange, effectiveAnnual, latestStandardIncomeNet } };
}
