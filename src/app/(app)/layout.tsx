import { AppShell } from '@/components/layout/AppShell';
import { LocaleProvider } from '@/lib/i18n/LocaleProvider';
import { resolveUserLocale } from '@/lib/i18n/serverLocale';

/**
 * Reads the pebble-lang cookie so the SERVER renders the whole app in the
 * user's language, rather than sending English and letting hydration correct
 * it a few hundred milliseconds later. See LocaleProvider for why that
 * correction was always too late to be invisible.
 *
 * Reading cookies makes this layout dynamic. Every (app) page is already
 * force-dynamic, so nothing is lost.
 */
export default async function AppGroupLayout({ children }: { children: React.ReactNode }) {
  const locale = await resolveUserLocale();

  return (
    <LocaleProvider locale={locale}>
      <AppShell>{children}</AppShell>
    </LocaleProvider>
  );
}
