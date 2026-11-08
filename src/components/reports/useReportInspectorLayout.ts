'use client';

import { useLayoutEffect, useRef, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import { settleCardResizes } from '@/lib/cardResize';

const DURATION = 180;
const CLOSE_DELAY = 60;

type Capture = {
  cards: Map<HTMLElement, DOMRect>;
  inspector: { element: HTMLElement; before: DOMRect } | null;
};

/** Commit responsive layout once, then move the real cards on the compositor.
 * Recharts and container queries resolve at the final width, not every frame.
 * Native hit testing follows these live elements; no page snapshot is created. */
export function useReportInspectorLayout(pageRef: RefObject<HTMLDivElement | null>, expanded: boolean, ready: boolean) {
  const pending = useRef<Capture | null>(null);
  const motions = useRef<Animation[]>([]);
  const generation = useRef(0);
  const restore = useRef<(() => void) | null>(null);

  const settle = () => {
    generation.current++;
    for (const animation of motions.current) animation.cancel();
    motions.current = [];
    restore.current?.(); restore.current = null;
    pending.current = null;
  };

  // Call immediately before changing expanded, while old visual rects exist.
  const prepare = () => {
    const page = pageRef.current;
    const grid = page?.querySelector<HTMLElement>('.pb-rep-grid');
    const main = page?.querySelector<HTMLElement>('.pb-rep-main');
    if (!grid || !main || getComputedStyle(grid).display !== 'grid'
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const capture: Capture['cards'] = new Map();
    for (const card of main.querySelectorAll<HTMLElement>('.card')) {
      if (card.parentElement?.closest('.card')) continue;
      capture.set(card, card.getBoundingClientRect());
    }
    const inspector = grid.querySelector<HTMLElement>('.pb-rep-filters');
    const inspectorCapture = inspector ? { element: inspector, before: inspector.getBoundingClientRect() } : null;
    // Capture first so reversals continue from the currently visible position.
    settle();
    const previous = main.getAttribute('data-pb-resize');
    main.setAttribute('data-pb-resize', 'off');
    grid.setAttribute('data-pb-inspector-motion', '');
    settleCardResizes(main);
    restore.current = () => {
      if (previous === null) main.removeAttribute('data-pb-resize');
      else main.setAttribute('data-pb-resize', previous);
      grid.removeAttribute('data-pb-inspector-motion');
      inspector?.dispatchEvent(new Event('pb-report-inspector-settled'));
    };
    pending.current = { cards: capture, inspector: inspectorCapture };
  };

  useLayoutEffect(() => {
    const capture = pending.current;
    pending.current = null;
    if (!capture) return;
    const grid = pageRef.current?.querySelector<HTMLElement>('.pb-rep-grid');
    if (!grid || document.hidden || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { settle(); return; }
    const current = ++generation.current;
    const easing = getComputedStyle(grid).getPropertyValue('--pb-ease-out').trim() || 'cubic-bezier(.22,1,.36,1)';
    // Give the filter shell the same clock as the cards. Native CSS
    // transitions shorten reversed motion, which would desynchronize them.
    const inspector = capture.inspector;
    if (inspector && expanded) {
      const content = inspector.element.querySelector<HTMLElement>('.pb-rep-filter-content');
      if (content) inspector.element.style.setProperty('--pb-rep-filter-height', `${Math.ceil(content.getBoundingClientRect().height) + 2}px`);
    }
    const inspectorAfter = inspector?.element.getBoundingClientRect();
    // Read all final geometry together before creating any animations.
    const final = [...capture.cards].filter(([card]) => card.isConnected).map(([card, before]) => ({ card, before, after: card.getBoundingClientRect() }));
    motions.current = final.flatMap(({ card, before, after }) => {
      if (!after.width || !after.height) return [];
      const animation = card.animate([
        { transform: `translate(${before.left - after.left}px, ${before.top - after.top}px) scale(${before.width / after.width}, ${before.height / after.height})` },
        { transform: 'translate(0px, 0px) scale(1, 1)' },
      ], { duration: DURATION, delay: expanded ? 0 : CLOSE_DELAY, easing, fill: 'both' });
      animation.id = 'pb-report-inspector-layout';
      return [animation];
    });
    if (inspector && inspectorAfter) {
      const animation = inspector.element.animate([
        { width: `${inspector.before.width}px`, height: `${inspector.before.height}px` },
        { width: `${inspectorAfter.width}px`, height: `${inspectorAfter.height}px` },
      ], { duration: DURATION, delay: expanded ? 0 : CLOSE_DELAY, easing, fill: 'both' });
      animation.id = 'pb-report-inspector-surface';
      motions.current.push(animation);
    }
    void Promise.allSettled(motions.current.map(animation => animation.finished)).then(() => {
      if (generation.current === current) settle();
    });
    // No cleanup on expanded: prepare captures interrupted animations first.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, ready]);

  useLayoutEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const hidden = () => { if (document.hidden) settle(); };
    window.addEventListener('resize', settle, { passive: true });
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pagehide', settle);
    reduced.addEventListener('change', settle);
    return () => {
      settle(); window.removeEventListener('resize', settle);
      window.removeEventListener('pagehide', settle);
      document.removeEventListener('visibilitychange', hidden);
      reduced.removeEventListener('change', settle);
    };
    // The refs survive state changes; listeners intentionally mount once.
  }, []);

  return (update: () => void) => {
    prepare();
    // Cancelling the previous transforms and committing the new grid must
    // be atomic. Deferred commits could otherwise expose the old layout for
    // one frame during a rapid reversal.
    flushSync(update);
    if (pending.current) settle();
  };
}
