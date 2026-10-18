'use client';

import { useLayoutEffect, useState, type RefObject } from 'react';

/**
 * The element's content width, kept current by a ResizeObserver. 0 until
 * measured, so callers render their wide layout on the server and the first
 * client frame (the Accounts page only draws these parts after mount).
 */
export function useWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}
