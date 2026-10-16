'use client';

import { useLayoutEffect, useRef, useState } from 'react';

interface SparklineProps {
  /** Oldest first. Non-finite values are treated as 0. */
  values: number[];
  /** Pixels. Width fills the container. */
  height?: number;
  /** The line colour - a theme token. */
  color?: string;
  /** A faint wash under the line. */
  area?: boolean;
  /** Mark the last point (the current period). */
  endDot?: boolean;
  /** Draw a hairline at this value (e.g. 0, or an average). */
  baseline?: number;
  /** Accessible summary, e.g. "Spending, last 12 months, rising". Omit when
      the figures are spelled out beside it; it is then hidden. */
  label?: string;
  className?: string;
}

/**
 * A word-sized trend line: 2px, round joins, the series hue at about 10% under
 * it, an end dot with a ring in the card's colour. No axes - it sits beside
 * the figure it explains.
 *
 * Wears pb-chart-fade, so privacy mode blurs it like every other chart and a
 * tap reveals it (AppShell), and it fades in rather than drawing from zero.
 */
export function Sparkline({ values, height = 32, color = 'var(--pine)', area = true, endDot = true, baseline, label, className }: SparklineProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const vals = values.map((v) => (Number.isFinite(v) ? v : 0));
  const pad = 4; // room for the end dot and its ring
  let path = '';
  let fill = '';
  let end: { x: number; y: number } | null = null;
  let baseY: number | null = null;

  if (width > 0 && vals.length > 0) {
    const all = baseline === undefined ? vals : [...vals, baseline];
    const min = Math.min(...all);
    const max = Math.max(...all);
    const span = max - min || 1;
    const w = width - pad * 2;
    const h = height - pad * 2;
    const x = (i: number) => pad + (vals.length === 1 ? w / 2 : (i / (vals.length - 1)) * w);
    const y = (v: number) => pad + h - ((v - min) / span) * h;
    const pts = vals.map((v, i) => [x(i), y(v)] as const);
    path = pts.map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${px.toFixed(1)} ${py.toFixed(1)}`).join('');
    fill = `${path}L${pts[pts.length - 1][0].toFixed(1)} ${height}L${pts[0][0].toFixed(1)} ${height}Z`;
    end = { x: pts[pts.length - 1][0], y: pts[pts.length - 1][1] };
    if (baseline !== undefined) baseY = y(baseline);
  }

  return (
    <div
      ref={ref}
      className={`pb-spark pb-chart-fade${className ? ` ${className}` : ''}`}
      style={{ height, ['--pb-spark-color' as string]: color }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {width > 0 && (
        <svg width={width} height={height} aria-hidden="true" focusable="false">
          {baseY !== null && <line className="pb-spark-base" x1={pad} x2={width - pad} y1={baseY} y2={baseY} />}
          {area && <path className="pb-spark-area" d={fill} />}
          <path className="pb-spark-line" d={path} />
          {endDot && end && <circle className="pb-spark-dot" cx={end.x} cy={end.y} r={3.5} />}
        </svg>
      )}
    </div>
  );
}
