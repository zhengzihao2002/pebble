import type { ReactNode } from 'react';

interface ProgressRingProps {
  /** 0 to 1 for the main ring. With overflowColor, the next lap shows the excess. */
  value: number;
  /** Pixels, square. */
  size?: number;
  /** Ring thickness in pixels. */
  stroke?: number;
  /** The filled arc. A theme token: var(--pine), var(--gold), var(--wine). */
  color?: string;
  overflowColor?: string;
  /** Accessible name, e.g. "Emergency fund, 64% saved". Omit when the
      surrounding text already says it; the ring is then hidden. */
  label?: string;
  /** Centred inside the ring: a percentage, an icon. */
  children?: ReactNode;
  className?: string;
}

/**
 * A single-value ring: how far along something is. The unfilled track is a
 * faint step of the same colour, so the state reads across the whole ring.
 * The arc sweeps in from zero once (pb-ring-sweep); the global reduced-motion
 * rule shows it filled at once.
 *
 * No gradient ids, so any number can share a page and it renders identically
 * on the server.
 */
export function ProgressRing({ value, size = 64, stroke = 6, color = 'var(--pine)', overflowColor, label, children, className }: ProgressRingProps) {
  const pct = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  const overflow = Number.isFinite(value) ? Math.max(0, Math.min(1, value - 1)) : 0;
  const r = (size - stroke) / 2;
  return (
    <span
      className={`pb-ring${className ? ` ${className}` : ''}`}
      style={{ width: size, height: size, ['--pb-ring-color' as string]: color }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" focusable="false">
        <circle className="pb-ring-track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} />
        {pct > 0 && (
          <circle
            className="pb-ring-arc" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke}
            pathLength={100} strokeDasharray={`${pct * 100} 100`}
          />
        )}
        {overflowColor && overflow > 0 && (
          <circle
            className="pb-ring-arc pb-ring-overflow" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke}
            pathLength={100} strokeDasharray={`${overflow * 100} 100`} style={{ stroke: overflowColor }}
          />
        )}
      </svg>
      {children !== undefined && <span className="pb-ring-center">{children}</span>}
    </span>
  );
}
