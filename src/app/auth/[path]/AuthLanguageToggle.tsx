'use client';

import { useRouter } from 'next/navigation';
import { usePebbleStore } from '@/store/usePebbleStore';
import { LOCALE_COOKIE } from '@/lib/i18n';

/**
 * EN / 中文 on the auth pages, for someone who has never signed in and so has
 * never reached Settings. Same effect as the Settings language control: the
 * saved device preference, the cookie the server reads for the brand panel,
 * then one refresh to re-render that panel in the new language.
 */
export function AuthLanguageToggle() {
  const router = useRouter();
  const locale = usePebbleStore((s) => s.locale);
  const setLocale = usePebbleStore((s) => s.setLocale);

  const choose = (next: 'en' | 'zh') => {
    if (next === locale) return;
    setLocale(next);
    document.cookie = `${LOCALE_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
    router.refresh();
  };

  return (
    <div className="pebble-auth-lang" role="group" aria-label="Language / 语言">
      {(['en', 'zh'] as const).map((l) => (
        <button key={l} type="button" onClick={() => choose(l)} aria-pressed={locale === l} className={locale === l ? 'active' : ''}>
          {l === 'en' ? 'EN' : '中文'}
        </button>
      ))}
    </div>
  );
}
