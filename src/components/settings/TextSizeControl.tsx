'use client';

import { Type } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { SettingsRow } from './SettingsRow';
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
    <SettingsRow icon={Type} title={d.textSize.title} hint={d.textSize.blurb} layout="stack">
      <div className="pb-settings-size">
        <input
          type="range" min="80" max="150" step="5" value={textSize}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={d.textSize.title}
          className="pb-settings-range"
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <input
            type="number" min="80" max="150" step="5" value={textSize}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!Number.isNaN(v)) onChange(Math.min(150, Math.max(80, v)));
            }}
            aria-label={d.textSize.title}
            className="font-mono-tab text-size-input"
            style={{ width: 'calc(3ch + 0.8rem + 2px)', padding: '0.35rem 0.4rem', borderRadius: '0.5rem', border: '1px solid var(--line)', fontSize: '0.85rem', color: 'var(--ink)', backgroundColor: 'var(--paper)', textAlign: 'right', boxSizing: 'border-box' }}
          />
          <span style={{ fontSize: '0.85rem', color: 'var(--ink-soft)' }}>%</span>
        </div>
      </div>
      {/* Toggle buttons in a capsule, not the kit SegmentedControl: the size
          is often between presets (the slider moves in 5% steps), and a
          radiogroup with nothing checked leaves no option reachable by Tab. */}
      <div role="group" aria-label={d.textSize.title} className="pb-settings-presets">
        {PRESETS.map((p) => (
          <button
            key={p.labelKey} type="button" onClick={() => onChange(p.value)} aria-pressed={textSize === p.value}
            className={`pb-settings-preset${textSize === p.value ? ' is-active' : ''}`}
          >
            {d.textSize[p.labelKey]}
          </button>
        ))}
      </div>
    </SettingsRow>
  );
}
