'use client';

import { useSyncExternalStore } from 'react';
import { usePebbleStore } from '@/store/usePebbleStore';
import { DARK_QUERY, isAppearance } from './appearance';

function subscribe(onChange: () => void) {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function readSystemDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(DARK_QUERY).matches;
}

/**
 * The device's light/dark setting, live. false on the server.
 *
 * The SAME reader serves as the hydration snapshot: React uses the "server"
 * snapshot while hydrating in the browser too, and answering false there made
 * System + a dark device drop the pre-paint dark class for a frame - a flash
 * of light on every load. In the browser it now reads the real setting.
 */
export function useSystemDark(): boolean {
  return useSyncExternalStore(subscribe, readSystemDark, readSystemDark);
}

/**
 * Whether Pebble is dark right now: the saved appearance, with System (and
 * any unrecognised stored value) following the device live. forceSystem is
 * for the auth pages, which always follow the device.
 */
function subscribeAppearance(onChange: () => void) {
  const stopStore = usePebbleStore.subscribe(onChange);
  const stopSystem = subscribe(onChange);
  return () => { stopStore(); stopSystem(); };
}
function readResolvedDark(): boolean {
  const appearance = usePebbleStore.getState().appearance;
  const choice = isAppearance(appearance) ? appearance : 'system';
  return choice === 'system' ? readSystemDark() : choice === 'dark';
}
function readBootDark(): boolean {
  // Zustand's hydration snapshot contains static defaults (System), even when
  // localStorage has Light. Honor the pre-paint result until hydration finishes.
  return typeof document !== 'undefined' && document.documentElement.classList.contains('pebble-dark');
}
export function useResolvedDark(forceSystem = false): boolean {
  const savedDark = useSyncExternalStore(subscribeAppearance, readResolvedDark, readBootDark);
  const systemDark = useSystemDark();
  return forceSystem ? systemDark : savedDark;
}
