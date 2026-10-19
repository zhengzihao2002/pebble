'use client';

import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react';

interface FitState {
  /** The list is filling the height its card is given (dashboard.css says when). */
  fill: boolean;
  /** Rows shown. */
  count: number;
  /** Bottom of the `base`-th row, in px: the filling list's min-height. */
  floor: number;
}

/**
 * How many rows of a dashboard list to show, so a card whose height is set
 * by a taller partner in its grid row (Needs attention and Goals beside
 * Recent activity) fills that height with rows instead of a blank band.
 *
 * dashboard.css decides WHEN a list may fill: it sets `--pb-dash-fill: 1` on
 * the list in the layouts where the card shares a row. There the component
 * renders every candidate row and the list (data-fit="fill") takes the
 * card's spare height, clipped, with a min-height of its first `base` rows -
 * so the card's own height, and with it the row's, is exactly what it was
 * with `base` rows, and nothing here can feed back into the size being
 * measured. Rows that fit whole are shown; the rest are hidden (never a
 * half-cut row). Everywhere else - a phone, or a card with the row to itself
 * - the list shows a fixed `fixed` rows.
 *
 * The first render (server and hydration) always shows `base` rows; the
 * measuring happens in layout effects, before paint, and again whenever a
 * ResizeObserver sees the list or any of its rows change size (the partner
 * card grows when Recent activity shows more, the window narrows, a
 * breakpoint flips, a web font swaps in and a row re-wraps), and once more
 * when the page's fonts have loaded.
 */
export function useFitRows<T extends HTMLElement>(base: number, fixed: number, total: number) {
  const ref = useRef<T>(null);
  const [state, setState] = useState<FitState>({ fill: false, count: base, floor: 0 });
  const observed = useRef<{ el: Element; ro: ResizeObserver; rows: Set<Element> } | null>(null);

  const measure = useEffectEvent(() => {
    const el = ref.current;
    if (!el) return;
    const update = (next: FitState) => setState((s) => (s.fill === next.fill && s.count === next.count && s.floor === next.floor ? s : next));
    const fillable = total > base && getComputedStyle(el).getPropertyValue('--pb-dash-fill').trim() === '1';
    if (!fillable) { update({ fill: false, count: fixed, floor: 0 }); return; }
    // Turning fill on renders every row; they are measured on the next pass.
    if (!state.fill) { update({ fill: true, count: base, floor: 0 }); return; }
    const box = el.getBoundingClientRect();
    const padTop = parseFloat(getComputedStyle(el).paddingTop) || 0;
    const top = box.top + el.clientTop + padTop;
    const bottoms = Array.from(el.children).map((row) => row.getBoundingClientRect().bottom - top);
    if (bottoms.length === 0) return;
    // The min-height first (it depends only on the rows' width), then the fit.
    const floor = Math.ceil(bottoms[Math.min(base, bottoms.length) - 1]);
    if (floor !== state.floor) { update({ ...state, floor }); return; }
    const room = el.clientHeight - padTop;
    let n = 0;
    while (n < bottoms.length && bottoms[n] <= room + 0.5) n++;
    update({ ...state, count: Math.max(n, Math.min(base, bottoms.length)) });
  });

  // Every render: the list element can appear late (Needs attention renders
  // a skeleton until today resolves), so the observer follows it - and its
  // rows, which can change height while the list (sized by its partner when
  // filling) does not.
  useLayoutEffect(() => {
    const el = ref.current;
    if (observed.current?.el !== el) {
      observed.current?.ro.disconnect();
      observed.current = null;
      if (el && typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(() => measure());
        ro.observe(el);
        observed.current = { el, ro, rows: new Set() };
      }
    }
    const o = observed.current;
    if (o) {
      const now = new Set(Array.from(o.el.children));
      o.rows.forEach((row) => { if (!now.has(row)) { o.ro.unobserve(row); o.rows.delete(row); } });
      now.forEach((row) => { if (!o.rows.has(row)) { o.ro.observe(row, { box: 'border-box' }); o.rows.add(row); } });
    }
    measure();
  });
  useEffect(() => {
    let live = true;
    document.fonts?.ready.then(() => { if (live) measure(); });
    return () => { live = false; observed.current?.ro.disconnect(); observed.current = null; };
  }, []);

  // The ref apart from the values, which are plain render-time data.
  return [ref, { fill: state.fill, count: Math.min(state.count, total), floor: state.floor }] as const;
}
