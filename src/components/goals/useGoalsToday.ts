'use client';

import { useSyncExternalStore } from 'react';
import { useTimeZoneOverride } from '@/lib/time/TimeZoneOverrideContext';
import { resolveBrowserTimeZone } from '@/lib/time/timeZone';
import { todayInZone } from '@/lib/recurring/occurrences';

/**
 * Zone-aware 'YYYY-MM-DD', resolved in the browser as on the Dashboard and
 * Budgets, so a Settings > Time Zone override is honoured. Null for the first
 * frame keeps the server render and the first client render equal; the
 * countdowns and monthly paces appear once it resolves.
 */
export function useGoalsToday(): string | null {
  const timeZoneOverride = useTimeZoneOverride();
  // useSyncExternalStore rather than a mount effect: the server snapshot
  // (null) is what hydration renders, the client snapshot follows right after,
  // with no setState inside an effect. A string snapshot compares by value,
  // so it is stable between renders.
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
