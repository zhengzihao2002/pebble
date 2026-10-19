'use client';

import { useEffect, useState } from 'react';
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
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => {
    setToday(todayInZone(timeZoneOverride ?? resolveBrowserTimeZone()));
  }, [timeZoneOverride]);
  return today;
}
