import { auth } from '@/lib/auth/server';
import { NextRequest } from 'next/server';

const authMiddleware = auth.middleware({
  loginUrl: '/auth/sign-in',
});

/**
 * ============================================================================
 * READ THIS BEFORE CHANGING THE Next-Action BYPASS BELOW
 * ============================================================================
 *
 * WHAT IT DOES
 * Any request carrying the `Next-Action` header - that is, EVERY Server Action
 * POST - returns early and never reaches the auth middleware. Page routes in
 * the matcher are protected; Server Actions are NOT protected here.
 *
 * WHY IT IS HERE (inferred, not documented at the time)
 * The middleware answers an unauthenticated request with a redirect to the
 * sign-in page. A Server Action POST expects a Server Action response, not an
 * HTML redirect, so a session that expires mid-visit would surface in the
 * client as an opaque parse failure instead of a clean, handled error.
 * Bypassing lets the action itself resolve the session and return a proper
 * result object the UI can render.
 *
 * WHAT DEPENDS ON IT
 * src/lib/actions/withSessionUser.ts is the ONLY guard on every write path in
 * this application. Each action in src/lib/actions/pebble.ts is exported
 * wrapped in withSessionUser(), which resolves the session server-side and
 * passes the user id to the handler. No action accepts a userId from the
 * client, and no handler can run without a resolved session.
 *
 * IF YOU REMOVE THIS BYPASS
 * Server Actions gain middleware auth as a second layer - good - but verify
 * that an expired session during a mutation still produces a usable error in
 * the UI rather than a redirect the client cannot interpret. Do not remove
 * withSessionUser() either way: middleware and the wrapper are meant to be
 * two layers, not alternatives.
 *
 * IF YOU ADD A NEW SERVER ACTION
 * Export it wrapped in withSessionUser(). An unwrapped export in that file is
 * an unauthenticated write endpoint reachable by anyone on the internet.
 * ============================================================================
 */
export default function proxy(request: NextRequest) {
  if (request.headers.has('Next-Action')) {
    return;
  }
  return authMiddleware(request);
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/transactions/:path*',
    '/reports/:path*',
    '/budgets/:path*',
    '/goals/:path*',
    '/settings/:path*',
    '/account/:path*',
  ],
};
