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
export function useResolvedDark(forceSystem = false): boolean {
  const appearance = usePebbleStore((s) => s.appearance);
  const systemDark = useSystemDark();
  const choice = isAppearance(appearance) ? appearance : 'system';
  if (forceSystem || choice === 'system') return systemDark;
  return choice === 'dark';
}
