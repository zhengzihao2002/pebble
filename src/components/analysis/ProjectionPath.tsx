'use client';

import { useTranslation } from '@/lib/i18n/useTranslation';
import type { Projection } from '@/lib/analysis/projection';

interface ProjectionPathProps {
  projection: Projection;
  /** Today's balance, the projection's starting point. */
  balance: number;
  /** 0..1 of the calendar year gone. */
  yearGone: number;
}

/**
 * Today's balance and both year-end estimates as markers on one horizontal
 * scale, so the direction and the size of the seasonal gap read at a glance.
 * The span between Flat and Seasonal is shaded as the seasonal exposure the
 * explanation talks about. With no seasonal figure (under two full years)
 * only Today and Flat show, and the Seasonal marker is a hollow placeholder.
 *
 * Names only on the scale - the amounts are the tiles right below it.
 * Inside pb-chart-fade: privacy mode blurs it, since positions imply amounts.
 */
export function ProjectionPath({ projection, balance, yearGone }: ProjectionPathProps) {
  const { d, t } = useTranslation();
  const x = d.ux.analysis;
  const vals = [balance, projection.flat, ...(projection.seasonal !== null ? [projection.seasonal] : [])];
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  // 8%..92% of the track, so the end labels never leave the card.
  const at = (v: number) => (max === min ? 50 : 8 + ((v - min) / span) * 84);

  const today = at(balance);
  const flat = at(projection.flat);
  const seasonal = projection.seasonal !== null ? at(projection.seasonal) : null;
  const rising = projection.flat >= balance;

  const marks = [
    { key: 'today', pos: today, label: x.today },
    { key: 'flat', pos: flat, label: x.flat },
    ...(seasonal !== null ? [{ key: 'seasonal', pos: seasonal, label: x.seasonal }] : []),
  ];
  // Labels of markers that sit close together go to alternate sides.
  const sorted = [...marks].sort((a, b) => a.pos - b.pos);
  const below = new Set<string>();
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].pos - sorted[i - 1].pos < 16 && !below.has(sorted[i - 1].key)) below.add(sorted[i].key);
  }

  return (
    <div className="pb-ana-path">
      <div className="pb-chart-fade pb-ana-path-scale" role="img" aria-label={x.pathLabel}>
        <span className="pb-ana-path-axis" />
        <span
          className={`pb-ana-path-run${rising ? ' is-up' : ' is-down'}`}
          style={{ left: `${Math.min(today, flat)}%`, width: `${Math.abs(flat - today)}%` }}
        />
        {seasonal !== null && (
          <span
            className="pb-ana-path-gap"
            style={{ left: `${Math.min(flat, seasonal)}%`, width: `${Math.abs(seasonal - flat)}%` }}
          />
        )}
        {marks.map((m) => (
          <span key={m.key} className={`pb-ana-path-mark is-${m.key}${below.has(m.key) ? ' is-below' : ''}`} style={{ left: `${m.pos}%` }}>
            <i />
            <span>{m.label}</span>
          </span>
        ))}
      </div>
      <div className="pb-ana-path-legend">
        {seasonal !== null && <span><i className="is-gap" />{x.seasonalGap}</span>}
        <span className="pb-ana-path-year">
          <span className="pb-ana-path-yeartrack" aria-hidden="true"><span style={{ width: `${yearGone * 100}%` }} /></span>
          <span className="pb-tnum">{t(x.yearDone, { pct: `${Math.round(yearGone * 100)}%` })}</span>
        </span>
      </div>
    </div>
  );
}
