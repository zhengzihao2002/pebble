'use client';

import { useEffect, useLayoutEffect, useState } from 'react';

// Identical to useEffect during SSR (a true no-op there, so this never
// triggers React's "useLayoutEffect does nothing on the server" warning),
// and the real, SYNCHRONOUS useLayoutEffect on the client.
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;
import { useContext } from 'react';
import { usePebbleStore } from '@/store/usePebbleStore';
import { LocaleContext } from './LocaleProvider';
import { getDictionary, t, type Dictionary, type Locale } from './index';

/**
 * False on the server and on the FIRST client render, true from the very
 * first paint onward.
 *
 * ⚠️ USES THE ISOMORPHIC LAYOUT EFFECT ABOVE, NOT useEffect - load-bearing,
 * not a style choice. useEffect fires AFTER the browser paints, so on every
 * reload in Chinese the English render was genuinely shown on screen for one
 * frame before the correction landed - a visible flash. useLayoutEffect fires
 * synchronously after the DOM commits but BEFORE the browser paints, so the
 * corrected render replaces the English one before the screen ever updates.
 *
 * This does NOT change the hydration contract: the server and the first
 * client render still both produce English, so there is still no mismatch.
 * Only how fast the correction reaches the screen changes.
 */
export function useHasMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useIsomorphicLayoutEffect(() => setMounted(true), []);
  return mounted;
}

/**
 * The only way a client component should read the language.
 *
 * ⚠️ WHY THE MOUNT GATE IS INSIDE THIS HOOK AND NOT AT EACH CALL SITE.
 * zustand-persist with synchronous localStorage rehydrates AT STORE CREATION,
 * so a component reading s.locale during render would see 'zh' on its very
 * first client render while the server had rendered English - a hydration
 * mismatch on every translated string in the application at once. Gating here
 * gives all ~50 components the required static-first behaviour with no
 * per-component ceremony and no chance of one of them forgetting.
 *
 * The cost is the accepted one: a brief flash of English before the stored
 * locale applies, exactly as text size behaves today.
 *
 * This is NOT a fifth restore/persist block (see BL-02). There is no local
 * useState mirror of a persisted value and nothing is written back; it reads
 * the store and defers by one render.
 */
export function useTranslation(): { locale: Locale; d: Dictionary; t: typeof t } {
  const stored = usePebbleStore((s) => s.locale);
  // What the SERVER rendered with, from the pebble-lang cookie. Using this as
  // the pre-mount value - rather than always English - is what removes the
  // flash on reload: the server's HTML and the first client render now agree
  // on the user's actual language, so there is nothing to correct after paint.
  //
  // Hydration is still safe: both sides read the same cookie value, delivered
  // through the RSC payload.
  const serverLocale = useContext(LocaleContext);
  const hasMounted = useHasMounted();
  const locale = hasMounted ? stored : serverLocale;
  return { locale, d: getDictionary(locale), t };
}
