'use client';

import { Check, Palette } from 'lucide-react';
import { SectionHeader } from '@/components/kit/SectionHeader';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { SETTING_TARGETS } from './settingsTargets';
import { THEME_CHOICES, isThemeChoice, type ThemeChoice } from '@/lib/themeChoice';

interface ThemeControlProps {
  theme: ThemeChoice;
  onChange: (value: ThemeChoice) => void;
}

// Light-mode swatches for each preview tile. GENERATED from the same table as
// the theme CSS in globals.css - keep the two in step.
export const THEME_PREVIEW: Record<ThemeChoice, { paper: string; mist: string; pine: string; gold: string; wine: string }> = {
  original: { paper: '#F1F3EE', mist: '#FFFFFF', pine: '#1F5A45', gold: '#AD7B2E', wine: '#8C3D42' },
  ocean: { paper: '#EEF3F6', mist: '#FFFFFF', pine: '#1E5F8C', gold: '#B7792B', wine: '#A33D48' },
  sakura: { paper: '#F9F1F3', mist: '#FFFFFF', pine: '#2F6B5E', gold: '#B8577A', wine: '#9C3B30' },
  slate: { paper: '#F2F3F5', mist: '#FFFFFF', pine: '#3D56A6', gold: '#A9853A', wine: '#A63F3F' },
  sand: { paper: '#F5F0E6', mist: '#FFFDF8', pine: '#4F6B34', gold: '#B7862C', wine: '#9E3B34' },
};

export function ThemeControl({ theme, onChange }: ThemeControlProps) {
  const { d } = useTranslation();
  // A stored value from another build shows as Original - which is exactly
  // what AppShell applies for it.
  const current: ThemeChoice = isThemeChoice(theme) ? theme : 'original';

  return (
    <div id={SETTING_TARGETS.theme} className="card pb-settings-card pb-settings-target">
      <SectionHeader icon={Palette} title={d.theme.title} subtitle={d.theme.blurb} />
      <div className="pb-settings-tiles">
        {/* The array holds VALUES; the dictionary is indexed by them. */}
        {THEME_CHOICES.map((choice) => {
          const p = THEME_PREVIEW[choice];
          const active = current === choice;
          return (
            <button
              key={choice}
              type="button"
              onClick={() => onChange(choice)}
              aria-pressed={active}
              className={`pb-settings-tile${active ? ' is-active' : ''}`}
            >
              <span className="pb-settings-tile-face" style={{ backgroundColor: p.paper }}>
                <span style={{ position: 'absolute', left: 8, right: 8, top: 8, height: 12, borderRadius: 4, backgroundColor: p.mist }} />
                <span style={{ position: 'absolute', left: 8, bottom: 8, display: 'flex', gap: 5 }}>
                  {[p.pine, p.gold, p.wine].map((c, i) => (
                    <span key={i} style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: c }} />
                  ))}
                </span>
              </span>
              <span className="pb-settings-tile-name">
                {d.theme[choice]}
                {active && <Check size={14} style={{ color: 'var(--pine)', flexShrink: 0 }} />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
