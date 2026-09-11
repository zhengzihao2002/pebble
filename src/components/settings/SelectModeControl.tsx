'use client';

import { Check } from 'lucide-react';
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
 * Pill styling is copied from LanguageControl rather than using .pill, for the
 * reason given in that file. Two named choices, not a Switch, so the user can
 * see what the alternative is before picking it.
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
    <div className="card" style={{ padding: '1.5rem' }}>
      <h3 style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.3rem' }}>
        {d.selectMode.title}
      </h3>
      <p style={{ fontSize: '0.78rem', color: 'var(--ink-soft)', lineHeight: 1.5, marginBottom: '0.9rem' }}>
        {d.selectMode.hint}
      </p>

      <div role="group" aria-label={d.selectMode.title} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {MODES.map((mode) => {
          const active = mode === current;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => onChange(mode)}
              aria-pressed={active}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '0.5rem 0.95rem', borderRadius: '999px', fontSize: '0.83rem',
                fontWeight: active ? 600 : 500,
                border: `1px solid ${active ? 'var(--pine)' : 'var(--line)'}`,
                backgroundColor: active ? 'var(--pine-soft)' : 'transparent',
                color: active ? 'var(--pine)' : 'var(--ink-soft)',
              }}
            >
              {active && <Check size={14} />}
              {labels[mode]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
