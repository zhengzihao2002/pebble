import { AppShell } from '@/components/layout/AppShell';
import { LocaleProvider } from '@/lib/i18n/LocaleProvider';
import { resolveUserLocale } from '@/lib/i18n/serverLocale';
import { getSessionUserOrRedirect } from '@/lib/auth/getSessionUser';
import { CurrentUserProvider } from '@/lib/auth/useCurrentUser';
import { getUserTimeZoneOverride } from '@/lib/data/queries';
import { TimeZoneOverrideProvider } from '@/lib/time/TimeZoneOverrideContext';
import { OfflineProvider } from '@/components/offline/OfflineProvider';
import { QuietSyncProvider } from '@/components/offline/QuietSyncProvider';
import { BudgetPlanNavigationProvider } from '@/components/budgets/BudgetPlanNavigation';
import { loadPartnerWorkspaceAccess } from '@/lib/partnerSnapshot.server';
import { partnerViewPair } from '@/lib/partnerView.server';
import { BUILD_ID } from '@/lib/offline/buildId';
import { QUIET_SYNC_HEADER_PREINIT } from '@/lib/offline/quietSync';

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
 *
 * A saved page carries its owner's display profile and queue identity.
 * The shell can render both without making a separate session request.
 */
export default async function AppGroupLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUserOrRedirect();
  const userId = user.id;
  const [locale, timeZoneOverride, partnerPair] = await Promise.all([
    resolveUserLocale(),
    getUserTimeZoneOverride(userId),
    partnerViewPair(userId),
  ]);

  const access = partnerPair ? await loadPartnerWorkspaceAccess() : null;

  return (
    <CurrentUserProvider profile={{
      id: userId, name: user.name, email: user.email, image: user.image ?? null,
      createdAt: user.createdAt ? new Date(user.createdAt).toISOString() : null,
    }}>
      <LocaleProvider locale={locale}>
        <TimeZoneOverrideProvider timeZoneOverride={timeZoneOverride}>
          {/* Only the owner workspace carries the user and build marker
              that allows the service worker to save this document. */}
          {partnerPair
            ? <BudgetPlanNavigationProvider>
                <AppShell key={partnerPair}
                  partnerAccess={access?.ok ? access.data : undefined} viewerId={userId}>{children}</AppShell>
              </BudgetPlanNavigationProvider>
            : <>
              <meta name="pebble-session" content={`${userId}|${BUILD_ID}`} />
              <script data-pb-quiet-owner={userId} dangerouslySetInnerHTML={{ __html: QUIET_SYNC_HEADER_PREINIT }} />
              <QuietSyncProvider userId={userId}>
                <OfflineProvider userId={userId}>
                  <BudgetPlanNavigationProvider><AppShell>{children}</AppShell></BudgetPlanNavigationProvider>
                </OfflineProvider>
              </QuietSyncProvider>
            </>}
        </TimeZoneOverrideProvider>
      </LocaleProvider>
    </CurrentUserProvider>
  );
}
