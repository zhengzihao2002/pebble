import Link from '@/components/loading/PendingLink';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { resolveUserLocale } from '@/lib/i18n/serverLocale';
import { TERMS_OF_USE } from '@/lib/legal/termsOfUse';
import { AuthLanguageToggle } from '../[path]/AuthLanguageToggle';
import { PebbleMark } from '@/components/brand/PebbleMark';
import { cookies } from 'next/headers';
import { NEON_AUTH_SESSION_COOKIE_NAME } from '@neondatabase/auth/server';

export const metadata: Metadata = { title: 'Terms of Use · Pebble' };

/**
 * The Terms of Use. Under /auth/ on purpose: the sign-in guard (proxy.ts)
 * does not cover it, so it reads while signed out, and it wears the same
 * default look as the sign-in pages. Linked from the sign-up checkbox,
 * from Settings, and from the Privacy Notice.
 */
export default async function TermsPage() {
  // Locale and the back link depend on request cookies. Stop the build's
  // static probe before cookie/session helpers can catch its dynamic signal.
  await connection();
  const locale = await resolveUserLocale();
  // This only picks a back link. The protected app verifies the session when opened.
  const signedIn = (await cookies()).has(NEON_AUTH_SESSION_COOKIE_NAME);
  const notice = TERMS_OF_USE[locale === 'zh' ? 'zh' : 'en'];

  return (
    <main className="pebble-root privacy-page">
      <article className="privacy-article">
        <header className="privacy-head">
          <span className="privacy-brand">
            <PebbleMark size={36} tone="brand" />
            <span className="font-display">Pebble</span>
          </span>
          <AuthLanguageToggle />
        </header>
        <h1 className="font-display">{notice.title}</h1>
        <p className="privacy-updated">{notice.updated}</p>
        <p>{notice.intro}</p>
        {notice.sections.map((section, i) => (
          <section key={i}>
            <h2 className="font-display">{i + 1}. {section.heading}</h2>
            {section.bullets && (
              <ul>{section.bullets.map((b, j) => <li key={j}>{b}</li>)}</ul>
            )}
            {section.paragraphs?.map((p, j) => <p key={j}>{p}</p>)}
          </section>
        ))}
        {/* Signed in (the Settings link): back to the app, not the sign-in page. */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0 1.5rem' }}>
          {signedIn
            ? <Link href="/settings" className="privacy-back">{notice.backSignedIn}</Link>
            : <Link href="/auth/sign-in" className="privacy-back">{notice.back}</Link>}
          <Link href="/auth/privacy" className="privacy-back">{notice.privacyLink}</Link>
        </div>
      </article>
    </main>
  );
}
