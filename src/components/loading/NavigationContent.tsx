'use client';
import { useLayoutEffect, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { finishNavigation, useNavigationDestination } from './navigation';
import { PageSkeleton } from './PageSkeleton';

export function NavigationContent({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const pending = useNavigationDestination();
  useLayoutEffect(() => { finishNavigation(pathname); }, [pathname]);
  return <>
    {pending && <div className="pb-navigation-preview"><PageSkeleton pathname={pending.pathname}/></div>}
    <div className="pb-navigation-content" hidden={pending !== null}>{children}</div>
  </>;
}
export function RouteLoading() {
  const pathname = usePathname();
  const pending = useNavigationDestination();
  return <PageSkeleton pathname={pending?.pathname ?? pathname}/>;
}
