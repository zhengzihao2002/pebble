'use client';

import { useLayoutEffect, type RefObject } from 'react';

/** Cards scroll inside each pane, but their shadows paint in a
 * separate page layer so the scrollport cannot crop the frosted edges. */
export function usePaneCardShadows(pageRef: RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const page = pageRef.current;
    const panes = page ? [...page.querySelectorAll<HTMLElement>('.pb-txn-pane')] : [];
    const pane = panes[0];
    const rightPane = panes[1];
    const toolbar = page?.querySelector<HTMLElement>('.pb-txn-bar');
    const root = page?.closest<HTMLElement>('.pebble-root');
    if (!page || !pane || !root) return;
    // A fixed layer in the app root inherits its theme without contributing
    // the offscreen cards' sizes to the document's scrollable overflow.
    const layer = document.createElement('div');
    layer.className = 'pb-txn-card-shadows';
    layer.setAttribute('aria-hidden', 'true');
    root.append(layer);
    const records = new Map<HTMLElement, { shadow: HTMLSpanElement; pane: HTMLElement }>();
    let frame = 0;
    const update = () => {
      frame = 0;
      const split = page.getClientRects().length > 0 && getComputedStyle(pane).display !== 'contents';
      page.toggleAttribute('data-txn-panes', split);
      page.toggleAttribute('data-txn-more-below', split && pane.scrollHeight - pane.scrollTop - pane.clientHeight > 2);
      layer.style.display = split ? 'block' : 'none';
      if (toolbar && rightPane) {
        const stuck = split && toolbar.getBoundingClientRect().top <= rightPane.getBoundingClientRect().top + .5;
        const state = String(stuck);
        if (toolbar.getAttribute('data-stuck') !== state) toolbar.setAttribute('data-stuck', state);
      }
      if (!split) return;
      // Extend only the scrollport; its padding preserves the centered rows.
      page.style.setProperty('--pb-txn-right-reach', `${Math.max(0, window.innerWidth - page.getBoundingClientRect().right)}px`);
      const cards = new Set(page.querySelectorAll<HTMLElement>('.pb-txn-rail > .card, .pb-txn-main > .card, .pb-txn-main > div > .card'));
      for (const [card, { shadow }] of records) {
        if (cards.has(card)) continue;
        observer.unobserve(card); card.removeAttribute('data-pb-pane-shadow');
        shadow.remove(); records.delete(card);
      }
      for (const card of cards) {
        if (records.has(card)) continue;
        const host = card.closest<HTMLElement>('.pb-txn-pane');
        if (!host) continue;
        const shadow = document.createElement('span');
        shadow.className = 'pb-txn-card-shadow';
        card.setAttribute('data-pb-pane-shadow', '');
        layer.append(shadow); records.set(card, { shadow, pane: host });
        observer.observe(card);
      }
      for (const [card, { shadow, pane: host }] of records) {
        const rect = card.getBoundingClientRect();
        const viewport = host.getBoundingClientRect();
        shadow.hidden = rect.bottom < viewport.top - 40 || rect.top > viewport.bottom + 40;
        Object.assign(shadow.style, {
          left: rect.left + 'px', top: rect.top + 'px',
          width: rect.width + 'px', height: rect.height + 'px',
          borderRadius: getComputedStyle(card).borderTopLeftRadius,
        });
      }
    };
    const queue = () => { if (!frame) frame = requestAnimationFrame(update); };
    const observer = new ResizeObserver(queue);
    observer.observe(page);
    panes.forEach(host => { observer.observe(host); host.addEventListener('scroll', queue, { passive: true }); });
    const changes = new MutationObserver(queue);
    changes.observe(page, { childList: true, subtree: true });
    window.addEventListener('resize', queue);
    update();
    return () => {
      observer.disconnect(); changes.disconnect(); cancelAnimationFrame(frame);
      panes.forEach(host => host.removeEventListener('scroll', queue));
      records.forEach((_, card) => card.removeAttribute('data-pb-pane-shadow'));
      window.removeEventListener('resize', queue);
      layer.remove();
    };
  }, [pageRef]);
}
