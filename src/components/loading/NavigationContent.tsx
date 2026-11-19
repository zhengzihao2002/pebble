'use client';
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { finishNavigation, useNavigationDestination } from './navigation';
import { useRememberedLayout } from './useRememberedLayout';
import { usePageReveal } from './usePageReveal';
import { PageSkeleton } from './PageSkeleton';
import { TraditionalPageLoader } from './TraditionalPageLoader';

const empty = { __html: '' };

export function NavigationContent({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const contentRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  usePageReveal(stageRef, contentRef, pathname);
  useRememberedLayout(contentRef, pathname);
  const pending = useNavigationDestination();
  useLayoutEffect(() => { finishNavigation(pathname); }, [pathname]);
  return <div ref={stageRef} className="pb-navigation-stage" suppressHydrationWarning>
    {/* One ring survives previews, streamed fallbacks and the final reveal. */}
    <div className="pb-page-spinner"><TraditionalPageLoader /></div>
    <div className="pb-cached-handoff-surface" aria-hidden="true" inert suppressHydrationWarning dangerouslySetInnerHTML={empty}/>
    {pending && <div className="pb-navigation-preview"><PageSkeleton pathname={pending.pathname}/></div>}
    <div ref={contentRef} className="pb-navigation-content" hidden={pending !== null}>{children}</div>
  </div>;
}
export function RouteLoading() {
  const pathname = usePathname();
  const pending = useNavigationDestination();
  return <PageSkeleton pathname={pending?.pathname ?? pathname}/>;
}
