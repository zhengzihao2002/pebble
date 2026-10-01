'use client';

import { useTranslation } from '@/lib/i18n/useTranslation';

export type ChartTypeValue = 'donut' | 'bar';

interface ChartTypeControlProps {
  value: ChartTypeValue;
  onChange: (value: ChartTypeValue) => void;
}

/** Choose how the Dashboard's "Where it went" card draws its categories. */
export function ChartTypeControl({ value, onChange }: ChartTypeControlProps) {
  const { d } = useTranslation();
  // The array holds the STORED values; the dictionary is indexed by them.
  const choices = ['donut', 'bar'] as const;

  return (
    <div className="card" style={{ padding: '1.5rem' }}>
      <h3 style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.3rem' }}>{d.chartType.title}</h3>
      <p style={{ fontSize: '0.8rem', color: 'var(--ink-soft)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
        {d.chartType.hint}
      </p>
      <div role="group" aria-label={d.chartType.title} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {choices.map((c) => (
          <button
            key={c} type="button" onClick={() => onChange(c)} aria-pressed={value === c}
            className={`pill ${value === c ? 'active' : ''}`}
          >
            {d.chartType[c]}
          </button>
        ))}
      </div>
    </div>
  );
}
