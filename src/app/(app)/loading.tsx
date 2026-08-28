import { LoadingBlock } from '@/components/shared/Spinner';

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
 * Sized deliberately large: this fills a whole page area, and at the in-card
 * default size it reads as decoration rather than as "the app is working".
 *
 * The fade-in is delayed ~180ms so a warm navigation never flashes a spinner,
 * while a cold start shows one for as long as the wait actually lasts. The
 * keyframe is the one Spinner.tsx already injects - globals.css untouched.
 */
export default function AppGroupLoading() {
  return (
    <div style={{ animation: 'pebble-fade-in 0.2s ease 0.18s both' }}>
      {/* No label prop, deliberately: this is a Server Component and cannot
          read the locale, so LoadingBlock - which is a client component -
          resolves the default from the dictionary itself. Passing one here
          would hardcode English into the fallback for every route. */}
      <LoadingBlock minHeight={440} size={56} labelSize="0.95rem" />
    </div>
  );
}
