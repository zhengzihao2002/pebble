'use client';

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

interface ScrollAnchorOptions {
  /** CSS selector for the elements that may serve as the anchor. Granular
      ones (a row, not a whole section) keep the position accurate. */
  anchors: string;
  /** CSS selector for the element whose size changes when the layout does
      (observed to correct late reflow). */
  content: string;
  /** The scroller. Pebble's pages scroll inside .pebble-root; html and body
      are fixed and never scroll. */
  scroller?: string;
}

interface Anchor { el: HTMLElement; top: number; at: number }

// A pending anchor older than this belongs to a change that never happened
// (e.g. pressing the preset that is already selected), so it is dropped. Long
// enough for a slow device to render a language switch (a dropped anchor
// meant the page jumped after all); a stale one is still nearly right.
const PENDING_MAX_AGE_MS = 2000;
// Reflow can continue after the commit: the root font size is applied by an
// effect one level up, and a web font swaps in a frame or two later.
const SETTLE_MS = 700;
const SETTLE_FRAMES = 3;

/**
 * Keeps the page where the reader was when a setting reflows the WHOLE page
 * (text size, language, font). Without it the content above the viewport
 * grows or shrinks, and the thing being read jumps away - the owner saw
 * Settings "scroll" every time the text size changed.
 *
 * Browser scroll anchoring (overflow-anchor) is not enough: Safari, i.e. the
 * iPhone app, does not implement it, and Chrome's choice of anchor is its
 * own. So this does it by hand:
 *
 *   1. `keepPlace()` is called just BEFORE the store changes. It records the
 *      element at the top of the viewport (the smallest anchor candidate
 *      holding the line under the sticky header) and its offset from the
 *      viewport top.
 *   2. When `changeKey` changes, a layout effect scrolls so that element is
 *      back at that offset - before the browser paints the new layout.
 *   3. Reflow can go on after that commit, so for a short window the same
 *      correction is repeated on every resize of the content and for a few
 *      frames. The window ends early the moment the reader scrolls
 *      themselves, so it never fights them.
 *
 * A slider drag calls keepPlace() on every step, so the anchor follows the
 * drag and the page holds still the whole way.
 *
 * @param changeKey a string that differs whenever a setting that reflows the
 *   page has changed (the layout effect runs on it).
 * @returns keepPlace, to call right before changing such a setting.
 */
export function useScrollAnchor(changeKey: string, { anchors, content, scroller = '.pebble-root' }: ScrollAnchorOptions) {
  const pendingRef = useRef<Anchor | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  // The anchor of the correction window that is running, if any.
  const activeRef = useRef<Anchor | null>(null);
  // Options live in a ref so the callbacks stay stable for the caller.
  const optsRef = useRef({ anchors, content, scroller });
  useEffect(() => { optsRef.current = { anchors, content, scroller }; });

  const keepPlace = useCallback(() => {
    // Mid-drag (a correction window is still open): keep the SAME anchor at
    // its ORIGINAL offset. Re-picking one every step would let sub-pixel
    // rounding add up to a slow drift over a long drag.
    const running = activeRef.current;
    if (stopRef.current && running?.el.isConnected) {
      pendingRef.current = { ...running, at: performance.now() };
      return;
    }
    const { anchors: sel, scroller: scrollSel } = optsRef.current;
    const root = document.querySelector<HTMLElement>(scrollSel);
    if (!root) { pendingRef.current = null; return; }

    const rootTop = root.getBoundingClientRect().top;
    // The line under the sticky header: what the reader sees first.
    const chrome = parseFloat(getComputedStyle(root).getPropertyValue('--pb-header-h')) || 0;
    const line = rootTop + chrome + 1;

    let best: HTMLElement | null = null;
    let bestSize = Infinity;
    let below: HTMLElement | null = null;
    let belowTop = Infinity;
    for (const cand of root.querySelectorAll<HTMLElement>(sel)) {
      const r = cand.getBoundingClientRect();
      if (r.height === 0) continue;
      if (r.top <= line && r.bottom > line) {
        // Holding the line: the smallest one is the most specific.
        if (r.height < bestSize) { best = cand; bestSize = r.height; }
      } else if (r.top > line && r.top < belowTop) {
        below = cand; belowTop = r.top;
      }
    }
    const el = best ?? below;
    pendingRef.current = el ? { el, top: el.getBoundingClientRect().top, at: performance.now() } : null;
  }, []);

  useLayoutEffect(() => {
    const anchor = pendingRef.current;
    pendingRef.current = null;
    if (!anchor || performance.now() - anchor.at > PENDING_MAX_AGE_MS) return;
    const { content: contentSel, scroller: scrollSel } = optsRef.current;
    const root = document.querySelector<HTMLElement>(scrollSel);
    if (!root) return;

    stopRef.current?.();
    activeRef.current = anchor;

    const apply = () => {
      if (!anchor.el.isConnected) return;
      const delta = anchor.el.getBoundingClientRect().top - anchor.top;
      // 'instant', never the default: a smooth scroll-behavior would turn the
      // correction into a visible slide.
      if (Math.abs(delta) >= 0.5) root.scrollTo({ top: root.scrollTop + delta, behavior: 'instant' });
    };
    apply();

    let frames = 0;
    let raf = 0;
    const tick = () => { apply(); if (++frames < SETTLE_FRAMES) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);

    // ResizeObserver callbacks run after layout and before paint, so a
    // correction made here is never seen as a jump.
    const target = document.querySelector(contentSel);
    const ro = typeof ResizeObserver !== 'undefined' && target ? new ResizeObserver(apply) : null;
    if (ro && target) ro.observe(target);

    const stop = () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
      ro?.disconnect();
      root.removeEventListener('wheel', stop);
      root.removeEventListener('touchmove', stop);
      root.removeEventListener('pointerdown', onPointer);
      if (stopRef.current === stop) { stopRef.current = null; activeRef.current = null; }
    };
    // The reader taking over the scroll (wheel, touch, or the scrollbar
    // itself) ends the correction at once.
    const onPointer = (e: PointerEvent) => { if (e.target === root) stop(); };
    root.addEventListener('wheel', stop, { passive: true });
    root.addEventListener('touchmove', stop, { passive: true });
    root.addEventListener('pointerdown', onPointer);
    const timer = window.setTimeout(stop, SETTLE_MS);
    stopRef.current = stop;
  }, [changeKey]);

  useEffect(() => () => stopRef.current?.(), []);

  return keepPlace;
}
