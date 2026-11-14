'use client';
import { useLayoutEffect, type RefObject } from 'react';
import { createPageChartReveal } from '@/lib/chartReveal';

/** Keep the last skeleton in place through hydration, saved preferences and
 * child fetches. Reveal data with opacity only, never a layout transform. */
export function usePageReveal(stageRef: RefObject<HTMLDivElement|null>, contentRef: RefObject<HTMLDivElement|null>, pathname: string) {
  useLayoutEffect(() => {
    const stage = stageRef.current, content = contentRef.current;
    if (!stage || !content) return;
    const spinner = stage.querySelector<HTMLElement>(':scope > .pb-page-spinner');
    const charts = createPageChartReveal(content);
    let announced = false;
    delete content.dataset.pbPageVisible;
    const announce = () => {
      if (announced || content.hidden) return;
      announced = true; content.dataset.pbPageVisible = 'true';
      charts.reveal();
      window.dispatchEvent(new CustomEvent('pebble:page-visible', { detail: { content } }));
    };
    let snapshot: HTMLElement | null = null;
    let overlay: HTMLElement | null = null;
    let animation: Animation | null = null;
    let ghostAnimation: Animation | null = null;
    let timer = 0, revealing = false;
    const reset = () => {
      clearTimeout(timer);
      if (animation) { animation.onfinish=null; animation.cancel(); animation=null; }
      ghostAnimation?.cancel(); ghostAnimation=null;
      overlay?.remove(); overlay=null;
      stage.style.removeProperty('min-height');
      content.style.removeProperty('opacity');
      content.inert=false;
      content.classList.remove('pb-page-arriving');
      revealing=false;
    };
    const hideSpinner = () => { stage.removeAttribute('data-pb-spinner-loading'); };
    const finish = () => { reset(); hideSpinner(); };
    const inspect = () => {
      const traditional = !!spinner && document.documentElement.getAttribute('data-pb-loading-style') === 'spinner';
      const host = [...stage.querySelectorAll<HTMLElement>('.pb-layout-skeleton-host')]
        .find(el=>!el.closest('[hidden]') && (!el.hasAttribute('data-layout-ready') || (traditional ? el.getBoundingClientRect().width>0 : el.getBoundingClientRect().height>0)));
      if (host) {
        charts.pause(); announced = false; delete content.dataset.pbPageVisible;
        if (!host.hasAttribute('data-layout-ready')) return;
        reset();
        if (traditional) {
          snapshot=null;
          stage.setAttribute('data-pb-spinner-loading','true');
          return;
        }
        hideSpinner();
        const source = host.hasAttribute('data-layout-restored')
          ? host.querySelector<HTMLElement>('.pb-cached-layout')
          : host.querySelector<HTMLElement>('.pb-layout-estimate');
        if (source) {
          const rect = source.getBoundingClientRect(), origin = stage.getBoundingClientRect();
          snapshot = document.createElement('div');
          snapshot.className='pb-page-handoff';
          snapshot.setAttribute('aria-hidden','true');
          snapshot.inert=true;
          Object.assign(snapshot.style,{left:rect.left-origin.left+'px',top:rect.top-origin.top+'px',width:rect.width+'px',height:rect.height+'px'});
          snapshot.append(source.cloneNode(true));
        }
        return;
      }
      if (content.hidden || revealing) return;
      const busy = [...content.querySelectorAll('[aria-busy="true"],[data-slot="skeleton"]')]
        .some(element => !element.closest('[hidden]'));
      // Warm navigations and complete SSR pages may never show a fallback.
      // They still get one entry, before their first hydrated frame.
      const handoff = traditional ? stage.hasAttribute('data-pb-spinner-loading') : !!snapshot || !!overlay;
      if (!handoff) {
        if (!busy && document.fonts?.status !== 'loading') announce();
        return;
      }
      clearTimeout(timer);
      if (traditional) {
        content.style.opacity='0'; content.inert=true;
      } else if (!overlay && snapshot) {
        overlay=snapshot; snapshot=null;
        stage.style.minHeight=overlay.style.height;
        content.style.opacity='0'; content.inert=true;
        stage.append(overlay);
      }
      // Preloaded, hidden panels must not hold the visible page's handoff.
      if (busy || document.fonts?.status==='loading') return;
      // Allow mount effects, saved views and chart ResizeObservers to settle
      // behind the existing contours before making any data visible.
      timer=window.setTimeout(() => {
        const ghost=traditional ? spinner : overlay;
        if (!ghost || content.hidden) return;
        revealing=true;
        // A completed fade must not restart the old card rise-in animation.
        content.querySelectorAll<HTMLElement>('.pb-rise').forEach(el=>{ el.style.animation='none'; });
        content.classList.add('pb-page-arriving');
        content.style.removeProperty('opacity'); content.inert=false;
        announce();
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { finish(); return; }
        animation=content.animate([{opacity:0},{opacity:1}],{duration:300,easing:'ease-out'});
        ghostAnimation=ghost.animate([{opacity:1},{opacity:0}],{duration:300,easing:'ease-out',fill:'forwards'});
        animation.onfinish=finish;
      },80);
    };
    const observer = new MutationObserver(inspect);
    observer.observe(stage,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','data-layout-restored','data-layout-ready','aria-busy']});
    document.fonts?.addEventListener('loadingdone',inspect);
    document.fonts?.addEventListener('loadingerror',inspect);
    inspect();
    return () => {
      observer.disconnect(); finish(); charts.dispose(); delete content.dataset.pbPageVisible;
      document.fonts?.removeEventListener('loadingdone',inspect);
      document.fonts?.removeEventListener('loadingerror',inspect);
    };
  },[stageRef,contentRef,pathname]);
}
