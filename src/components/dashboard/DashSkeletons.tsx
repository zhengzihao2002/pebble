import { Skeleton } from '@/components/kit/Skeleton';

/*
 * Placeholders in the shape of what is coming, shown while the zone-aware
 * "today" and the saved period resolve. Each keeps the min-height the card
 * always reserved (220 / 240 / 120px), so nothing below moves and the charts
 * still draw exactly once. Decorative: Skeleton is aria-hidden.
 *
 * No 'use client' and no hooks, so the route's loading.tsx (a Server
 * Component) can render the same shapes.
 */

/** Bar stubs over a baseline, for the cash-flow and pace charts. */
export function BarsSkeleton({ minHeight = 220 }: { minHeight?: number }) {
  const heights = [46, 72, 30, 58, 84, 40, 64];
  return (
    <div className="pb-dash-skel-bars" style={{ minHeight }} aria-hidden="true">
      {heights.map((h, i) => (
        <Skeleton key={i} width="100%" height={`${h}%`} radius="0.4rem 0.4rem 0 0" />
      ))}
    </div>
  );
}

/** A ring outline beside a few legend rows. */
export function RingSkeleton({ minHeight = 240 }: { minHeight?: number }) {
  return (
    <div className="pb-dash-skel-ring" style={{ minHeight }} aria-hidden="true">
      <span className="pb-dash-skel-ring-shape" />
      <div className="pb-dash-skel-rows">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} height="0.85rem" width={`${88 - i * 12}%`} />)}
      </div>
    </div>
  );
}

/** List rows: a tile, two lines of text, an amount. */
export function RowsSkeleton({ rows = 3, minHeight = 120 }: { rows?: number; minHeight?: number }) {
  return (
    <div className="pb-dash-skel-list" style={{ minHeight }} aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="pb-dash-skel-row">
          <Skeleton width={36} height={36} radius="0.65rem" />
          <div style={{ flex: 1, display: 'grid', gap: 6 }}>
            <Skeleton width={`${70 - i * 8}%`} height="0.8rem" />
            <Skeleton width="40%" height="0.65rem" />
          </div>
          <Skeleton width="4.5rem" height="0.8rem" />
        </div>
      ))}
    </div>
  );
}
