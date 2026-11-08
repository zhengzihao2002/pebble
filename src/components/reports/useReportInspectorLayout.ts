'use client';

import { useLayoutEffect, useRef, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import { settleCardResizes } from '@/lib/cardResize';
import { animateSummary, captureSummary, fadeSummaryOut, summaryWillReflow, type SummaryCapture } from './summaryLayoutMotion';

const DURATION = 360;
const CLOSE_DELAY = 60;

type Capture = {
  cards: Map<HTMLElement, DOMRect>;
  interrupted: boolean;
  summary: SummaryCapture | null;
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
  const exit = useRef<{ grid: HTMLElement; token: object; update: () => void } | null>(null);

  const settle = () => {
    generation.current++;
    exit.current?.grid.removeAttribute('data-pb-summary-exit'); exit.current = null;
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
    const interrupted = motions.current.some(animation => animation.id === 'pb-report-inspector-layout' || animation.id === 'pb-report-inspector-surface');
    const summary = captureSummary(page!);
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
    pending.current = { cards: capture, inspector: inspectorCapture, interrupted, summary };
  };

  useLayoutEffect(() => {
    const capture = pending.current;
    pending.current = null;
    if (!capture) return;
    const grid = pageRef.current?.querySelector<HTMLElement>('.pb-rep-grid');
    if (!grid || document.hidden || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { settle(); return; }
    const current = ++generation.current;
    const delay = expanded || capture.interrupted ? 0 : CLOSE_DELAY;
    const easing = getComputedStyle(grid).getPropertyValue('--pb-rep-layout-ease').trim() || 'cubic-bezier(.4,0,.2,1)';
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
    const summaryMotions: Animation[] = [];
    if (capture.summary) {
      const hero = final.find(item => item.card === capture.summary!.hero);
      if (hero) summaryMotions.push(...animateSummary(capture.summary, hero.before, hero.after, DURATION, delay, easing));
    }
    motions.current = final.flatMap(({ card, before, after }) => {
      if (!after.width || !after.height) return [];
      const animation = card.animate([
        { transform: `translate(${before.left - after.left}px, ${before.top - after.top}px) scale(${before.width / after.width}, ${before.height / after.height})` },
        { transform: 'translate(0px, 0px) scale(1, 1)' },
      ], { duration: DURATION, delay, easing, fill: 'both' });
      animation.id = 'pb-report-inspector-layout';
      return [animation];
    });
    motions.current.push(...summaryMotions);
    if (inspector && inspectorAfter) {
      const animation = inspector.element.animate([
        { width: `${inspector.before.width}px`, height: `${inspector.before.height}px` },
        { width: `${inspectorAfter.width}px`, height: `${inspectorAfter.height}px` },
      ], { duration: DURATION, delay, easing, fill: 'both' });
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

  const commit = (update: () => void) => {
    prepare();
    // Cancelling previous transforms and committing the new grid is atomic.
    flushSync(update);
    if (pending.current) settle();
  };

  return (update: () => void, intent: 'toggle' | 'open' = 'toggle') => {
    if (exit.current && intent === 'open') { exit.current.update = update; return; }
    if (intent === 'open' && expanded) { flushSync(update); return; }
    if (exit.current) {
      // A second click during the brief exit cancels the pending layout change.
      const support = captureSummary(pageRef.current!);
      const grid = exit.current.grid;
      settle();
      grid.querySelector<HTMLElement>(expanded ? '.pb-rep-filter-content > button' : '.pb-rep-rail')?.focus({ preventScroll: true });
      if (support) {
        const current = ++generation.current;
        motions.current = support.support.map(({ element, opacity }) => element.animate(
          [{ opacity }, { opacity: 1 }], { duration: 90, easing: 'ease-out', fill: 'both' },
        ));
        void Promise.allSettled(motions.current.map(animation => animation.finished)).then(() => {
          if (generation.current === current) settle();
        });
      }
      return;
    }
    const page = pageRef.current;
    const grid = page?.querySelector<HTMLElement>('.pb-rep-grid');
    const summary = page && captureSummary(page);
    if (grid && summary && !motions.current.length && getComputedStyle(grid).display === 'grid'
      && !document.hidden && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      && summaryWillReflow(summary, grid)) {
      const token = {};
      exit.current = { grid, token, update };
      grid.setAttribute('data-pb-summary-exit', '');
      motions.current = fadeSummaryOut(summary);
      void Promise.allSettled(motions.current.map(animation => animation.finished)).then(() => {
        if (exit.current?.token !== token) return;
        const action = exit.current.update;
        exit.current = null; grid.removeAttribute('data-pb-summary-exit');
        commit(action);
      });
      return;
    }
    commit(update);
  };
}
