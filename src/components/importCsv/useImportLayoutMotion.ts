'use client';

import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

const DURATION = 260;
const REVEAL_AFTER = 100;
const EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

/** Lay out the split once, then move its surfaces with transforms. Start the
 * rows early in that motion, already using their final layout width. */
export function useImportLayoutMotion(paneRef: RefObject<HTMLDivElement | null>, open: boolean, enabled: boolean) {
  const previous = useRef<DOMRect | null>(null);
  const animations = useRef<Animation[]>([]);
  const [phase, setPhase] = useState({ open, settled: true });
  // A quick Back -> Preview must start a fresh reveal even if the previous
  // closing animation has not finished yet.
  if (phase.open !== open) setPhase({ open, settled: false });

  useLayoutEffect(() => {
    const pane = paneRef.current;
    if (!enabled || !pane) return;
    const remember = () => {
      if (animations.current.length === 0) previous.current = pane.getBoundingClientRect();
    };
    const observer = new ResizeObserver(remember);
    observer.observe(pane, { box: 'border-box' });
    window.addEventListener('resize', remember);
    return () => { observer.disconnect(); window.removeEventListener('resize', remember); };
  }, [enabled, paneRef]);

  useLayoutEffect(() => {
    const pane = paneRef.current;
    if (!enabled || !pane) { previous.current = null; return; }
    const from = previous.current;
    const to = pane.getBoundingClientRect();
    previous.current = to;
    if (!from || !to.width || !to.height || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setPhase({ open, settled: true });
      return;
    }
    const motion = pane.animate([
      { transformOrigin: 'top left', transform: `translate(${from.x - to.x}px, ${from.y - to.y}px) scale(${from.width / to.width}, ${from.height / to.height})` },
      { transformOrigin: 'top left', transform: 'none' },
    ], { duration: DURATION, easing: EASING });
    const side = pane.nextElementSibling;
    const entering = open && side instanceof HTMLElement
      ? side.animate([{ opacity: 0, transform: 'translateX(32px)' }, { opacity: 1, transform: 'none' }], { duration: DURATION, easing: EASING })
      : null;
    const active = entering ? [motion, entering] : [motion];
    animations.current = active;
    let cancelled = false;
    const revealTimer = open ? window.setTimeout(() => {
      if (!cancelled) setPhase({ open, settled: true });
    }, REVEAL_AFTER) : undefined;
    void Promise.all(active.map(animation => animation.finished)).then(() => {
      if (cancelled) return;
      animations.current = [];
      previous.current = pane.getBoundingClientRect();
      setPhase(current => current.open === open && current.settled ? current : { open, settled: true });
    }).catch(() => {}); // Cancellation belongs to a newer layout or an unmount.
    return () => {
      cancelled = true;
      window.clearTimeout(revealTimer);
      active.forEach(animation => animation.cancel());
      animations.current = [];
    };
  }, [enabled, open, paneRef]);

  return !enabled || !open || (phase.open === open && phase.settled);
}
