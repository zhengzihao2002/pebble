'use client';

import { Check } from 'lucide-react';
import { usePebbleStore } from '@/store/usePebbleStore';
import { useTranslation } from '@/lib/i18n/useTranslation';

/**
 * Whether amounts start blurred when Pebble opens. The header eye switches
 * privacy for the session; this only sets where each launch starts.
 * Pill styling copied from SelectModeControl.
 */
export function PrivacyControl() {
  const { d } = useTranslation();
  const privacyOnLaunch = usePebbleStore((s) => s.privacyOnLaunch);
  const setPrivacyOnLaunch = usePebbleStore((s) => s.setPrivacyOnLaunch);
  // Anything but exactly true is "show", so a value from another build
  // never leaves both pills unselected.
  const current = privacyOnLaunch === true;

  const options: { value: boolean; label: string }[] = [
    { value: false, label: d.privacyMode.optionShow },
    { value: true, label: d.privacyMode.optionBlur },
  ];

  return (
    <div className="card" style={{ padding: '1.5rem' }}>
      <h3 style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.3rem' }}>
        {d.privacyMode.title}
      </h3>
      <p style={{ fontSize: '0.78rem', color: 'var(--ink-soft)', lineHeight: 1.5, marginBottom: '0.9rem' }}>
        {d.privacyMode.hint}
      </p>

      <div role="group" aria-label={d.privacyMode.title} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {options.map((o) => {
          const active = o.value === current;
          return (
            <button
              key={String(o.value)}
              type="button"
              onClick={() => setPrivacyOnLaunch(o.value)}
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
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
