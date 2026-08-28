'use client';

import { Check } from 'lucide-react';
import { LOCALES, type Locale } from '@/lib/i18n';
import { useTranslation } from '@/lib/i18n/useTranslation';

interface LanguageControlProps {
  locale: Locale;
  onChange: (value: Locale) => void;
}

/**
 * Two-option language picker.
 *
 * Inline styles and existing CSS custom properties only - no new class and no
 * change to globals.css, matching how error.tsx, Spinner.tsx and the goals
 * page are already written. A Switch would have been wrong semantically (two
 * named choices, not on/off) and .pill was not used because its padding and
 * active-state behaviour are not verified here; the no-restyling rule cuts
 * both ways.
 *
 * The card chrome (.card + its own padding) mirrors AppearanceControl exactly,
 * since .card supplies background/border/radius/shadow but NO padding.
 */
export function LanguageControl({ locale, onChange }: LanguageControlProps) {
  const { d } = useTranslation();

  const labels: Record<Locale, string> = {
    en: d.settings.language.english,
    zh: d.settings.language.chinese,
  };

  return (
    <div className="card" style={{ padding: '1.5rem' }}>
      <h3 style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '1rem' }}>
        {d.settings.language.title}
      </h3>

      <p style={{ fontSize: '0.87rem', fontWeight: 500 }}>{d.settings.language.label}</p>
      <p style={{ fontSize: '0.78rem', color: 'var(--ink-soft)', lineHeight: 1.5, marginBottom: '0.9rem' }}>
        {d.settings.language.hint}
      </p>

      {/* Wraps rather than scrolls: two short labels, but 375px with the text
          size turned up is the viewport this app has had overflow bugs in. */}
      <div role="group" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {LOCALES.map((code) => {
          const active = code === locale;
          return (
            <button
              key={code}
              type="button"
              onClick={() => onChange(code)}
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
              {labels[code]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
