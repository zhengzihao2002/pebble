'use client';

import { useTranslation } from '@/lib/i18n/useTranslation';
import { healthHue, healthPoints } from '@/lib/healthBar';

interface HealthStatusBarProps {
  /** Standard income for the selected period. 0 means there is no rate at all. */
  income: number;
  /** The SAME figure as the Savings rate card - computeStatsForPeriod().savingsRate. */
  savingsRate: number;
}

// Fixed, not Math.random(): this renders on the server too, and a random
// layout would differ between the two renders. `left` is a share of the
// FILLED width, so bubbles only ever rise from the part of the bar showing.
const BUBBLES = [
  { left: 6, size: 5, dur: 3.1, delay: 0, drift: 2 },
  { left: 17, size: 3, dur: 2.6, delay: 1.2, drift: -2 },
  { left: 28, size: 6, dur: 3.8, delay: 0.5, drift: 3 },
  { left: 39, size: 4, dur: 2.9, delay: 2.1, drift: -3 },
  { left: 50, size: 3, dur: 3.4, delay: 0.9, drift: 2 },
  { left: 61, size: 5, dur: 4.1, delay: 1.7, drift: -2 },
  { left: 72, size: 4, dur: 2.7, delay: 0.3, drift: 3 },
  { left: 83, size: 6, dur: 3.6, delay: 2.5, drift: -3 },
  { left: 92, size: 3, dur: 3.0, delay: 1.4, drift: 2 },
];

/**
 * Savings-rate health bar under the Dashboard's four figures. Opt-in via
 * Settings > Appearance. Hue from healthHue(); lightness and chroma are
 * theme-level CSS variables, so every rate is equally soft in both themes.
 * All motion is decoration and stops under prefers-reduced-motion.
 */
export function HealthStatusBar({ income, savingsRate }: HealthStatusBarProps) {
  const { d, t } = useTranslation();
  const hasRate = income > 0;
  const hp = hasRate ? healthPoints(savingsRate) : 0;
  const label = hasRate ? t(d.healthBar.hp, { value: hp }) : d.healthBar.noIncome;

  return (
    <div className="health-bar" style={{ '--hp-hue': String(healthHue(savingsRate)) } as React.CSSProperties}>
      <div className="health-bar-head">
        <span style={{ fontSize: '0.68rem', color: 'var(--ink-soft)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {d.healthBar.title}
        </span>
        <span className="font-mono-tab" style={{ fontSize: '0.85rem', fontWeight: 600, color: hasRate ? 'var(--ink)' : 'var(--ink-soft)' }}>
          {label}
        </span>
      </div>
      <div
        className={`health-bar-track ${hasRate ? 'rated' : ''}`}
        role="meter"
        aria-label={d.healthBar.title}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={hp}
        aria-valuetext={label}
      >
        {hasRate && hp > 0 && (
          <>
            <div className="health-bar-fill" style={{ width: `${hp}%` }} />
            <div className="health-bar-bubbles" style={{ width: `${hp}%` }} aria-hidden="true">
              {BUBBLES.map((b, i) => (
                <span
                  key={i}
                  className="health-bar-bubble"
                  style={{
                    left: `${b.left}%`, width: b.size, height: b.size,
                    '--dur': `${b.dur}s`, '--delay': `${b.delay}s`, '--drift': `${b.drift}px`,
                  } as React.CSSProperties}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
