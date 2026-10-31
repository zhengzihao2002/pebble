'use client';
import { useSyncExternalStore } from 'react';
import { capturePageLayout } from './layoutCache';
import { usePathname } from 'next/navigation';

let destination: { pathname: string; id: number } | null = null;
let sequence = 0;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const snapshot = () => destination;
const serverSnapshot = () => null;
export const useNavigationDestination = () => useSyncExternalStore(subscribe, snapshot, serverSnapshot);
export function beginNavigation(href: string) {
  const url = new URL(href, window.location.href);
  if (url.origin !== window.location.origin || url.pathname === window.location.pathname || !document.querySelector('.pebble-main') || !/^\/(dashboard|transactions|accounts|analysis|insights|reports|budgets|goals|scheduled|settings|account)(\/|$)/.test(url.pathname)) return;
  capturePageLayout(window.location.pathname);
  destination = { pathname: url.pathname, id: ++sequence };
  listeners.forEach(listener => listener());
}
export function finishNavigation(pathname: string) {
  if (destination?.pathname !== pathname) return;
  destination = null;
  listeners.forEach(listener => listener());
}
export function useNavigationPathname() {
  const pathname = usePathname();
  return useNavigationDestination()?.pathname ?? pathname;
}
