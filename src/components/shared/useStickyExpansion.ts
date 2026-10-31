'use client';

import { useLayoutEffect, useRef, useState } from 'react';

/** Expand a sticky page bar to the main column's edges once it meets the header. */
export function useStickyExpansion<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [stuck, setStuck] = useState(false);

  useLayoutEffect(() => {
    const bar = ref.current;
    const parent = bar?.parentElement;
    const area = bar?.closest('.pebble-main-content') ?? bar?.closest('main');
    const root = bar?.closest('.pebble-root');
    if (!bar || !parent || !area || !root) return;

    let frame = 0;
    const measure = () => {
      frame = 0;
      // Measure the unchanged parent, so expanding the bar cannot feed back
      // into its own bleed measurement. Includes max-width gutters on wide screens.
      const content = parent.getBoundingClientRect();
      const available = area.getBoundingClientRect();
      bar.style.setProperty('--pb-sticky-bleed-left', `${Math.max(0, content.left - available.left)}px`);
      bar.style.setProperty('--pb-sticky-bleed-right', `${Math.max(0, available.right - content.right)}px`);
      const top = parseFloat(getComputedStyle(bar).top) || 0;
      setStuck(bar.getBoundingClientRect().top <= top + .5);
    };
    const queue = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(queue);
    observer.observe(parent);
    observer.observe(area);
    const header = root.querySelector('.pebble-header');
    if (header) observer.observe(header);
    root.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', queue);
    queue();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      root.removeEventListener('scroll', queue);
      window.removeEventListener('scroll', queue);
      window.removeEventListener('resize', queue);
    };
  }, []);

  return { ref, stuck };
}
