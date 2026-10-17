import { Skeleton } from '@/components/kit/Skeleton';
import { BarsSkeleton, RingSkeleton, RowsSkeleton } from '@/components/dashboard/DashSkeletons';
import { LoadingStatus } from '@/components/dashboard/LoadingStatus';

/**
 * Suspense fallback for /dashboard only, overriding the (app) group's large
 * spinner for this one route, deliberately: a skeleton in the dashboard's own
 * shape says "working" just as clearly, and when the data lands the cards
 * fill in where they already stand instead of the page jumping from a
 * centred spinner to a full layout.
 *
 * Kept from the group fallback: the ~180ms delayed fade (.pb-dash-loading),
 * so a warm navigation never flashes a skeleton, and a status for screen
 * readers in the reader's language (LoadingStatus). The shapes are
 * decorative (Skeleton is aria-hidden); the region is marked busy.
 */
export default function DashboardLoading() {
  return (
    <div className="pb-dash pb-dash-loading" aria-busy="true">
      <LoadingStatus />
      <div className="pb-dash-area-top">
        <div className="pb-dash-skel-hero">
          <Skeleton width="9rem" height="0.8rem" />
          <Skeleton width="15rem" height="3rem" radius="0.75rem" />
          <Skeleton width="12rem" height="0.8rem" />
        </div>
        <div className="card pb-dash-card">
          <Skeleton width="7rem" height="1rem" />
          <div className="pb-dash-skel-tiles">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={{ display: 'grid', gap: 8 }}>
                <Skeleton width="60%" height="0.75rem" />
                <Skeleton width="80%" height="1.4rem" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="pb-dash-area-pace"><div className="card pb-dash-card"><Skeleton width="8rem" height="1rem" /><BarsSkeleton minHeight={200} /></div></div>
      <div className="pb-dash-area-upcoming"><div className="card pb-dash-card"><Skeleton width="6rem" height="1rem" /><RowsSkeleton rows={3} /></div></div>
      <div className="pb-dash-area-where"><div className="card pb-dash-card"><Skeleton width="7rem" height="1rem" /><RingSkeleton /></div></div>
      <div className="pb-dash-area-flow"><div className="card pb-dash-card"><Skeleton width="9rem" height="1rem" /><BarsSkeleton /></div></div>
    </div>
  );
}
