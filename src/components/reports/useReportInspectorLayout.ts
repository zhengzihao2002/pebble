'use client';

import { useLayoutEffect, useRef, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import { settleCardResizes } from '@/lib/cardResize';
import { animateSummary, captureSummary, fadeSummaryOut, summaryWillReflow, type SummaryCapture } from './summaryLayoutMotion';

const DURATION = 360;
const CLOSE_DELAY = 60;

function startTogether(animations: Animation[]) {
  const start = document.timeline?.currentTime;
  if (typeof start === 'number') animations.forEach(animation => { animation.startTime = start; });
}

type Capture = {
  cards: Map<HTMLElement, DOMRect>;
  columns: string;
  interrupted: boolean;
  summary: SummaryCapture | null;
  inspector: { element: HTMLElement; before: DOMRect } | null;
};

/** Resize a single real grid track and native card heights together.
 * Typography stays unscaled, with no nested inverse transforms or snapshots. */
export function useReportInspectorLayout(pageRef: RefObject<HTMLDivElement | null>, expanded: boolean, ready: boolean) {
  const pending = useRef<Capture | null>(null);
  const motions = useRef<Animation[]>([]);
  const generation = useRef(0);
  const restore = useRef<(() => void) | null>(null);
  const exit = useRef<{ grid: HTMLElement; token: object; update: () => void } | null>(null);

  const settle = () => {
    generation.current++;
    pageRef.current?.querySelector('.pb-rep-grid')?.removeAttribute('data-pb-content-reveal');
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
    const columns = getComputedStyle(grid).gridTemplateColumns;
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
    pending.current = { cards: capture, inspector: inspectorCapture, interrupted, summary, columns };
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
      if (content) inspector.element.style.setProperty('--pb-rep-filter-height', `${Math.ceil(parseFloat(getComputedStyle(content).height) || content.offsetHeight) + 2}px`);
    }
    const inspectorAfter = inspector?.element.getBoundingClientRect();
    // Read all final geometry together before creating any animations.
    const final = [...capture.cards].filter(([card]) => card.isConnected).map(([card, before]) => ({ card, before, after: card.getBoundingClientRect() }));
    const summaryMotions: Animation[] = [];
    if (capture.summary) {
      const hero = final.find(item => item.card === capture.summary!.hero);
      if (hero) summaryMotions.push(...animateSummary(capture.summary, hero.before, hero.after, DURATION, delay));
    }
    // Every surface follows this one physical grid track. Text is never scaled.
    const columnMotion = grid.animate([
      { gridTemplateColumns: capture.columns },
      { gridTemplateColumns: getComputedStyle(grid).gridTemplateColumns },
    ], { duration: DURATION, delay, easing, fill: 'both' });
    columnMotion.id = 'pb-report-inspector-layout';
    motions.current = [columnMotion];
    for (const { card, before, after } of final) {
      if (!after.height || Math.abs(after.height - before.height) < 1) continue;
      const animation = card.animate([{ height: `${before.height}px` }, { height: `${after.height}px` }],
        { duration: DURATION, delay, easing, fill: 'both' });
      animation.id = 'pb-report-card-height'; motions.current.push(animation);
    }
    motions.current.push(...summaryMotions);
    if (inspector && inspectorAfter) {
      const animation = inspector.element.animate([
        { height: `${inspector.before.height}px` }, { height: `${inspectorAfter.height}px` },
      ], { duration: DURATION, delay, easing, fill: 'both' });
      animation.id = 'pb-report-inspector-surface'; motions.current.push(animation);
    }
    if (inspector) {
      for (const element of [grid.querySelector<HTMLElement>('.pb-rep-rail'), inspector?.element.querySelector<HTMLElement>('.pb-rep-filter-content')]) {
        if (element) motions.current.push(element.animate([{ opacity: 0 }, { opacity: 0 }], { duration: DURATION, delay, fill: 'both' }));
      }
    }
    // Explicitly share one timeline origin: a rapid reversal must not let
    // separate surfaces start on different frames.
    startTogether(motions.current);
    void Promise.allSettled(motions.current.map(animation => animation.finished)).then(() => {
      if (generation.current !== current) return;
      if (!summaryMotions.length || !capture.summary) { settle(); return; }
      // The geometry is settled before details return in reading order. The
      // inspector joins the first region on this clock, without a second CSS fade.
      grid.setAttribute('data-pb-content-reveal', '');
      const filterReveal = grid.querySelector<HTMLElement>(expanded ? '.pb-rep-filter-content' : '.pb-rep-rail');
      const elements = [...capture.summary.support.map(item => item.element), ...(filterReveal ? [filterReveal] : [])];
      const reveal = elements.map((element, index) => element.animate(
        [{ opacity: 0 }, { opacity: 1 }],
        { duration: 200, delay: element === filterReveal ? 0 : index * 35, easing: 'ease-in-out', fill: 'both' },
      ));
      motions.current.push(...reveal);
      const release = restore.current; restore.current = null; flushSync(() => release?.());
      startTogether(reveal);
      void Promise.allSettled(reveal.map(animation => animation.finished)).then(() => {
        if (generation.current === current) settle();
      });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commit = (update: () => void) => {
    prepare();
    // Cancelling previous geometry and committing the new grid is atomic.
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
      const filterContent = grid.querySelector<HTMLElement>(expanded ? '.pb-rep-filter-content' : '.pb-rep-rail');
      const filterOpacity = filterContent ? Number(getComputedStyle(filterContent).opacity) : 1;
      settle();
      grid.querySelector<HTMLElement>(expanded ? '.pb-rep-filter-content > button' : '.pb-rep-rail')?.focus({ preventScroll: true });
      if (support) {
        const current = ++generation.current;
        motions.current = [...support.support, ...(filterContent ? [{ element: filterContent, opacity: filterOpacity }] : [])].map(({ element, opacity }) => element.animate(
          [{ opacity }, { opacity: 1 }], { duration: 90, easing: 'ease-out', fill: 'both' },
        ));
        startTogether(motions.current);
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
      const filterContent = grid.querySelector<HTMLElement>(expanded ? '.pb-rep-filter-content' : '.pb-rep-rail');
      if (filterContent) motions.current.push(filterContent.animate(
        [{ opacity: Number(getComputedStyle(filterContent).opacity) }, { opacity: 0 }],
        { duration: 110, easing: 'ease-in-out', fill: 'both' },
      ));
      startTogether(motions.current);
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
