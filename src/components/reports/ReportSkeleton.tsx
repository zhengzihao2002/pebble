import { Skeleton } from '@/components/kit/Skeleton';
import { ReportLoadingStatus } from './ReportLoadingStatus';

/**
 * The report's shape while it is on its way: the toolbar, the summary card
 * (figure, split bar, chart) and two period cards of rows. Used by the route's
 * loading.tsx and by ReportsClient for its first frame (before the saved
 * filters and the zone-aware date are known), so the page no longer paints the
 * whole unfiltered history and then snaps to the real view.
 *
 * A Server-safe component (no hooks); ReportLoadingStatus announces the words.
 */
export function ReportSkeleton({ delayed = false }: { delayed?: boolean }) {
  return (
    <div className={`pb-rep pb-rep-skel${delayed ? ' is-delayed' : ''}`}>
      <ReportLoadingStatus />
      <div className="pb-rep-skel-bar">
        <Skeleton width="2.5rem" height="2.5rem" radius="999px" />
        <Skeleton width="9rem" height="1.3rem" />
        <Skeleton width="2.5rem" height="2.5rem" radius="999px" />
        <span style={{ flex: 1 }} />
        <Skeleton width="6rem" height="2.5rem" radius="999px" />
      </div>
      <div className="card pb-rep-skel-card">
        <Skeleton width="8rem" height="0.75rem" />
        <Skeleton width="13rem" height="2.6rem" radius="0.7rem" />
        <Skeleton width="10rem" height="0.8rem" />
        <Skeleton height="10px" radius="999px" />
        <Skeleton height="7rem" radius="0.8rem" />
      </div>
      {[0, 1].map((c) => (
        <div key={c} className="card pb-rep-skel-card is-list">
          <Skeleton width="9rem" height="1.15rem" />
          {[0, 1, 2, 3, 4].map((r) => (
            <div key={r} className="pb-rep-skel-row">
              <Skeleton width={36} height={36} radius="0.65rem" style={{ flex: 'none' }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Skeleton width="50%" height="0.8rem" />
                <Skeleton width="30%" height="0.65rem" />
              </div>
              <Skeleton width="4.5rem" height="0.8rem" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
