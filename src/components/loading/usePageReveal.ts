'use client';
import { useLayoutEffect, type RefObject } from 'react';

/** Keep the last skeleton in place through hydration, saved preferences and
 * child fetches. Reveal data with opacity only, never a layout transform. */
export function usePageReveal(stageRef: RefObject<HTMLDivElement|null>, contentRef: RefObject<HTMLDivElement|null>) {
  useLayoutEffect(() => {
    const stage = stageRef.current, content = contentRef.current;
    if (!stage || !content) return;
    let snapshot: HTMLElement | null = null;
    let overlay: HTMLElement | null = null;
    let animation: Animation | null = null;
    let timer = 0, revealing = false;
    const reset = () => {
      clearTimeout(timer);
      if (animation) { animation.onfinish=null; animation.cancel(); animation=null; }
      overlay?.remove(); overlay=null;
      stage.style.removeProperty('min-height');
      content.style.removeProperty('opacity');
      content.inert=false;
      content.classList.remove('pb-page-arriving');
      revealing=false;
    };
    const inspect = () => {
      const host = [...stage.querySelectorAll<HTMLElement>('.pb-layout-skeleton-host')]
        .find(el=>!el.closest('[hidden]') && el.getBoundingClientRect().height>0);
      if (host) {
        reset();
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
      if (content.hidden || revealing || (!snapshot && !overlay)) return;
      clearTimeout(timer);
      if (!overlay && snapshot) {
        overlay=snapshot; snapshot=null;
        stage.style.minHeight=overlay.style.height;
        content.style.opacity='0'; content.inert=true;
        stage.append(overlay);
      }
      if (content.querySelector('[aria-busy="true"],[data-slot="skeleton"]') || document.fonts?.status==='loading') return;
      // Allow mount effects, saved views and chart ResizeObservers to settle
      // behind the existing contours before making any data visible.
      timer=window.setTimeout(() => {
        if (!overlay || content.hidden) return;
        revealing=true;
        const ghost=overlay;
        // A completed fade must not restart the old card rise-in animation.
        content.querySelectorAll<HTMLElement>('.pb-rise').forEach(el=>{ el.style.animation='none'; });
        content.classList.add('pb-page-arriving');
        content.style.removeProperty('opacity'); content.inert=false;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { reset(); return; }
        animation=content.animate([{opacity:0},{opacity:1}],{duration:300,easing:'ease-out'});
        ghost.animate([{opacity:1},{opacity:0}],{duration:300,easing:'ease-out',fill:'forwards'});
        animation.onfinish=reset;
      },80);
    };
    const observer = new MutationObserver(inspect);
    observer.observe(stage,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','data-layout-restored','aria-busy']});
    document.fonts?.addEventListener('loadingdone',inspect);
    document.fonts?.addEventListener('loadingerror',inspect);
    inspect();
    return () => {
      observer.disconnect(); reset();
      document.fonts?.removeEventListener('loadingdone',inspect);
      document.fonts?.removeEventListener('loadingerror',inspect);
    };
  },[stageRef,contentRef]);
}
