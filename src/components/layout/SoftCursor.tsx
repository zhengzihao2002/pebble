'use client';

import { useLayoutEffect } from 'react';
import { normalizeCursorSize } from '@/lib/cursorSize';
import { usePebbleStore } from '@/store/usePebbleStore';

/** Native CSS cursors: no pointer tracking, animation loop or overlay. */
export function SoftCursor() {
  const enabled = usePebbleStore(state => state.softCursor) === true;
  const size = normalizeCursorSize(usePebbleStore(state => state.cursorSize));
  useLayoutEffect(() => {
    const root = document.querySelector<HTMLElement>('.pebble-root');
    const suffix = size === 32 ? '' : `-${size}`;
    for (const tone of ['light', 'dark']) root?.style.setProperty(`--pb-arrow-${tone}`,
      `url('/cursors/soft-arrow-${tone}${suffix}.svg') ${Math.round(size * 6 / 32)} ${Math.round(size * 4 / 32)}, auto`);
    root?.classList.toggle('pb-soft-cursor', enabled);
    return () => { root?.classList.remove('pb-soft-cursor'); root?.style.removeProperty('--pb-arrow-light'); root?.style.removeProperty('--pb-arrow-dark'); };
  }, [enabled, size]);
  return null;
}
