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
 * The hydration snapshot must match the server. The parser-time preference
 * script and HtmlPreferenceSync own the page's colours; this hook only reads
 * state for controls and must not invalidate the server's markup.
 */
export function useSystemDark(): boolean {
  return useSyncExternalStore(subscribe, readSystemDark, readServerDark);
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
const readServerDark = () => false;
export function useResolvedDark(forceSystem = false): boolean {
  const savedDark = useSyncExternalStore(subscribeAppearance, readResolvedDark, readServerDark);
  const systemDark = useSystemDark();
  return forceSystem ? systemDark : savedDark;
}
