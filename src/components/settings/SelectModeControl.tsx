'use client';

import { ChevronsUpDown } from 'lucide-react';
import { SegmentedControl } from '@/components/kit/SegmentedControl';
import { SettingsRow } from './SettingsRow';
import type { SelectMode } from '@/store/usePebbleStore';
import { useTranslation } from '@/lib/i18n/useTranslation';

interface SelectModeControlProps {
  selectMode: SelectMode;
  onChange: (value: SelectMode) => void;
}

const MODES: SelectMode[] = ['searchable', 'plain'];

/**
 * Chooses between the type-to-filter combobox and the browser's native
 * <select> for Pebble's dropdowns. Props-only, like AppearanceControl and
 * LanguageControl: SettingsClient owns the store read.
 *
 * The kit SegmentedControl (see LanguageControl). Two named choices, not a
 * Switch, so the user can see what the alternative is before picking it.
 */
export function SelectModeControl({ selectMode, onChange }: SelectModeControlProps) {
  const { d } = useTranslation();

  const labels: Record<SelectMode, string> = {
    searchable: d.selectMode.searchable,
    plain: d.selectMode.plain,
  };
  // Same rule the dropdown wrapper applies: anything but 'plain' is searchable,
  // so a value written by another build never leaves both pills unselected.
  const current: SelectMode = selectMode === 'plain' ? 'plain' : 'searchable';

  return (
    <SettingsRow icon={ChevronsUpDown} title={d.selectMode.title} hint={d.selectMode.hint}>
      <SegmentedControl
        options={MODES.map((mode) => ({ value: mode, label: labels[mode] }))}
        value={current} onChange={onChange} ariaLabel={d.selectMode.title}
      />
    </SettingsRow>
  );
}
