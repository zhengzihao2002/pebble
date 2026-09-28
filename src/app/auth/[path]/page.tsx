import Image from 'next/image';
import { redirect } from 'next/navigation';
import { AuthViewClient } from './AuthViewClient';
import { AuthLanguageToggle } from './AuthLanguageToggle';
import { WelcomeArm } from './WelcomeArm';
import { getDictionary } from '@/lib/i18n';
import { resolveUserLocale } from '@/lib/i18n/serverLocale';

export const dynamicParams = false;

/**
 * Pebble's sign-in, sign-up and password pages.
 *
 * The wrapper wears .pebble-root, so Pebble's palette applies - but always
 * the ORIGINAL theme and default fonts, following the device's light/dark
 * setting (the pre-init script in layout.tsx and HtmlPreferenceSync skip
 * saved looks on /auth/). The saved language still applies. The forms are
 * RECOLOURED, not rebuilt: .pebble-auth in globals.css points their shadcn
 * variables at Pebble's palette. Neon's forms and logic are untouched.
 */
export default async function AuthPage({ params }: { params: Promise<{ path: string }> }) {
  const { path } = await params;
  // Email-code sign-in is off (see src/app/api/auth). The library keeps the
  // view registered because password reset uses email codes.
  if (path === 'email-otp') redirect('/auth/sign-in');

  // Cookie read, not a query - the same source the goals page uses.
  const d = getDictionary(await resolveUserLocale());

  return (
    <main className="pebble-root pebble-auth">
      <div className="pebble-auth-shell">
        <section className="pebble-auth-brand">
          {/* Decoration only; stopped by the global reduced-motion rule. */}
          <span className="pebble-auth-pebble one" aria-hidden="true" />
          <span className="pebble-auth-pebble two" aria-hidden="true" />
          <span className="pebble-auth-pebble three" aria-hidden="true" />
          <div className="pebble-auth-brand-inner">
            <Image src="/icons/icon-192.png" alt="" width={56} height={56} priority className="pebble-auth-logo" />
            <p className="font-display pebble-auth-name">Pebble</p>
            <p className="pebble-auth-tagline">{d.authBrand.tagline}</p>
            <p className="pebble-auth-body">{d.authBrand.body}</p>
            <AuthLanguageToggle />
            <WelcomeArm />
          </div>
        </section>
        <section className="pebble-auth-form">
          <AuthViewClient path={path} />
        </section>
      </div>
    </main>
  );
}
