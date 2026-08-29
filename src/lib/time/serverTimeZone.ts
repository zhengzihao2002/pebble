import 'server-only';

import { cache } from 'react';
import { cookies } from 'next/headers';
import { TIME_ZONE_COOKIE, isValidTimeZone } from './timeZone';
import { getUserTimeZoneOverride } from '@/lib/data/queries';

/**
 * The user's timezone, as reported by their own browser.
 *
 * WHY A COOKIE. The server cannot know the user's zone: new Date() gives the
 * container's zone, which is UTC on Vercel, and IP geolocation is wrong for
 * anyone travelling or on a VPN. Only the browser knows, so the browser tells
 * us - AppShell writes the cookie on mount.
 *
 * This works because nothing in Pebble runs without a browser present. There
 * is no cron and no background job; recurring catch-up executes only during a
 * page render, which by definition means a browser just made a request.
 *
 * Returns null rather than guessing when the cookie is missing or invalid.
 * Callers decide: catch-up skips entirely (the client then sets the cookie and
 * refreshes), while display-only paths fall back. Silently defaulting to UTC
 * here would reintroduce the bug on precisely the first load of a new session.
 *
 * The value is user-editable, so it is validated before use. Forging it only
 * changes the forger's own dates.
 *
 * cache() dedupes across a single render pass.
 */
export const resolveUserTimeZone = cache(async (userId: string): Promise<string | null> => {
  // Stored override takes precedence - an explicit choice beats a guess from
  // whatever device happened to make this request.
  const override = await getUserTimeZoneOverride(userId);
  if (override && isValidTimeZone(override)) return override;

  try {
    const store = await cookies();
    const raw = store.get(TIME_ZONE_COOKIE)?.value;
    if (!raw) return null;

    const value = decodeURIComponent(raw);
    return isValidTimeZone(value) ? value : null;
  } catch {
    // cookies() throws outside a request scope. Never fatal here.
    return null;
  }
});
