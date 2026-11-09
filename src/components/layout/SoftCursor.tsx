'use client';

import { useLayoutEffect } from 'react';
import { usePebbleStore } from '@/store/usePebbleStore';

/** Native CSS cursors: no pointer tracking, animation loop or overlay. */
export function SoftCursor() {
  const enabled = usePebbleStore(state => state.softCursor) === true;
  useLayoutEffect(() => {
    const root = document.querySelector('.pebble-root');
    root?.classList.toggle('pb-soft-cursor', enabled);
    return () => root?.classList.remove('pb-soft-cursor');
  }, [enabled]);
  return null;
}
