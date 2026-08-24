import 'server-only';

import {
  AuthRequiredError,
  AuthUnavailableError,
  getSessionUserId,
} from '@/lib/auth/getSessionUser';
import type { FailureKind } from '@/lib/actions/failureKind';

/**
 * Shared failure shape. Every action result type in pebble.ts already
 * includes exactly this member, so the wrapper's return union collapses
 * cleanly at call sites and `if (!result.ok)` keeps narrowing correctly.
 */
type AuthFailure = { ok: false; error: string; kind?: FailureKind };

/**
 * Makes session resolution structural instead of remembered.
 *
 * src/proxy.ts deliberately skips auth middleware for requests carrying the
 * Next-Action header, so the session check inside an action is the ONLY guard
 * on a write path. Relying on every future action to remember to call
 * getSessionUserId() is a footgun; this wrapper removes the option.
 *
 * A wrapped handler receives `userId` as its first argument. It cannot run
 * without a resolved session, and there is no session call for it to forget.
 *
 * The client NEVER supplies a user id. It is resolved here, from the session,
 * and passed inward. Do not add a userId parameter to any action.
 *
 * Auth failures are caught here and returned, never thrown: an uncaught throw
 * from a Server Action surfaces in production as an opaque error digest.
 * AuthRequiredError (no session) and AuthUnavailableError (auth service down)
 * are reported differently so an outage is never presented as "signed out".
 */
export function withSessionUser<TArgs extends unknown[], TResult>(
  handler: (userId: string, ...args: TArgs) => Promise<TResult>,
): (...args: TArgs) => Promise<TResult | AuthFailure> {
  return async (...args: TArgs): Promise<TResult | AuthFailure> => {
    let userId: string;

    try {
      userId = await getSessionUserId();
    } catch (error) {
      if (error instanceof AuthRequiredError) {
        return { ok: false, error: 'Your session has expired. Please sign in again.', kind: 'session' };
      }
      if (error instanceof AuthUnavailableError) {
        console.error('[pebble auth] auth service unavailable', error);
        return {
          ok: false,
          error: "We couldn't verify your session right now. Please try again in a moment.",
          kind: 'auth',
        };
      }
      console.error('[pebble auth] unexpected session resolution failure', error);
      return { ok: false, error: 'Something went wrong. Please try again.', kind: 'unknown' };
    }

    // Deliberately outside the try above: a failure inside the handler is the
    // handler's own concern and must not be reported as an auth failure.
    return handler(userId, ...args);
  };
}
