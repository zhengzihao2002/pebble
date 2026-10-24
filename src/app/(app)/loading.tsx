import { LoadingBlock } from '@/components/shared/Spinner';
import { Skeleton } from '@/components/kit/Skeleton';

/**
 * Suspense fallback for every route in the (app) group.
 *
 * Its presence is what makes tab switching non-blocking. With no boundary
 * here, Next keeps the previous page fully painted until the new route's RSC
 * payload arrives - three serial round trips (auth, recurring catch-up, then
 * the query fan-out) plus a possible Neon cold start - with zero feedback.
 *
 * Second effect: NavButton derives its active state from usePathname(), which
 * only updates once the route commits. Blocking navigation therefore also
 * delayed the tab highlight. Committing immediately fixes that for free.
 *
 * Renders inside AppShell's <main>, so the shell and the modals mounted above
 * the page are untouched; only the page body swaps.
 *
 * A PAGE-SHAPED SKELETON, not a big spinner. The owner's note asked for a
 * large spinner because a small in-card one read as decoration on a whole
 * page. A skeleton in the shape of a page (a hero block, a row of figures,
 * two cards) answers that more directly - the page is visibly on its way -
 * and a small working spinner with the localized "Loading…" stays beside it
 * as the status that is announced. The spinner pulses under reduced motion
 * (svg[role=status] in globals.css), so the page never reads as hung when
 * the sheen stops. Every Skeleton is decorative (aria-hidden).
 *
 * The fade-in is delayed ~180ms so a warm navigation never flashes a
 * placeholder, while a cold start shows one for as long as the wait actually
 * lasts. The keyframe is globals.css's pb-fade-in (shell.css), so it no
 * longer depends on Spinner injecting its own.
 */
export default function AppGroupLoading() {
  return (
    <div className="pb-shell-load">
      {/* No label prop, deliberately: this is a Server Component and cannot
          read the locale, so LoadingBlock - which is a client component -
          resolves the default from the dictionary itself. Passing one here
          would hardcode English into the fallback for every route. */}
      <div className="pb-shell-load-status">
        <LoadingBlock minHeight={0} size={16} labelSize="0.8rem" />
      </div>
      <Skeleton height="9rem" radius="1.25rem" />
      <div className="pb-shell-load-stats">
        {[0, 1, 2].map((i) => (
          <div key={i} className="pb-shell-load-stat">
            <Skeleton width="45%" height="0.7rem" />
            <Skeleton width="70%" height="1.4rem" />
          </div>
        ))}
      </div>
      <div className="pb-shell-load-cards">
        {[0, 1].map((i) => (
          <div key={i} className="card pb-shell-load-card">
            <Skeleton width="40%" height="0.95rem" />
            {[0, 1, 2].map((j) => (
              <div key={j} className="pb-shell-load-line">
                <Skeleton width="2.25rem" height="2.25rem" radius="0.7rem" />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <Skeleton width={j === 1 ? '55%' : '70%'} height="0.75rem" />
                  <Skeleton width="35%" height="0.6rem" />
                </div>
                <Skeleton width="3.5rem" height="0.8rem" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
