'use client';
import { useLayoutEffect, type RefObject } from 'react';
import { capturePageLayout } from './layoutCache';

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
      for (const el of [...content.children,...content.querySelectorAll('.card,[data-slot="card"],.add-goal-tile,.pb-annual-footer,.pb-dash-hero,.pb-accounts-tile')]) {
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
    window.addEventListener('pagehide',measure);
    schedule();
    return () => {
      clearTimeout(timer); resize.disconnect(); mutation.disconnect();
      content.removeEventListener('animationend',schedule);
      content.removeEventListener('transitionend',schedule);
      root?.removeEventListener('scroll',schedule); window.removeEventListener('resize',schedule);
      document.fonts?.removeEventListener('loadingdone',schedule); window.removeEventListener('pagehide',measure);
    };
  },[ref,pathname]);
}
