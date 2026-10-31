import { clearLayoutCache } from '@/components/loading/layoutCache';
import { authClient } from './client';
import { clearAllSnapshots } from '@/lib/offline/queueStore';
import { clearAllQuickPicks } from '@/lib/quickPicks';
import { clearOfflineCaches } from '@/lib/offline/serviceWorker';

/**
 * The one sign-out path. Every sign-out button calls this.
 *
 * Returns false when sign-out failed. The session may then still be valid,
 * so NOTHING is reset and the caller must not navigate: sending a still
 * signed-in user to the sign-in page just bounces them back into the app.
 *
 * On success it does a FULL page load rather than a router push (preferences
 * are stored per user - see switchPebbleUser - so nothing needs clearing). That
 * drops every piece of in-memory state from the signed-out session, the app
 * never re-renders with no user ("Good morning, Unknown user"), and replace()
 * keeps Back from returning to it.
 *
 * OFFLINE DATA. Once the session is really gone, everything the service worker
 * saved (pages hold the person's financial data) and the reference-data
 * snapshot are deleted, so a signed-out device keeps none of it. The queue of
 * transactions waiting to upload is NOT touched here: it is keyed by user id
 * and stays for that account's next sign-in, unless the caller passes
 * `beforeLeaving` to discard it (the sign-out dialog's explicit choice).
 */
export async function signOutCompletely(beforeLeaving?: () => Promise<void>): Promise<boolean> {
  try {
    // The client reports HTTP failures as { error } rather than throwing, so
    // both shapes count as failure.
    const result: unknown = await authClient.signOut();
    if (result && typeof result === 'object' && (result as { error?: unknown }).error) return false;
  } catch {
    return false;
  }
  // Failures here must never block leaving: the session is already gone.
  try { await clearOfflineCaches(); } catch { /* best effort */ }
  try { await clearAllSnapshots(); } catch { /* best effort */ }
  clearLayoutCache();
  // Quick-pick habits are per user and live in localStorage.
  clearAllQuickPicks();
  try { await beforeLeaving?.(); } catch { /* best effort */ }
  window.location.replace('/auth/sign-in');
  return true;
}
