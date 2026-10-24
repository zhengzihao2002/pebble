'use client';

import { Check, Monitor, Moon, Sun, SunMoon } from 'lucide-react';
import { SettingsRow } from './SettingsRow';
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
    <SettingsRow icon={SunMoon} title={d.appearance.title} hint={d.appearance.blurb} layout="stack">
      <div className="pb-settings-tiles">
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
              className={`pb-settings-tile${active ? ' is-active' : ''}`}
            >
              <span className="pb-settings-tile-face" style={{ background: bg }}>
                <span style={{ position: 'absolute', left: 8, right: 8, top: 8, height: 12, borderRadius: 4, background: card }} />
                <span style={{ position: 'absolute', left: 8, bottom: 8, width: 36, height: 8, borderRadius: 4, background: bar }} />
              </span>
              <span className="pb-settings-tile-name">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <Icon size={14} />{d.appearance[choice]}
                </span>
                {active && <Check size={14} style={{ color: 'var(--pine)', flexShrink: 0 }} />}
              </span>
            </button>
          );
        })}
      </div>
    </SettingsRow>
  );
}
