'use client';

import { useLayoutEffect, useRef } from 'react';

/** One persistent selection surface follows the committed destination. */
export function useNavGlass<T extends HTMLElement>(selection: string, compact = false) {
  const ref = useRef<T>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const host = ref.current;
    const indicator = indicatorRef.current;
    if (!host || !indicator) return;
    let frame = 0;
    let readyFrame = 0;
    const measure = () => {
      frame = 0;
      const target = host.querySelector<HTMLElement>('[data-pb-nav-selected="true"]:not([href="/settings"]):not([href^="/account/"])');
      const bounds = host.getBoundingClientRect();
      if (!target || bounds.width < 1 || bounds.height < 1) {
        delete host.dataset.pbGlassReady;
        delete host.dataset.pbGlassAnimated;
        return;
      }
      const item = target.getBoundingClientRect();
      const width = compact ? Math.min(item.width, parseFloat(getComputedStyle(document.documentElement).fontSize) * 4.75) : item.width;
      const left = item.left - bounds.left - host.clientLeft + host.scrollLeft + (item.width - width) / 2;
      const top = item.top - bounds.top - host.clientTop + host.scrollTop;
      indicator.style.width = `${width}px`;
      indicator.style.height = `${item.height}px`;
      indicator.style.transform = `translate3d(${left}px, ${top}px, 0)`;
      host.dataset.pbGlassReady = 'true';
      // Mount at the current destination; only subsequent changes travel.
      if (!host.dataset.pbGlassAnimated && !readyFrame) {
        readyFrame = requestAnimationFrame(() => {
          readyFrame = 0;
          host.dataset.pbGlassAnimated = 'true';
        });
      }
    };
    const queue = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(queue);
    observer.observe(host);
    host.querySelectorAll('[data-pb-nav-link], nav, .pb-sidebar-brand, .pb-shell-side-foot').forEach(el => observer.observe(el));
    window.addEventListener('resize', queue);
    host.addEventListener('scroll', queue, { passive: true });
    measure();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      cancelAnimationFrame(readyFrame);
      window.removeEventListener('resize', queue);
      host.removeEventListener('scroll', queue);
    };
  }, [selection, compact]);

  return { ref, indicatorRef };
}
