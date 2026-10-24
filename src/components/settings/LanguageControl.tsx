'use client';

import { Languages } from 'lucide-react';
import { SegmentedControl } from '@/components/kit/SegmentedControl';
import { SettingsRow } from './SettingsRow';
import { LOCALES, type Locale } from '@/lib/i18n';
import { useTranslation } from '@/lib/i18n/useTranslation';

interface LanguageControlProps {
  locale: Locale;
  onChange: (value: Locale) => void;
}

/**
 * Two-option language picker.
 *
 * Now the kit SegmentedControl. This supersedes the earlier note here about
 * not using .pill: that reason was unverified pill padding, and the kit
 * control is a verified component that still shows both named choices (a
 * Switch stays wrong semantically - two languages, not on/off). It does not
 * wrap, but two short labels fit the narrowest card at the largest text
 * size, and on a narrow card the row puts it under the text at full width.
 */
export function LanguageControl({ locale, onChange }: LanguageControlProps) {
  const { d } = useTranslation();

  const labels: Record<Locale, string> = {
    en: d.settings.language.english,
    zh: d.settings.language.chinese,
  };

  return (
    <SettingsRow icon={Languages} title={d.settings.language.title} hint={d.settings.language.hint}>
      <SegmentedControl
        options={LOCALES.map((code) => ({ value: code, label: labels[code] }))}
        value={locale} onChange={onChange} ariaLabel={d.settings.language.label}
      />
    </SettingsRow>
  );
}
