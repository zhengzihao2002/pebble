/**
 * Wraps a Server Action call so a transport-layer rejection becomes a normal
 * { ok: false } result instead of an unhandled rejection.
 *
 * Why this is needed: every modal was written as
 *   const result = await someAction(); setSaving(false); ...
 * which assumes the promise resolves. Actions do return { ok, error } for
 * errors they handle - but if the request never completes (network down, 502,
 * the DB-outage case this work exists for) the promise REJECTS. setSaving(false)
 * then never runs, and the modal sits under a spinner forever with no error
 * shown. That is the worst possible outcome: a failure that looks like work in
 * progress.
 *
 * On the wording: a rejection does NOT prove the write did not happen. The
 * request may have reached the server and committed before the connection
 * dropped. Claiming "nothing was saved" here would sometimes be a lie, and is
 * exactly the assumption that makes blind retries create duplicate financial
 * transactions. The message stays honest about the uncertainty.
 *
 * Not a 'use server' module - this runs in the browser, around the call.
 */

import type { FailureKind } from '@/lib/actions/failureKind';

type ActionFailure = { ok: false; error: string; kind?: FailureKind };

export const TRANSPORT_ERROR =
  "Couldn't reach the server. Your change may not have been saved — check before trying again.";

export async function callAction<T extends { ok: true } | ActionFailure>(
  run: () => Promise<T>,
  fallbackError: string = TRANSPORT_ERROR,
): Promise<T | ActionFailure> {
  try {
    return await run();
  } catch (err) {
    // Kept for the browser console; the user gets the plain message above.
    console.error('[pebble] server action call failed at the transport layer', err);
    // 'network', deliberately NOT 'database': a server-side database error
    // proves the write did not land, whereas a request that never came back
    // may well have committed first. Different kind, different retry advice.
    return { ok: false, error: fallbackError, kind: 'network' };
  }
}
