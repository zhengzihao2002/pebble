'use client';
import { useLayoutEffect, type RefObject } from 'react';
import { capturePageLayout, LAYOUT_CONTOUR_SELECTOR } from './layoutCache';
import { settleCardResizes } from '@/lib/cardResize';

/** Observe loaded card geometry; never cache a fallback or a hidden old page. */
export function useRememberedLayout(ref: RefObject<HTMLDivElement | null>, pathname: string) {
  useLayoutEffect(() => {
    const content = ref.current;
    const main = content?.closest<HTMLElement>('.pebble-main');
    if (!content || !main) return;
    let timer = 0;
    const observed = new Set<Element>();
    const schedule = () => { window.clearTimeout(timer); timer = window.setTimeout(measure,150); };
    const resize = new ResizeObserver(schedule);
    const measure = () => {
      timer = 0;
      // Cache the settled layout, never an in-between animation frame.
      if (main.hasAttribute('data-pb-sidebar-phase') || content.querySelector('.pb-card-resizing, [data-pb-inspector-motion]')) { schedule(); return; }
      for (const el of [...content.children,...content.querySelectorAll(LAYOUT_CONTOUR_SELECTOR)]) {
        if (!observed.has(el)) { observed.add(el); resize.observe(el); }
      }
      for (const el of observed) if (!el.isConnected) { resize.unobserve(el); observed.delete(el); }
      capturePageLayout(pathname);
    };
    resize.observe(main);
    const mutation = new MutationObserver(schedule);
    mutation.observe(content,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','aria-busy','class']});
    const root = main.closest('.pebble-root');
    root?.addEventListener('scroll',schedule,{passive:true});
    window.addEventListener('resize',schedule);
    content.addEventListener('animationend',schedule);
    content.addEventListener('transitionend',schedule);
    document.fonts?.addEventListener('loadingdone',schedule);
    // iOS can terminate a backgrounded app without firing pagehide. Save
    // synchronously as it becomes hidden, while the loaded geometry remains.
    const saveSettled = () => { settleCardResizes(content); measure(); };
    const onVisibility = () => { if (document.visibilityState === 'hidden') saveSettled(); };
    document.addEventListener('visibilitychange',onVisibility);
    window.addEventListener('pagehide',saveSettled);
    schedule();
    return () => {
      clearTimeout(timer); resize.disconnect(); mutation.disconnect();
      content.removeEventListener('animationend',schedule);
      content.removeEventListener('transitionend',schedule);
      root?.removeEventListener('scroll',schedule); window.removeEventListener('resize',schedule);
      document.fonts?.removeEventListener('loadingdone',schedule); document.removeEventListener('visibilitychange',onVisibility);
      window.removeEventListener('pagehide',saveSettled);
    };
  },[ref,pathname]);
}
