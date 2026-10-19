'use client';

import { useTranslation } from '@/lib/i18n/useTranslation';
import { STABILITY_THRESHOLDS, type StabilityBand } from '@/lib/analysis/income';

/** The meter's right end, as a coefficient of variation: past it, the marker
 *  stays pinned at the end of the last band. */
const CV_MAX = 0.75;
const BANDS: { key: StabilityBand; to: number }[] = [
  { key: 'veryStable', to: STABILITY_THRESHOLDS.veryStable },
  { key: 'stable', to: STABILITY_THRESHOLDS.stable },
  { key: 'variable', to: STABILITY_THRESHOLDS.variable },
  { key: 'highlyVariable', to: CV_MAX },
];

/**
 * Income stability on a four-band meter, its bands drawn from the very
 * thresholds that classify it (STABILITY_THRESHOLDS), with a marker at the
 * measured variation. The band word stays the tile's figure, so the meter
 * never carries the meaning alone. Not money: not blurred.
 */
export function StabilityMeter({ cv, band }: { cv: number; band: StabilityBand | null }) {
  const { d, t } = useTranslation();
  const at = Math.min(cv, CV_MAX) / CV_MAX;
  const widths = BANDS.map((b, i) => ((b.to - (i === 0 ? 0 : BANDS[i - 1].to)) / CV_MAX) * 100);
  return (
    <div className="pb-ana-meter" role="img" aria-label={t(d.ux.analysis.stabilityMeter, { pct: (cv * 100).toFixed(0) })}>
      <span className="pb-ana-meter-track">
        {BANDS.map((b, i) => (
          <span key={b.key} className={`is-${b.key}${band === b.key ? ' is-on' : ''}`} style={{ width: `${widths[i]}%` }} />
        ))}
      </span>
      <span className="pb-ana-meter-mark" style={{ left: `${at * 100}%` }} />
    </div>
  );
}

/**
 * Gross pay split into take-home (pine) and withheld (gold), with both
 * shares in words beside the bar. Shares, not amounts - but wrapped in
 * pb-chart-fill with every other visual so privacy mode treats it alike.
 */
export function PaycheckSplit({ rate }: { rate: number }) {
  const { d, t } = useTranslation();
  const x = d.ux.analysis;
  const withheld = Math.max(0, Math.min(100, rate));
  const net = 100 - withheld;
  return (
    <div className="pb-ana-paysplit">
      <span className="pb-ana-split pb-chart-fill" role="img" aria-label={t(x.splitLabel, { net: net.toFixed(0), withheld: withheld.toFixed(0) })}>
        <span className="is-in" style={{ flexGrow: net }} />
        <span className="is-gold" style={{ flexGrow: withheld }} />
      </span>
      <span className="pb-ana-paysplit-key" aria-hidden="true">
        <span><i className="is-in" />{x.takeHome} <b className="pb-tnum">{net.toFixed(0)}%</b></span>
        <span><i className="is-gold" />{x.withheld} <b className="pb-tnum">{withheld.toFixed(0)}%</b></span>
      </span>
    </div>
  );
}
