import 'server-only';

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth/server';

/**
 * Thrown when a caller requires an authenticated user and there is none.
 * Distinct from AuthUnavailableError so a genuine outage is never
 * mistaken for a signed-out user.
 */
export class AuthRequiredError extends Error {
  constructor(message = 'Authentication required.') {
    super(message);
    this.name = 'AuthRequiredError';
  }
}

/**
 * Thrown when the Neon Auth service could not be reached or returned an error.
 * This is an infrastructure failure, NOT "no session". Treating it as
 * "no session" would silently redirect users to sign-in during an outage.
 */
export class AuthUnavailableError extends Error {
  constructor(message = 'Authentication service unavailable.') {
    super(message);
    this.name = 'AuthUnavailableError';
  }
}

function extractErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return 'Unknown authentication error.';
}

/**
 * Resolves the current session's user id, or null if there is no session.
 * Not exported: callers must use one of the strict wrappers below so that
 * a missing user id can never be coalesced into a fallback value.
 */
async function resolveSessionUserId(): Promise<string | null> {
  const result = await auth.getSession();

  if (result.error) {
    throw new AuthUnavailableError(extractErrorMessage(result.error));
  }

  const userId = result.data?.user?.id;

  if (typeof userId !== 'string' || userId.length === 0) {
    return null;
  }

  return userId;
}

/**
 * Returns the authenticated user's id, or throws.
 *
 * Use in Server Actions. src/proxy.ts deliberately bypasses auth middleware
 * for requests carrying the Next-Action header, so this check is the ONLY
 * thing protecting a mutation from an unauthenticated caller.
 *
 * Never accepts a user id from the client. Never returns a fallback.
 */
export async function getSessionUserId(): Promise<string> {
  const userId = await resolveSessionUserId();

  if (userId === null) {
    throw new AuthRequiredError();
  }

  return userId;
}

/**
 * Returns the authenticated user's id, or redirects to sign-in.
 *
 * Use in Server Components under (app)/*. Middleware should already have
 * redirected, so reaching the redirect here means an invariant was missed,
 * but redirecting is a friendlier failure than an error boundary.
 *
 * Any component calling this must set `export const dynamic = 'force-dynamic'`.
 */
export async function getSessionUserIdOrRedirect(): Promise<string> {
  const userId = await resolveSessionUserId();

  if (userId === null) {
    redirect('/auth/sign-in');
  }

  return userId;
}
