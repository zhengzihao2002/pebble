'use client';

import { useState } from 'react';
import { formatCurrency } from '@/lib/format';

interface SparkBarsProps {
  /** Oldest first. */
  values: number[];
  /** Each value's month, written out ("September 2026"). */
  labels: string[];
  /** The category's colour - an identity mark, never text. */
  color: string;
  /** A dashed hairline at this value (the comparison average). */
  reference?: number;
  /** Accessible name for the group ("Dining, last 6 months"). */
  label: string;
}

/**
 * A row-sized bar chart in plain HTML: the last bar in full colour, earlier
 * ones at 40%, a dashed line at the average they are compared with. One
 * Recharts chart per row was heavy (up to every category with Show all);
 * this draws the same bars with no measuring.
 *
 * Hover or tap a bar for "Month YYYY · $amount"; keyboard: Tab to the chart,
 * arrows move between months. Wears pb-chart-fade: privacy mode blurs it
 * (and blocks the pointer, so the tooltip cannot leak an amount) until the
 * chart is tapped to reveal it.
 */
export function SparkBars({ values, labels, color, reference, label }: SparkBarsProps) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...values, reference ?? 0, 0);
  const last = values.length - 1;
  const h = (v: number) => (max > 0 ? Math.max(v > 0 ? 6 : 0, (v / max) * 100) : 0);

  return (
    <div
      className="pb-chart-fade pb-ins-spark" style={{ ['--pb-ins-cat' as string]: color }}
      role="img" tabIndex={0}
      aria-label={`${label}: ${values.map((v, i) => `${labels[i]} ${formatCurrency(v)}`).join(', ')}`}
      onFocus={() => setActive(last)}
      onBlur={() => setActive(null)}
      onPointerLeave={() => setActive(null)}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        setActive((a) => Math.min(last, Math.max(0, (a ?? last) + (e.key === 'ArrowLeft' ? -1 : 1))));
      }}
    >
      <div className="pb-ins-spark-bars" aria-hidden="true">
        {values.map((v, i) => (
          <span
            key={i} className={`pb-ins-spark-col${i === last ? ' is-last' : ''}${active === i ? ' is-active' : ''}`}
            onPointerEnter={() => setActive(i)} onPointerDown={() => setActive(i)}
          >
            <span className="pb-ins-spark-bar" style={{ height: `${h(v)}%` }} />
          </span>
        ))}
        {reference !== undefined && reference > 0 && max > 0 && (
          <span className="pb-ins-spark-ref" style={{ bottom: `${(reference / max) * 100}%` }} />
        )}
      </div>
      {active !== null && (
        <span
          className="pb-ins-tip pb-ins-spark-tip" aria-hidden="true"
          style={{ left: `${((active + 0.5) / values.length) * 100}%` }}
        >
          <span className="pb-ins-tip-soft">{labels[active]}</span>
          {' · '}
          <span className="font-mono-tab">{formatCurrency(values[active])}</span>
        </span>
      )}
    </div>
  );
}
