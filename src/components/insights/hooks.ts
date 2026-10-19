'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

const COARSE = '(pointer: coarse)';
const subscribeCoarse = (cb: () => void) => {
  const mq = window.matchMedia(COARSE);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};

/**
 * True on a touch-first device. False on the server and the first client
 * render (useSyncExternalStore's server snapshot), so hydration matches; the
 * real value follows immediately after.
 */
export function useCoarsePointer(): boolean {
  return useSyncExternalStore(subscribeCoarse, () => window.matchMedia(COARSE).matches, () => false);
}

/**
 * The element's content-box size, kept current by a ResizeObserver. A
 * callback ref, so it starts measuring whenever the element mounts (a card
 * may render a skeleton first and the measured box later).
 */
export function useElementSize<T extends HTMLElement>(): [(el: T | null) => void, { width: number; height: number }] {
  const [el, setEl] = useState<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((s) => (s.width === width && s.height === height ? s : { width, height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, size];
}

/**
 * Dismiss with a grace period. hide(id) shows the note as "Hidden · Undo"
 * for `delay` ms and only then calls commit(id) - so a mis-tap on a phone
 * no longer permanently hides, say, a card-due reminder. Pending dismissals
 * are committed at once if the page is left (unmount or pagehide), so
 * nothing the person hid comes back. The store and its persisted ids are
 * untouched: the call that ends a dismissal is the same dismissInsight(id).
 */
export function useDismissQueue(commit: (id: string) => void, delay = 6000) {
  const [pending, setPending] = useState<string[]>([]);
  const timers = useRef(new Map<string, number>());
  const commitRef = useRef(commit);
  useEffect(() => { commitRef.current = commit; }, [commit]);

  const hide = useCallback((id: string) => {
    if (timers.current.has(id)) return;
    setPending((p) => [...p, id]);
    timers.current.set(id, window.setTimeout(() => {
      timers.current.delete(id);
      commitRef.current(id);
      setPending((p) => p.filter((x) => x !== id));
    }, delay));
  }, [delay]);

  const undo = useCallback((id: string) => {
    const h = timers.current.get(id);
    if (h !== undefined) window.clearTimeout(h);
    timers.current.delete(id);
    setPending((p) => p.filter((x) => x !== id));
  }, []);

  useEffect(() => {
    const map = timers.current;
    const flush = () => {
      map.forEach((h, id) => { window.clearTimeout(h); commitRef.current(id); });
      map.clear();
    };
    window.addEventListener('pagehide', flush);
    return () => { window.removeEventListener('pagehide', flush); flush(); };
  }, []);

  return { pending, hide, undo };
}
