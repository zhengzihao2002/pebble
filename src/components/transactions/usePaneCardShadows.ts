'use client';

import { useLayoutEffect, type RefObject } from 'react';

/** The left cards scroll inside their pane, but their shadows paint in a
 * separate page layer so the scrollport cannot crop the frosted edges. */
export function usePaneCardShadows(pageRef: RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const page = pageRef.current;
    const pane = page?.querySelector<HTMLElement>('.pb-txn-pane-left');
    const root = page?.closest<HTMLElement>('.pebble-root');
    if (!page || !pane || !root) return;
    // A fixed layer in the app root inherits its theme without contributing
    // the offscreen cards' sizes to the document's scrollable overflow.
    const layer = document.createElement('div');
    layer.className = 'pb-txn-card-shadows';
    layer.setAttribute('aria-hidden', 'true');
    root.append(layer);
    const cards = [...pane.querySelectorAll<HTMLElement>('.pb-txn-rail > .card')];
    const shadows = cards.map(() => {
      const shadow = document.createElement('span');
      shadow.className = 'pb-txn-card-shadow';
      return shadow;
    });
    layer.replaceChildren(...shadows);
    let frame = 0;
    const update = () => {
      frame = 0;
      const split = page.getClientRects().length > 0 && getComputedStyle(pane).display !== 'contents';
      page.toggleAttribute('data-txn-panes', split);
      layer.style.display = split ? 'block' : 'none';
      if (!split) return;
      const viewport = pane.getBoundingClientRect();
      cards.forEach((card, index) => {
        const rect = card.getBoundingClientRect();
        const shadow = shadows[index];
        shadow.hidden = rect.bottom < viewport.top - 40 || rect.top > viewport.bottom + 40;
        Object.assign(shadow.style, {
          left: rect.left + 'px', top: rect.top + 'px',
          width: rect.width + 'px', height: rect.height + 'px',
          borderRadius: getComputedStyle(card).borderTopLeftRadius,
        });
      });
    };
    const queue = () => { if (!frame) frame = requestAnimationFrame(update); };
    const observer = new ResizeObserver(queue);
    observer.observe(page);
    observer.observe(pane);
    cards.forEach(card => observer.observe(card));
    pane.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', queue);
    update();
    return () => {
      observer.disconnect(); cancelAnimationFrame(frame);
      pane.removeEventListener('scroll', queue);
      window.removeEventListener('resize', queue);
      layer.remove();
    };
  }, [pageRef]);
}
