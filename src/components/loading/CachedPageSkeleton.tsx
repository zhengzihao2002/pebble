'use client';
import { useCallback, type ReactNode } from 'react';
import { readPageLayout } from './layoutCache';
import { layoutBootstrap, layoutTools } from './layoutSnapshot';
import { TraditionalPageLoader } from './TraditionalPageLoader';

const empty = { __html: '' };
/** One geometry for the navigation preview, streamed fallback and client
 * initialization. The inline restore also runs before React downloads. */
export function CachedPageSkeleton({ pathname, children }: { pathname:string; children:ReactNode }) {
  const attach = useCallback((node: HTMLDivElement|null) => {
    if (!node) return;
    const stopPreparing = layoutTools.prepare(node);
    const main = node.closest<HTMLElement>('.pebble-main');
    if (!main) return stopPreparing;
    const update = () => layoutTools.restore(node,
      document.documentElement.getAttribute('data-pb-loading-style') === 'spinner' ? null : readPageLayout(pathname,main));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(main);
    const attributes = new MutationObserver(update);
    attributes.observe(document.documentElement,{attributes:true,attributeFilter:['lang','style','data-pebble-font','data-pebble-cjk','data-pb-loading-style']});
    window.addEventListener('resize',update);
    return () => { stopPreparing(); observer.disconnect(); attributes.disconnect(); window.removeEventListener('resize',update); };
  },[pathname]);
  return <div ref={attach} className="pb-layout-skeleton-host" data-layout-path={pathname} aria-busy="true" suppressHydrationWarning>
    <div className="pb-layout-restored" suppressHydrationWarning dangerouslySetInnerHTML={empty}/>
    <TraditionalPageLoader />
    <script dangerouslySetInnerHTML={{__html:layoutBootstrap}}/>
    <div className="pb-layout-estimate">{children}</div>
  </div>;
}
