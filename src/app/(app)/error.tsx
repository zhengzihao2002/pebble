'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { RefreshCw, DatabaseZap, LayoutDashboard } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';

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
  const pathname = usePathname();
  // Safe inside an error boundary: getDictionary() falls back to English on
  // any unrecognised value and cannot itself throw, so a bad stored locale
  // can never turn a page failure into a blank screen.
  const { d } = useTranslation();

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

  // The kit EmptyState's shape (icon disc, title, one line, actions) with a
  // wine-tinted disc: this is a failure, not an empty page. A way out sits
  // beside Try again - a plain link, so it works even if this route keeps
  // failing.
  return (
    <div className="pb-shell-error">
      <div className="card pb-shell-error-card">
        <span className="pb-shell-error-icon" aria-hidden="true"><DatabaseZap size={24} /></span>
        <h2 className="font-display pb-shell-error-title">{d.error.title}</h2>
        <p className="pb-shell-error-body">{d.error.body}</p>

        <div className="pb-shell-error-actions">
          <button type="button" onClick={retry} className="btn-primary" style={{ padding: '0.7rem 1.3rem', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <RefreshCw size={15} aria-hidden="true" />{d.error.retry}
          </button>
          {pathname !== '/dashboard' && <Link href="/dashboard" prefetch={false} className="pill" style={{ padding: '0.7rem 1.1rem', display: 'inline-flex', alignItems: 'center', gap: 7, textDecoration: 'none' }}>
            <LayoutDashboard size={15} aria-hidden="true" />{d.ux.shell.goDashboard}
          </Link>}
        </div>

        {error.digest && (
          <p className="pb-shell-error-ref">
            {d.error.reference} <span className="font-code">{error.digest}</span>
          </p>
        )}
      </div>
    </div>
  );
}
