'use client';

import { useTranslation } from '@/lib/i18n/useTranslation';
import type { Dictionary } from '@/lib/i18n';

interface TextSizeControlProps {
  textSize: number;
  onChange: (value: number) => void;
}

// Value plus a dictionary key, not a label. Module scope cannot call a hook,
// so the component resolves - the same arrangement navItems.ts uses.
//
// The key is also the React key. It was the LABEL before this change, which
// meant every preset button remounted on a language switch.
const PRESETS: { labelKey: keyof Dictionary['textSize']; value: number }[] = [
  { labelKey: 'small', value: 85 },
  { labelKey: 'default', value: 100 },
  { labelKey: 'large', value: 115 },
  { labelKey: 'extraLarge', value: 130 },
];

export function TextSizeControl({ textSize, onChange }: TextSizeControlProps) {
  const { d } = useTranslation();

  return (
    <div className="card" style={{ padding: '1.5rem' }}>
      <h3 style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.3rem' }}>{d.textSize.title}</h3>
      <p style={{ fontSize: '0.8rem', color: 'var(--ink-soft)', marginBottom: '1.25rem' }}>
        {d.textSize.blurb}
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
        <input
          type="range" min="80" max="150" step="5" value={textSize}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ flex: 1, accentColor: 'var(--pine)' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <input
            type="number" min="80" max="150" step="5" value={textSize}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!Number.isNaN(v)) onChange(Math.min(150, Math.max(80, v)));
            }}
            className="font-mono-tab"
            style={{ width: 54, padding: '0.35rem 0.4rem', borderRadius: '0.5rem', border: '1px solid var(--line)', fontSize: '0.85rem', color: 'var(--ink)', backgroundColor: 'var(--paper)', textAlign: 'right', boxSizing: 'border-box' }}
          />
          <span style={{ fontSize: '0.85rem', color: 'var(--ink-soft)' }}>%</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {PRESETS.map((p) => (
          <button key={p.labelKey} onClick={() => onChange(p.value)} className={`pill ${textSize === p.value ? 'active' : ''}`}>
            {d.textSize[p.labelKey]}
          </button>
        ))}
      </div>
    </div>
  );
}
