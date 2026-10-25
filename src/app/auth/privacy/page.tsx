import Link from 'next/link';
import type { Metadata } from 'next';
import { resolveUserLocale } from '@/lib/i18n/serverLocale';
import { PRIVACY_NOTICE } from '@/lib/legal/privacyNotice';
import { AuthLanguageToggle } from '../[path]/AuthLanguageToggle';
import { PebbleMark } from '@/components/brand/PebbleMark';
import { auth } from '@/lib/auth/server';

export const metadata: Metadata = { title: 'Privacy Notice · Pebble' };

/**
 * Whether someone is signed in, for the back link only. Never throws: any
 * failure reads as signed out, which just shows the sign-in link.
 */
async function isSignedIn(): Promise<boolean> {
  try {
    const result = await auth.getSession();
    return !result.error && typeof result.data?.user?.id === 'string' && result.data.user.id.length > 0;
  } catch {
    return false;
  }
}

/**
 * The Privacy Notice. Under /auth/ on purpose: the sign-in guard (proxy.ts)
 * does not cover it, so it reads while signed out, and it wears the same
 * default look as the sign-in pages. Linked from the sign-up checkbox and
 * from Settings.
 */
export default async function PrivacyPage() {
  const locale = await resolveUserLocale();
  const signedIn = await isSignedIn();
  const notice = PRIVACY_NOTICE[locale === 'zh' ? 'zh' : 'en'];

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
        {signedIn
          ? <Link href="/settings" className="privacy-back">{notice.backSignedIn}</Link>
          : <Link href="/auth/sign-in" className="privacy-back">{notice.back}</Link>}
      </article>
    </main>
  );
}
