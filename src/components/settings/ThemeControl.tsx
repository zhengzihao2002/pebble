'use client';

import { Check } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { THEME_CHOICES, isThemeChoice, type ThemeChoice } from '@/lib/themeChoice';

interface ThemeControlProps {
  theme: ThemeChoice;
  onChange: (value: ThemeChoice) => void;
}

// Light-mode swatches for each preview tile. GENERATED from the same table as
// the theme CSS in globals.css - keep the two in step.
const PREVIEW: Record<ThemeChoice, { paper: string; mist: string; pine: string; gold: string; wine: string }> = {
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
    <div className="card" style={{ padding: '1.5rem' }}>
      <h3 style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.3rem' }}>{d.theme.title}</h3>
      <p style={{ fontSize: '0.8rem', color: 'var(--ink-soft)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
        {d.theme.blurb}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))', gap: '0.6rem' }}>
        {/* The array holds VALUES; the dictionary is indexed by them. */}
        {THEME_CHOICES.map((choice) => {
          const p = PREVIEW[choice];
          const active = current === choice;
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
              <span style={{ display: 'block', height: 46, borderRadius: '0.55rem', backgroundColor: p.paper, border: '1px solid rgba(0,0,0,0.06)', position: 'relative', overflow: 'hidden' }}>
                <span style={{ position: 'absolute', left: 8, right: 8, top: 8, height: 12, borderRadius: 4, backgroundColor: p.mist }} />
                <span style={{ position: 'absolute', left: 8, bottom: 8, display: 'flex', gap: 5 }}>
                  {[p.pine, p.gold, p.wine].map((c, i) => (
                    <span key={i} style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: c }} />
                  ))}
                </span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, fontSize: '0.8rem', fontWeight: 500, color: 'var(--ink)' }}>
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
