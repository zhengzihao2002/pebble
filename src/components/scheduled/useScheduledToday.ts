'use client';

import { useSyncExternalStore } from 'react';
import { todayInZone } from '@/lib/recurring/occurrences';
import { resolveBrowserTimeZone } from '@/lib/time/timeZone';
import { useTimeZoneOverride } from '@/lib/time/TimeZoneOverrideContext';

/**
 * Today as 'YYYY-MM-DD' in the stored zone override, else the browser's zone
 * (the same rule RecurringRuleModal and the Dashboard use). Null on the
 * server and for hydration - the server runs on UTC - then the client value,
 * through useSyncExternalStore as Goals does (no setState in an effect).
 */
export function useScheduledToday(): string | null {
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
