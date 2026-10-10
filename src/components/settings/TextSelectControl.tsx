'use client';

import { Check } from 'lucide-react';
import { usePebbleStore } from '@/store/usePebbleStore';
import { useTranslation } from '@/lib/i18n/useTranslation';

/**
 * Whether text in the app can be highlighted and copied. Off by default, so a
 * stray long-press on a phone does not select the page. Text fields and
 * search boxes always stay selectable (globals.css, .pb-no-select).
 * Pill styling copied from PrivacyControl.
 */
export function TextSelectControl() {
  const { d } = useTranslation();
  const allow = usePebbleStore((s) => s.allowTextSelect) === true;
  const setAllow = usePebbleStore((s) => s.setAllowTextSelect);
  const options: { value: boolean; label: string }[] = [
    { value: false, label: d.selectMode.textSelectOff },
    { value: true, label: d.selectMode.textSelectOn },
  ];

  return (
    <div className="card" style={{ padding: '1.5rem' }}>
      <h3 style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.3rem' }}>{d.selectMode.textSelectTitle}</h3>
      <p style={{ fontSize: '0.78rem', color: 'var(--ink-soft)', lineHeight: 1.5, marginBottom: '0.9rem' }}>{d.selectMode.textSelectHint}</p>
      <div role="group" aria-label={d.selectMode.textSelectTitle} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {options.map((o) => {
          const active = o.value === allow;
          return (
            <button
              key={String(o.value)} type="button" onClick={() => setAllow(o.value)} aria-pressed={active}
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
