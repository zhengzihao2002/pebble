'use client';

import { useSyncExternalStore } from 'react';

/**
 * The palette shortcut as this keyboard writes it: '⌘K' on a Mac (and iPad
 * keyboards), 'Ctrl K' everywhere else. AppShell accepts either modifier, so
 * this is display only.
 *
 * Null on the server and during hydration (the server snapshot), so the
 * first client render matches the HTML exactly; React then re-renders with
 * the platform's label. Callers render no badge while it is null - a hint
 * that appears a frame late beats one that shows the wrong key first.
 */
const noSubscribe = () => () => {};

function readLabel(): string {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = nav.userAgentData?.platform || nav.platform || nav.userAgent;
  return /mac|iphone|ipad|ipod/i.test(platform) ? '⌘K' : 'Ctrl K';
}

export function useShortcutLabel(): string | null {
  return useSyncExternalStore(noSubscribe, readLabel, () => null);
}
