'use client';

import { ChartBarBig, ChartPie } from 'lucide-react';
import { SegmentedControl } from '@/components/kit/SegmentedControl';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { SettingsRow } from './SettingsRow';

export type ChartTypeValue = 'donut' | 'bar';

interface ChartTypeControlProps {
  value: ChartTypeValue;
  onChange: (value: ChartTypeValue) => void;
}

/** Choose how the Dashboard's "Where it went" card draws its categories. */
export function ChartTypeControl({ value, onChange }: ChartTypeControlProps) {
  const { d } = useTranslation();
  // The array holds the STORED values; the dictionary is indexed by them.
  const choices = ['donut', 'bar'] as const;

  // The kit radiogroup (sliding thumb, arrow keys) replaces the two pills;
  // the same two named choices stay visible.
  return (
    <SettingsRow icon={ChartPie} title={d.chartType.title} hint={d.chartType.hint}>
      <SegmentedControl
        options={choices.map((c) => ({ value: c, label: d.chartType[c], icon: c === 'donut' ? ChartPie : ChartBarBig }))}
        value={value} onChange={onChange} ariaLabel={d.chartType.title}
      />
    </SettingsRow>
  );
}
