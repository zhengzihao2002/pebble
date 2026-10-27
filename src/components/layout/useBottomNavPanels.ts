'use client';

import { useCallback, useEffect, useState, type RefObject } from 'react';

type Panel = 'add' | 'more';
type Panels = { shown: Panel | null; closing: Panel | null; next: Panel | null };

/** Keep the destination queued until the outgoing panel's actual CSS motion
 * finishes. Reading current state at completion makes rapid taps last-win. */
export function useBottomNavPanels(add: RefObject<HTMLDivElement | null>, more: RefObject<HTMLDivElement | null>) {
  const [panels, setPanels] = useState<Panels>({ shown: null, closing: null, next: null });
  const toggle = useCallback((panel: Panel) => {
    setPanels((p) => {
      if (p.closing) return { ...p, next: p.next === panel ? null : panel };
      if (!p.shown) return { shown: panel, closing: null, next: null };
      return { shown: null, closing: p.shown, next: p.shown === panel ? null : panel };
    });
  }, []);
  const close = useCallback(() => {
    setPanels((p) => ({ shown: null, closing: p.shown ?? p.closing, next: null }));
  }, []);

  useEffect(() => {
    const closing = panels.closing;
    if (!closing) return;
    let cancelled = false;
    const element = closing === 'add' ? add.current : more.current;
    // getAnimations flushes styles after the open class is removed. With
    // reduced motion (or a hidden nav) this resolves without an added delay.
    // The clip also delays visibility:hidden until the slide-out ends.
    // Wait for that transition too, not just the inner transform.
    const animations = [
      ...(element?.getAnimations() ?? []),
      ...(element?.parentElement?.getAnimations() ?? []),
    ];
    void Promise.all(animations.map((a) => a.finished.catch(() => undefined))).then(() => {
      if (!cancelled) setPanels((p) => p.closing === closing
        ? { shown: p.next, closing: null, next: null } : p);
    });
    return () => { cancelled = true; };
  }, [panels.closing, add, more]);

  return { open: panels.shown === 'more', addOpen: panels.shown === 'add', engaged: panels.shown !== null || panels.closing !== null, toggle, close };
}
