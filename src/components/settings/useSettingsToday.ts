'use client';

import { useSyncExternalStore } from 'react';
import { todayInZone } from '@/lib/recurring/occurrences';
import { resolveBrowserTimeZone } from '@/lib/time/timeZone';
import { useTimeZoneOverride } from '@/lib/time/TimeZoneOverrideContext';

/**
 * Today as 'YYYY-MM-DD' in the stored zone override, else the browser's zone
 * (the rule every other page uses). Null on the server and during hydration -
 * the server runs in another zone - then the client value, read through
 * useSyncExternalStore (as Goals and Scheduled do) rather than set in an
 * effect.
 */
export function useSettingsToday(): string | null {
  const timeZoneOverride = useTimeZoneOverride();
  return useSyncExternalStore(
    noSubscribe,
    () => todayInZone(timeZoneOverride ?? resolveBrowserTimeZone()),
    () => null,
  );
}

// The day is read on each render; nothing to subscribe to.
function noSubscribe(): () => void {
  return () => {};
}
