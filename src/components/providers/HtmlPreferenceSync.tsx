'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { usePebbleStore } from '@/store/usePebbleStore';
import { HTML_LANG } from '@/lib/i18n';
import { useResolvedDark } from '@/lib/useResolvedDark';
import { CJK_FONT_ATTRIBUTE, FONT_ATTRIBUTE } from '@/lib/fontChoice';
import { THEME_ATTRIBUTE } from '@/lib/themeChoice';

/**
 * Keeps <html> in step with the resolved light/dark mode and the language.
 *
 * WHY: the pre-paint script in layout.tsx adds pebble-dark (and sets lang)
 * before first paint, but <html className> belongs to React. Whenever the
 * root layout re-renders on the client - router.refresh(), which the auth
 * library does after sign-up, and AppShell after a timezone or language
 * cookie change - React rewrites className from the server's version, which
 * never contains pebble-dark.
 *
 * A MutationObserver puts the class back whenever something strips it, as a
 * microtask - before the next paint, so nothing flashes. It only changes a
 * value that differs, so it cannot loop. Mounted once in the root layout.
 *
 * AUTH PAGES (/auth/...) always wear the default look - Original theme,
 * default fonts, the DEVICE's light/dark - matching the pre-paint script.
 */
export function HtmlPreferenceSync() {
  const pathname = usePathname();
  const onAuth = pathname?.startsWith('/auth/') ?? false;
  const dark = useResolvedDark(onAuth);
  const locale = usePebbleStore((s) => s.locale);

  useEffect(() => {
    const root = document.documentElement;
    const lang = HTML_LANG[locale] ?? HTML_LANG.en;
    const apply = () => {
      if (root.classList.contains('pebble-dark') !== dark) root.classList.toggle('pebble-dark', dark);
      if (root.lang !== lang) root.lang = lang;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(root, { attributes: true, attributeFilter: ['class', 'lang'] });
    return () => observer.disconnect();
  }, [dark, locale]);

  // Entering an auth page from inside the app: drop the saved look. AppShell
  // re-applies it on the way back in.
  useEffect(() => {
    if (!onAuth) return;
    const root = document.documentElement;
    root.removeAttribute(THEME_ATTRIBUTE);
    root.removeAttribute(FONT_ATTRIBUTE);
    root.removeAttribute(CJK_FONT_ATTRIBUTE);
  }, [onAuth]);

  return null;
}
