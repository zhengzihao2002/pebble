'use client';

import { createContext } from 'react';
import { DEFAULT_LOCALE, type Locale } from './locale';

/**
 * The locale the SERVER rendered this page with, read from the pebble-lang
 * cookie in (app)/layout.tsx.
 *
 * ⚠️ WHY THIS EXISTS - it is the whole fix for the flash on reload.
 *
 * Without it, every client component server-rendered in English regardless of
 * the cookie, and only corrected once React hydrated. Hydration takes a few
 * hundred milliseconds - JS download, parse, hydrate - and the browser has
 * already painted that English HTML long before then. No client-side hook can
 * help, because React is not running yet. The server has to emit Chinese.
 *
 * Defaults to English so a page rendered without the provider still works.
 */
export const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

export function LocaleProvider({
  locale, children,
}: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}
