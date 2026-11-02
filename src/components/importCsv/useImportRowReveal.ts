'use client';

import { useLayoutEffect, type RefObject } from 'react';

export const IMPORT_ROW_REVEALED = 'pb-import-row-revealed';
export const IMPORT_ROW_QUEUE_CHANGED = 'pb-import-row-queue-changed';
const DURATION = 360;
const SELECTOR = '.pb-import-row-reveal';
type Row = { visible: boolean; done: boolean; startsAt: number; animation: Animation | null };

/** One continuous sequence per scroller, including rows mounted in later DOM
 * batches. Offscreen rows never hold up the rows the reader can actually see.
 * Rebind when switching the split layout replaces the review scroller. */
export function useImportRowReveal(ref: RefObject<HTMLDivElement | null>, enabled = true, split = false) {
  useLayoutEffect(() => {
    const root = ref.current;
    if (!enabled || !root) return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const rows = new Map<HTMLElement, Row>();
    let started = false, introDone = false;
    // This is an opening reveal. Reading or scrolling later must never leave
    // an opaque card full of invisible, queued transaction rows.
    const finishIntro = () => {
      if (introDone) return;
      introDone = true;
      rows.forEach((row, element) => { if (!row.done) complete(element, row); });
    };
    const updateBusy = () => {
      const busy = [...rows.values()].some(row => row.visible && !row.done);
      if (root.hasAttribute('data-import-reveal-busy') !== busy) {
        root.toggleAttribute('data-import-reveal-busy', busy);
        root.dispatchEvent(new Event(IMPORT_ROW_QUEUE_CHANGED, { bubbles: true }));
      }
      if (!busy && started && !introDone) finishIntro();
    };
    const complete = (element: HTMLElement, row: Row) => {
      row.done = true;
      element.setAttribute('data-import-revealed', '');
      row.animation?.cancel(); row.animation = null;
      element.dispatchEvent(new Event(IMPORT_ROW_REVEALED));
      updateBusy();
    };
    const schedule = () => {
      const now = performance.now();
      let next = now;
      for (const row of rows.values()) {
        // Rebuild waiting slots when scrolling changes the visible rows.
        if (row.animation && row.startsAt > now) { row.animation.cancel(); row.animation = null; }
        if (row.visible && row.animation) next = Math.max(next, row.startsAt + DURATION);
      }
      // Finish all geometry reads before starting any animations.
      const waiting = [...rows].filter(([, row]) => row.visible && !row.done && !row.animation)
        .map(([element, row]) => ({ element, row, top: element.getBoundingClientRect().top }))
        .sort((a, b) => a.top - b.top);
      for (const { element, row } of waiting) {
        started = true;
        const opacity = Number(element.style.getPropertyValue('--pb-import-row-opacity') || 1);
        const animation = element.animate([{ opacity: 0 }, { opacity }], {
          duration: DURATION, delay: Math.max(0, next - now), easing: 'ease-out', fill: 'both',
        });
        row.startsAt = next; row.animation = animation; next += DURATION;
        void animation.finished.then(() => {
          if (rows.get(element) === row && row.animation === animation) complete(element, row);
        }).catch(() => {}); // Scrolling, removal and closing cancel waiting slots.
      }
      updateBusy();
    };
    const visibility = new IntersectionObserver(entries => {
      let changed = false;
      for (const entry of entries) {
        const row = rows.get(entry.target as HTMLElement);
        if (!row || row.done || row.visible === entry.isIntersecting) continue;
        row.visible = entry.isIntersecting; changed = true;
      }
      if (changed) schedule();
    }, { root });
    const discover = () => {
      for (const [element, row] of rows) {
        if (root.contains(element)) continue;
        visibility.unobserve(element); row.animation?.cancel(); rows.delete(element);
      }
      for (const element of root.querySelectorAll<HTMLElement>(SELECTOR)) {
        let row = rows.get(element);
        if (!row) {
          row = { visible: false, done: false, startsAt: 0, animation: null };
          rows.set(element, row);
          if (!element.hasAttribute('data-import-revealed')) visibility.observe(element);
        }
        // Later checkbox changes keep the preview's existing grow/collapse motion.
        if (!row.done && (introDone || media.matches || element.hasAttribute('data-import-revealed') || element.matches('.pb-tdlg-prow-enter,.pb-tdlg-prow-leave'))) {
          complete(element, row); visibility.unobserve(element);
        }
      }
      updateBusy();
    };
    const changes = new MutationObserver(discover);
    changes.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    const reduce = () => { if (media.matches) rows.forEach((row, element) => { if (!row.done) complete(element, row); }); };
    media.addEventListener('change', reduce);
    root.addEventListener('scroll', finishIntro, { passive: true });
    discover();
    return () => {
      visibility.disconnect(); changes.disconnect(); media.removeEventListener('change', reduce);
      root.removeEventListener('scroll', finishIntro);
      rows.forEach(row => row.animation?.cancel()); rows.clear();
      root.removeAttribute('data-import-reveal-busy');
    };
  }, [enabled, ref, split]);
}
