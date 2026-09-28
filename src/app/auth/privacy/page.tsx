import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import { resolveUserLocale } from '@/lib/i18n/serverLocale';
import { PRIVACY_NOTICE } from '@/lib/legal/privacyNotice';
import { AuthLanguageToggle } from '../[path]/AuthLanguageToggle';

export const metadata: Metadata = { title: 'Privacy Notice · Pebble' };

/**
 * The Privacy Notice. Under /auth/ on purpose: the sign-in guard (proxy.ts)
 * does not cover it, so it reads while signed out, and it wears the same
 * default look as the sign-in pages. Linked from the sign-up checkbox and
 * from Settings.
 */
export default async function PrivacyPage() {
  const locale = await resolveUserLocale();
  const notice = PRIVACY_NOTICE[locale === 'zh' ? 'zh' : 'en'];

  return (
    <main className="pebble-root privacy-page">
      <article className="privacy-article">
        <header className="privacy-head">
          <span className="privacy-brand">
            <Image src="/icons/icon-192.png" alt="" width={36} height={36} priority style={{ borderRadius: 9 }} />
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
        <Link href="/auth/sign-in" className="privacy-back">{notice.back}</Link>
      </article>
    </main>
  );
}
