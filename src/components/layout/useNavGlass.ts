'use client';

import { useLayoutEffect, useRef } from 'react';

interface Placement {
  selection: string;
  width: number;
  height: number;
  left: number;
  top: number;
}

/** One persistent selection surface follows the committed destination. */
export function useNavGlass<T extends HTMLElement>(selection: string, compact = false,
  selector = '[data-pb-nav-selected="true"]:not([href="/settings"]):not([href^="/account/"])') {
  const ref = useRef<T>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const placement = useRef<Placement | null>(null);

  useLayoutEffect(() => {
    const host = ref.current;
    const indicator = indicatorRef.current;
    if (!host || !indicator) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const target = host.querySelector<HTMLElement>(selector);
      const bounds = host.getBoundingClientRect();
      if (!target || bounds.width < 1 || bounds.height < 1) {
        delete host.dataset.pbGlassReady;
        delete host.dataset.pbGlassAnimated;
        delete host.dataset.pbGlassNavigated;
        placement.current = null;
        return;
      }
      const item = target.getBoundingClientRect();
      if (item.width < 1 || item.height < 1) {
        delete host.dataset.pbGlassReady;
        delete host.dataset.pbGlassAnimated;
        delete host.dataset.pbGlassNavigated;
        placement.current = null;
        return;
      }
      const width = compact ? Math.min(item.width, parseFloat(getComputedStyle(document.documentElement).fontSize) * 4.75) : item.width;
      const left = item.left - bounds.left - host.clientLeft + host.scrollLeft + (item.width - width) / 2;
      const top = item.top - bounds.top - host.clientTop + host.scrollTop;
      const nextWidth = `${width}px`;
      const nextHeight = `${item.height}px`;
      const nextTransform = `translate3d(${left}px, ${top}px, 0)`;
      const previous = placement.current;
      const moved = !previous || previous.width !== width || previous.height !== item.height || previous.left !== left || previous.top !== top;
      const navigate = previous !== null && previous.selection !== selection;
      // Compare measured numbers: CSSOM rounds fractional pixels and rewrites
      // translate3d's zero as 0px, which would make string comparisons drift.
      placement.current = { selection, width, height: item.height, left, top };
      // Font/session hydration and resizing must track the link immediately.
      // Only choosing another destination should make the surface travel.
      // Ignore the observer's first, unchanged notification after navigation:
      // cancelling its transition there would interrupt the intended glide.
      if (!moved && host.dataset.pbGlassReady === 'true') return;
      if (navigate && host.dataset.pbGlassReady === 'true') {
        host.dataset.pbGlassAnimated = 'true';
        host.dataset.pbGlassNavigated = 'true';
      } else delete host.dataset.pbGlassAnimated;
      indicator.style.width = nextWidth;
      indicator.style.height = nextHeight;
      indicator.style.transform = nextTransform;
      host.dataset.pbGlassReady = 'true';
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
      window.removeEventListener('resize', queue);
      host.removeEventListener('scroll', queue);
    };
  }, [selection, compact, selector]);

  return { ref, indicatorRef };
}
