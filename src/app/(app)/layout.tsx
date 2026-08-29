import { AppShell } from '@/components/layout/AppShell';
import { LocaleProvider } from '@/lib/i18n/LocaleProvider';
import { resolveUserLocale } from '@/lib/i18n/serverLocale';
import { getSessionUserIdOrRedirect } from '@/lib/auth/getSessionUser';
import { getUserTimeZoneOverride } from '@/lib/data/queries';
import { TimeZoneOverrideProvider } from '@/lib/time/TimeZoneOverrideContext';

/**
 * Reads the pebble-lang cookie so the SERVER renders the whole app in the
 * user's language, rather than sending English and letting hydration correct
 * it a few hundred milliseconds later. See LocaleProvider for why that
 * correction was always too late to be invisible.
 *
 * Also resolves the user's STORED timezone override here - not the browser's
 * live zone, which is a client-only concept - so every client component
 * below AppShell, including the modals it mounts, sees the same value
 * without each one re-fetching it. See TimeZoneOverrideContext for why this
 * holds only the raw override rather than a fully-resolved zone.
 *
 * Reading cookies makes this layout dynamic. Every (app) page is already
 * force-dynamic, so nothing is lost. The session check here duplicates each
 * page's own getSessionUserIdOrRedirect() call - Next renders layout and
 * page in parallel, so this runs concurrently rather than blocking the page,
 * and redirecting an unauthenticated user one layer higher is strictly
 * earlier, never later, than the existing per-page check.
 */
export default async function AppGroupLayout({ children }: { children: React.ReactNode }) {
  const userId = await getSessionUserIdOrRedirect();
  const [locale, timeZoneOverride] = await Promise.all([
    resolveUserLocale(),
    getUserTimeZoneOverride(userId),
  ]);

  return (
    <LocaleProvider locale={locale}>
      <TimeZoneOverrideProvider timeZoneOverride={timeZoneOverride}>
        <AppShell>{children}</AppShell>
      </TimeZoneOverrideProvider>
    </LocaleProvider>
  );
}
