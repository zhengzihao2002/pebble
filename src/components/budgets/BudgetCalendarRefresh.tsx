'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { calendarYear, nextBudgetYearBoundary } from '@/lib/budgets/calendar';

/** Refresh server budgets and remount year-keyed planning UI at each New Year. */
export function BudgetCalendarRefresh({ year, timeZone }: { year: number; timeZone: string }) {
  const router = useRouter();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let lastRequest = 0;
    const check = () => {
      clearTimeout(timer);
      const now = new Date();
      if (calendarYear(now, timeZone) !== year) {
        // Retry after offline/sleep or an interrupted RSC request, without a loop.
        if (navigator.onLine && now.getTime() - lastRequest > 5_000) {
          lastRequest = now.getTime();
          router.refresh();
        }
        timer = setTimeout(check, 15_000);
      } else {
        // Daily cap also handles wall-clock and timezone-rule changes.
        timer = setTimeout(check, Math.max(50, Math.min(86_400_000, nextBudgetYearBoundary(now, timeZone) - now.getTime() + 25)));
      }
    };
    const visible = () => { if (document.visibilityState === 'visible') check(); };
    check();
    window.addEventListener('focus', check);
    window.addEventListener('online', check);
    window.addEventListener('pageshow', check);
    document.addEventListener('visibilitychange', visible);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', check);
      window.removeEventListener('online', check);
      window.removeEventListener('pageshow', check);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [router, year, timeZone]);
  return null;
}
