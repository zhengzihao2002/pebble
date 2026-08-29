'use client';

import { createContext, useContext } from 'react';

/**
 * The user's STORED timezone override (user_account.time_zone), resolved
 * server-side once in (app)/layout.tsx and threaded to every client
 * component that computes "today" - mirroring LocaleContext/LocaleProvider's
 * role for locale.
 *
 * null means "no override" - callers fall through to their own live browser
 * detection, matching resolveUserTimeZone()'s order: stored override, then
 * browser/cookie detection, then skip.
 */
export const TimeZoneOverrideContext = createContext<string | null>(null);

/**
 * Thin Client Component wrapper - REQUIRED. A Server Component cannot render
 * `<SomeContext.Provider>` directly when the context was created in a
 * 'use client' module; only actual Component exports cross that boundary as
 * renderable JSX, not a plain object like a Context instance. (app)/layout.tsx
 * renders THIS, never the raw context - exactly mirroring LocaleProvider.
 */
export function TimeZoneOverrideProvider({
  timeZoneOverride, children,
}: { timeZoneOverride: string | null; children: React.ReactNode }) {
  return (
    <TimeZoneOverrideContext.Provider value={timeZoneOverride}>
      {children}
    </TimeZoneOverrideContext.Provider>
  );
}

export function useTimeZoneOverride(): string | null {
  return useContext(TimeZoneOverrideContext);
}
