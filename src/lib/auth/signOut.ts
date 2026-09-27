import { authClient } from './client';
import { usePebbleStore } from '@/store/usePebbleStore';

/**
 * The one sign-out path. Every sign-out button calls this.
 *
 * Returns false when sign-out failed. The session may then still be valid,
 * so NOTHING is reset and the caller must not navigate: sending a still
 * signed-in user to the sign-in page just bounces them back into the app.
 *
 * On success it clears the per-person filter preferences (the next person on
 * this browser should not inherit them - device preferences like theme and
 * text size stay), then does a FULL page load rather than a router push. That
 * drops every piece of in-memory state from the signed-out session, the app
 * never re-renders with no user ("Good morning, Unknown user"), and replace()
 * keeps Back from returning to it.
 */
export async function signOutCompletely(): Promise<boolean> {
  try {
    // The client reports HTTP failures as { error } rather than throwing, so
    // both shapes count as failure.
    const result: unknown = await authClient.signOut();
    if (result && typeof result === 'object' && (result as { error?: unknown }).error) return false;
  } catch {
    return false;
  }
  usePebbleStore.getState().resetFilterPrefs();
  window.location.replace('/auth/sign-in');
  return true;
}
