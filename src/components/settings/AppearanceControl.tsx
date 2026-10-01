'use client';

import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { APPEARANCE_CHOICES, isAppearance, type Appearance } from '@/lib/appearance';

interface AppearanceControlProps {
  appearance: Appearance;
  onChange: (value: Appearance) => void;
}

// Fixed Original-theme colours, so each tile reads plainly as light or dark
// whatever theme is active. System is drawn half and half.
const LIGHT = { bg: '#F1F3EE', card: '#FFFFFF', bar: '#1F5A45' };
const DARK = { bg: '#121C18', card: '#1A2621', bar: '#57A487' };

const ICONS = { light: Sun, dark: Moon, system: Monitor } as const;

export function AppearanceControl({ appearance, onChange }: AppearanceControlProps) {
  const { d } = useTranslation();
  const current: Appearance = isAppearance(appearance) ? appearance : 'system';

  return (
    <div className="card" style={{ padding: '1.5rem' }}>
      <h3 style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.3rem' }}>{d.appearance.title}</h3>
      <p style={{ fontSize: '0.8rem', color: 'var(--ink-soft)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
        {d.appearance.blurb}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))', gap: '0.6rem' }}>
        {APPEARANCE_CHOICES.map((choice) => {
          const active = current === choice;
          const Icon = ICONS[choice];
          const split = choice === 'system';
          const p = choice === 'dark' ? DARK : LIGHT;
          const bg = split ? `linear-gradient(135deg, ${LIGHT.bg} 50%, ${DARK.bg} 50%)` : p.bg;
          const card = split ? `linear-gradient(135deg, ${LIGHT.card} 50%, ${DARK.card} 50%)` : p.card;
          const bar = split ? `linear-gradient(90deg, ${LIGHT.bar} 50%, ${DARK.bar} 50%)` : p.bar;
          return (
            <button
              key={choice}
              type="button"
              onClick={() => onChange(choice)}
              aria-pressed={active}
              style={{
                display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.55rem',
                borderRadius: '0.8rem', backgroundColor: 'var(--mist)', textAlign: 'left', cursor: 'pointer',
                border: active ? '2px solid var(--pine)' : '1px solid var(--line)',
              }}
            >
              <span style={{ display: 'block', height: 46, borderRadius: '0.55rem', background: bg, border: '1px solid rgba(0,0,0,0.08)', position: 'relative', overflow: 'hidden' }}>
                <span style={{ position: 'absolute', left: 8, right: 8, top: 8, height: 12, borderRadius: 4, background: card }} />
                <span style={{ position: 'absolute', left: 8, bottom: 8, width: 36, height: 8, borderRadius: 4, background: bar }} />
              </span>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, fontSize: '0.8rem', fontWeight: 500, color: 'var(--ink)' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <Icon size={14} />{d.appearance[choice]}
                </span>
                {active && <Check size={14} style={{ color: 'var(--pine)', flexShrink: 0 }} />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
