'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, DatabaseZap } from 'lucide-react';

/**
 * Error boundary for every route in the (app) group.
 *
 * Renders in place of the page, inside AppShell - so the sidebar, header and
 * bottom nav survive and the user can navigate away instead of being stranded.
 *
 * WHAT THIS CANNOT KNOW: in production Next redacts server error messages and
 * passes only a digest. The FailureKind classification from the action layer
 * does not reach here - that rides on action RETURN values, and this is a
 * thrown error. So this deliberately does not guess at a cause; it states the
 * one thing that is true either way, which is that the page could not load
 * its data. Since every (app) page's first act is to query the database, that
 * is also the overwhelmingly likely cause.
 *
 * NOT a session problem: getSessionUserIdOrRedirect() calls redirect(), which
 * signals by throwing. Next filters those digests out before an error boundary
 * runs, but the re-throw below costs three lines and the failure mode if that
 * assumption is ever wrong is telling a signed-out user their database is
 * down.
 */
export default function AppGroupError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error('[pebble] page render failed', error);
  }, [error]);

  // Control-flow signals, not failures. Re-thrown so Next handles them.
  if (error.digest === 'NEXT_REDIRECT' || error.digest === 'NEXT_NOT_FOUND') {
    throw error;
  }

  // reset() re-renders the segment, but a Server Component page needs its RSC
  // payload refetched to actually re-run its queries. router.refresh() does
  // that; reset() alone can re-render the same failed payload.
  const retry = () => {
    router.refresh();
    reset();
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 420, padding: '2rem 1rem' }}>
      <div className="card" style={{ padding: '2rem', maxWidth: 460, width: '100%', textAlign: 'center' }}>
        <div
          style={{
            width: 56, height: 56, borderRadius: '1rem', backgroundColor: 'var(--wine-soft, rgba(150,60,70,0.12))',
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.1rem',
          }}
        >
          <DatabaseZap size={26} style={{ color: 'var(--wine)' }} />
        </div>

        <h2 className="font-display" style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '0.5rem' }}>
          Couldn&apos;t load your data
        </h2>
        <p style={{ fontSize: '0.87rem', color: 'var(--ink-soft)', lineHeight: 1.55, marginBottom: '1.4rem' }}>
          Pebble reached this page but could not read from the database. Nothing has been changed or
          lost — this is a problem getting your data, not with your data.
        </p>

        <button
          type="button" onClick={retry} className="btn-primary"
          style={{ padding: '0.7rem 1.3rem', display: 'inline-flex', alignItems: 'center', gap: 7 }}
        >
          <RefreshCw size={15} />Try again
        </button>

        {error.digest && (
          <p style={{ fontSize: '0.72rem', color: 'var(--ink-soft)', marginTop: '1.2rem', opacity: 0.75 }}>
            Reference: <span className="font-mono-tab">{error.digest}</span>
          </p>
        )}
      </div>
    </div>
  );
}
