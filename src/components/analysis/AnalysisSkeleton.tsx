import { Skeleton } from '@/components/kit/Skeleton';
import { AnalysisLoadingStatus } from './AnalysisLoadingStatus';

/**
 * The page's shape while `today` resolves (and for the route's loading.tsx):
 * the hero, the month-so-far card, a tile row and two chart cards, at their
 * real heights so nothing jumps when the figures arrive. Static - no hooks,
 * no clock - so the server render and the first client render are identical.
 *
 * The period bar is NOT part of it: AnalysisClient renders the real bar
 * above this, so the control is usable from the first frame.
 */
export function AnalysisSkeleton({ delayed = false, withBar = false }: { delayed?: boolean; withBar?: boolean }) {
  return (
    <div className={`pb-ana-skel${delayed ? ' is-delayed' : ''}`}>
      <AnalysisLoadingStatus />
      {withBar && (
        <div className="pb-ana-skel-bar">
          <Skeleton width="16rem" height="2rem" radius="999px" />
          <Skeleton width="12rem" height="0.8rem" />
        </div>
      )}
      <div className="pb-ana-grid">
        <div className="card pb-ana-skel-card pb-ana-span-hero">
          <Skeleton width="6rem" height="0.75rem" />
          <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center' }}>
            <Skeleton width={124} height={124} radius="999px" style={{ flex: 'none' }} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Skeleton width="40%" height="0.8rem" />
              <Skeleton width="90%" height="0.8rem" />
              <Skeleton width="70%" height="0.8rem" />
            </div>
          </div>
          <Skeleton height="5.5rem" radius="0.8rem" />
        </div>
        <div className="card pb-ana-skel-card pb-ana-span-now">
          <Skeleton width="9rem" height="1rem" />
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <Skeleton width={88} height={88} radius="999px" style={{ flex: 'none' }} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Skeleton width="80%" height="0.8rem" />
              <Skeleton width="80%" height="0.8rem" />
              <Skeleton width="80%" height="0.8rem" />
            </div>
          </div>
          <Skeleton height="7rem" radius="0.8rem" />
        </div>
        {[0, 1].map((i) => (
          <div key={i} className="card pb-ana-skel-card pb-ana-span-half">
            <Skeleton width="8rem" height="1rem" />
            <Skeleton height="220px" radius="0.8rem" />
          </div>
        ))}
      </div>
    </div>
  );
}
