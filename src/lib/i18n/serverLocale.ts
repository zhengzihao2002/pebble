import 'server-only';

import { cache } from 'react';
import { cookies } from 'next/headers';
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from './locale';

/**
 * The user's display language, for Server Components.
 *
 * WHY A COOKIE. The language lives in the zustand store, which is
 * localStorage, which the server cannot read. AppShell mirrors it into a
 * cookie on mount and this reads it back - the identical arrangement
 * resolveUserTimeZone() uses, for the identical reason.
 *
 * SCOPE. Almost every page in Pebble is a thin server shell that queries and
 * hands props to a *Client.tsx, so essentially all user-visible text is
 * client-rendered and uses useTranslation() instead. At the time of writing
 * the only caller is goals/page.tsx, the one page with no client shell. If a
 * second caller ever appears, that is the signal to check whether that page
 * should have had a client shell all along.
 *
 * DIFFERS FROM resolveUserTimeZone() IN ONE WAY, deliberately: that returns
 * null when unknown, because guessing a timezone can cause a WRONG ROW to be
 * WRITTEN by recurring catch-up. Language is display-only and can never reach
 * the database, so returning English is safe and spares every caller a
 * fallback branch.
 *
 * The value is user-editable, so it is validated. Forging it only changes
 * what the forger reads.
 *
 * cache() dedupes across a single render pass.
 */
export const resolveUserLocale = cache(async (): Promise<Locale> => {
  try {
    const store = await cookies();
    const raw = store.get(LOCALE_COOKIE)?.value;
    if (!raw) return DEFAULT_LOCALE;
    const value = decodeURIComponent(raw);
    return isLocale(value) ? value : DEFAULT_LOCALE;
  } catch {
    // cookies() throws outside a request scope. Never fatal here.
    return DEFAULT_LOCALE;
  }
});
