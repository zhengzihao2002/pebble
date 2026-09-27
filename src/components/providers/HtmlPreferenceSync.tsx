'use client';

import { useEffect } from 'react';
import { usePebbleStore } from '@/store/usePebbleStore';
import { HTML_LANG } from '@/lib/i18n';

/**
 * Keeps <html> in step with the saved dark-mode and language preferences.
 *
 * WHY: the pre-paint script in layout.tsx adds pebble-dark (and sets lang)
 * before first paint, but <html className> belongs to React. Whenever the
 * root layout re-renders on the client - router.refresh(), which the auth
 * library does after sign-up, and AppShell after a timezone or language
 * cookie change - React rewrites className from the server's version, which
 * never contains pebble-dark. Auth pages then turned light, and in the app
 * every html.pebble-dark rule (page background, health bar colours) lost its
 * dark values.
 *
 * A MutationObserver puts the class back whenever something strips it, as a
 * microtask - before the next paint, so nothing flashes. It only ever ADDS a
 * missing class or sets lang when it differs, so it cannot loop. Mounted once
 * in the root layout, covering auth pages and the app alike. data-pebble-*
 * attributes need no help: React never wrote them, so it never removes them.
 */
export function HtmlPreferenceSync() {
  const darkMode = usePebbleStore((s) => s.darkMode) === true;
  const locale = usePebbleStore((s) => s.locale);

  useEffect(() => {
    const root = document.documentElement;
    const lang = HTML_LANG[locale] ?? HTML_LANG.en;
    const apply = () => {
      if (root.classList.contains('pebble-dark') !== darkMode) root.classList.toggle('pebble-dark', darkMode);
      if (root.lang !== lang) root.lang = lang;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(root, { attributes: true, attributeFilter: ['class', 'lang'] });
    return () => observer.disconnect();
  }, [darkMode, locale]);

  return null;
}
