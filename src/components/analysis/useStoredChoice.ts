'use client';

import { useState, useSyncExternalStore } from 'react';

function noSubscribe(): () => void {
  return () => {};
}

/**
 * A per-viewer chart view (Net / In & out, Rate / Paycheck), remembered in
 * this browser only - a convenience, never shared or read by the server.
 * The first render is the static default (the server snapshot), then the
 * stored choice: no hydration mismatch, and storage that throws (private
 * mode) just keeps the default. A value that is not one of `allowed` is
 * ignored, so a stale or hand-edited entry cannot break the chart.
 */
export function useStoredChoice<T extends string>(key: string, allowed: readonly T[], fallback: T): [T, (v: T) => void] {
  const stored = useSyncExternalStore(
    noSubscribe,
    () => {
      try {
        const v = window.localStorage.getItem(key);
        return v !== null && (allowed as readonly string[]).includes(v) ? (v as T) : null;
      } catch { return null; }
    },
    () => null,
  );
  const [picked, setPicked] = useState<T | null>(null);
  const choose = (v: T) => {
    setPicked(v);
    try { window.localStorage.setItem(key, v); } catch { /* not remembered */ }
  };
  return [picked ?? stored ?? fallback, choose];
}
