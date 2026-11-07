'use client';

import { useLayoutEffect } from 'react';
import { CJK_FONT_ATTRIBUTE, FONT_ATTRIBUTE, isCjkFontChoice, isFontChoice } from '@/lib/fontChoice';
import { usePebbleStore } from '@/store/usePebbleStore';
import { normalizeTextSize } from '@/lib/textSize';

/** Preserve pre-paint typography while React is using its static SSR snapshot. */
export function useTypographyPreferences() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      // getState already contains persisted preferences. A render selector
      // initially returns SSR defaults, which would reset the page on reload.
      const { textSize, fontChoice, cjkFontChoice } = usePebbleStore.getState();
      const size = normalizeTextSize(textSize);
      const fontSize = `${size / 100 * 16}px`;
      if (root.style.fontSize !== fontSize) root.style.fontSize = fontSize;
      const font = isFontChoice(fontChoice) && fontChoice !== 'default' ? fontChoice : null;
      const cjk = isCjkFontChoice(cjkFontChoice) && cjkFontChoice !== 'sans' ? cjkFontChoice : null;
      for (const [attribute, value] of [[FONT_ATTRIBUTE, font], [CJK_FONT_ATTRIBUTE, cjk]] as const) {
        if (root.getAttribute(attribute) === value) continue;
        if (value === null) root.removeAttribute(attribute);
        else root.setAttribute(attribute, value);
      }
    };
    apply();
    return usePebbleStore.subscribe(apply);
  }, []);
}
