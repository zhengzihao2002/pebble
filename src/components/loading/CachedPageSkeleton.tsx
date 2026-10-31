'use client';
import { useCallback, useState, type ReactNode } from 'react';
import { Skeleton } from '@/components/kit/Skeleton';
import { LoadingStatus } from '@/components/dashboard/LoadingStatus';
import { readPageLayout, type PageLayout } from './layoutCache';

/** Reconcile the optional browser cache during commit, before paint, while
 * keeping the server and first hydration render identical. */
export function CachedPageSkeleton({ pathname, children }: { pathname:string; children:ReactNode }) {
  const [layout,setLayout] = useState<PageLayout|null>(null);
  const attach = useCallback((node: HTMLDivElement|null) => {
    const main = node?.closest<HTMLElement>('.pebble-main');
    if (!node || !main) return;
    const update = () => setLayout(readPageLayout(pathname,main));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(main);
    const attributes = new MutationObserver(update);
    attributes.observe(document.documentElement,{attributes:true,attributeFilter:['lang','style','data-pebble-font','data-pebble-cjk']});
    window.addEventListener('resize',update);
    return () => { observer.disconnect(); attributes.disconnect(); window.removeEventListener('resize',update); };
  },[pathname]);
  return <div ref={attach} className="pb-layout-skeleton-host">
    {layout ? <><LoadingStatus/><div className="pb-cached-layout" aria-busy="true" data-layout-cache="true" style={{height:layout.height}}>
      {layout.boxes.map((box,index)=><div key={index} className={`card pb-cached-layout-box is-${box.kind}`} aria-hidden="true"
        style={{left:box.x,top:box.y,width:box.width,height:box.height,borderRadius:box.radius,boxShadow:box.flat?'none':undefined}}>
        <Skeleton width={box.kind==='bar'?'65%':'38%'} height=".7rem"/>
        {box.kind!=='bar' && box.height>90 && <Skeleton width="60%" height={box.kind==='hero'?'2.5rem':'1.3rem'}/>}
        {box.kind!=='bar' && box.height>180 && <Skeleton height="45%" radius=".6rem"/>}
      </div>)}
    </div></> : children}
  </div>;
}
