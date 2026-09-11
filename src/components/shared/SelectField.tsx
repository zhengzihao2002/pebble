'use client';

import type { ComponentProps } from 'react';
import { SearchableSelect, type SearchableSelectOption } from '@/components/shared/SearchableSelect';
import { usePebbleStore } from '@/store/usePebbleStore';
import { useTranslation } from '@/lib/i18n/useTranslation';

export type SelectFieldOption = SearchableSelectOption;
// Derived rather than duplicated: SearchableSelect does not export its props
// interface, and a hand-copied one would drift the first time it changed.
export type SelectFieldProps = ComponentProps<typeof SearchableSelect>;

/**
 * Every user-data dropdown goes through here, never SearchableSelect directly,
 * so the Settings choice applies everywhere at once.
 *
 * 'plain' renders the browser's native <select>. Anything else - including a
 * value written by an older or newer build - renders SearchableSelect with
 * every prop passed through untouched.
 *
 * Plain mode deliberately IGNORES: option icon and color (native options
 * cannot show them), placeholder (the existing ones say "Search…", which is
 * wrong on a control you cannot type into) and emptyMessage (nothing filters).
 *
 * Hydration: the store read returns the default on the server and first
 * client render, then the stored value. On server-rendered pages a plain-mode
 * user sees the searchable input for one frame. Accepted; see Phase 0 notes.
 */
export function SelectField(props: SelectFieldProps) {
  // Both hooks run before the branch so hook order never changes with mode.
  const selectMode = usePebbleStore((s) => s.selectMode);
  const { d } = useTranslation();

  if (selectMode !== 'plain') return <SearchableSelect {...props} />;

  const { value, onChange, options, disabled, style, id, ariaLabel } = props;
  // A controlled <select> whose value matches no option DISPLAYS the first
  // option while state still holds the unmatched value - the form would look
  // chosen and not be. A disabled empty option makes that state visible.
  const hasMatch = options.some((o) => o.value === value);

  return (
    <select
      id={id}
      aria-label={ariaLabel}
      value={hasMatch ? value : ''}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      style={{
        padding: '0.6rem 0.75rem', borderRadius: '0.6rem',
        border: '1px solid var(--line)', fontSize: '0.9rem', color: 'var(--ink)',
        backgroundColor: 'var(--paper)', boxSizing: 'border-box', width: '100%',
        opacity: disabled ? 0.6 : 1, cursor: disabled ? 'not-allowed' : 'pointer',
        ...style,
      }}
    >
      {!hasMatch && <option value="" disabled>{d.select.choose}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
