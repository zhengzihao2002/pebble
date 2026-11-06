'use client';
import { useLayoutEffect, type RefObject } from 'react';
import { usePathname } from 'next/navigation';
import { bottomNavTools } from './bottomNavSnapshot';

export function useRememberedBottomNav(ref: RefObject<HTMLElement | null>, selection: string, engaged: boolean) {
  const committedPathname = usePathname();
  useLayoutEffect(() => {
    const nav = ref.current;
    if (!nav) return;
    // Cached height only bridges initial HTML to live layout. Never constrain
    // the loaded navigation after font, orientation or text-size changes.
    nav.style.removeProperty('min-height');
    if (engaged) return;
    // Pending navigation lights its destination before the URL commits. Never
    // save that destination's indicator under the departing page's cache key.
    const save = () => { if (selection === committedPathname) bottomNavTools.capture(nav); };
    const resize = new ResizeObserver(save);
    resize.observe(nav);
    nav.querySelectorAll('[data-pb-nav-link]').forEach(el=>resize.observe(el));
    const preferences = new MutationObserver(save);
    preferences.observe(document.documentElement,{attributes:true,attributeFilter:['lang','style','data-pebble-font','data-pebble-cjk']});
    document.fonts?.addEventListener('loadingdone',save);
    const background = () => { if (document.visibilityState==='hidden') save(); };
    document.addEventListener('visibilitychange',background);
    save();
    return () => { resize.disconnect(); preferences.disconnect(); document.fonts?.removeEventListener('loadingdone',save); document.removeEventListener('visibilitychange',background); };
  },[ref,selection,committedPathname,engaged]);
}
