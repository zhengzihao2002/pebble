'use client';

import { useLayoutEffect } from 'react';
import { CJK_FONT_ATTRIBUTE, FONT_ATTRIBUTE, isCjkFontChoice, isFontChoice } from '@/lib/fontChoice';
import { usePebbleStore } from '@/store/usePebbleStore';
import { normalizeTextSize } from '@/lib/textSize';

/** Keep parser-time typography intact throughout streaming and hydration. */
export function useTypographyPreferences(onAuth = false) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      // getState already contains persisted preferences. A render selector
      // initially returns SSR defaults, which would reset the page on reload.
      const { textSize, fontChoice, cjkFontChoice } = usePebbleStore.getState();
      const size = onAuth ? 100 : normalizeTextSize(textSize);
      const fontSize = `${size / 100 * 16}px`;
      if (root.style.fontSize !== fontSize) root.style.fontSize = fontSize;
      const font = !onAuth && isFontChoice(fontChoice) && fontChoice !== 'default' ? fontChoice : null;
      const cjk = !onAuth && isCjkFontChoice(cjkFontChoice) && cjkFontChoice !== 'sans' ? cjkFontChoice : null;
      for (const [attribute, value] of [[FONT_ATTRIBUTE, font], [CJK_FONT_ATTRIBUTE, cjk]] as const) {
        if (root.getAttribute(attribute) === value) continue;
        if (value === null) root.removeAttribute(attribute);
        else root.setAttribute(attribute, value);
      }
    };
    apply();
    const unsubscribe = usePebbleStore.subscribe(apply);
    // React or a streamed segment can rewrite root attributes without a store
    // update. Repair in the mutation microtask, before the next paint, rather
    // than leaving nondefault rem sizes at 16px until another preference update.
    const repair = new MutationObserver(apply);
    repair.observe(root, { attributes: true, attributeFilter: ['style', FONT_ATTRIBUTE, CJK_FONT_ATTRIBUTE] });
    return () => { unsubscribe(); repair.disconnect(); };
  }, [onAuth]);
}
