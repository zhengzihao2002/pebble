'use client';

import { useEffect, useRef, type PointerEvent, type RefObject } from 'react';

/**
 * Tap behaviour for the page's mark popovers (statement dots, mix segments,
 * calendar days). A mouse shows a popover on hover and a click keeps it; a
 * tap toggles it, and a tap anywhere outside `root` clears it - iOS Safari
 * neither focuses a tapped button nor fires mouseleave, so blur and leave
 * alone left a popover open until another mark was tapped.
 *
 * The toggle reads the state from pointerdown, before Android's tap focus
 * (which also opens the popover) runs, so a tap on an open mark closes it.
 */
export function useTapPopover<K>(root: RefObject<HTMLElement | null>, active: K | null, setActive: (k: K | null) => void) {
  const tap = useRef<{ type: string; was: boolean }>({ type: 'mouse', was: false });

  useEffect(() => {
    if (active === null) return;
    const onDown = (e: globalThis.PointerEvent) => {
      const el = root.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) setActive(null);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [active, root, setActive]);

  return (k: K) => ({
    onPointerDown: (e: PointerEvent) => { tap.current = { type: e.pointerType, was: active === k }; },
    onClick: () => {
      const { type, was } = tap.current;
      // A keyboard Enter has no pointerdown: treat it like a mouse click.
      tap.current = { type: 'mouse', was: false };
      setActive(type === 'mouse' ? k : was ? null : k);
    },
  });
}

/** Hover handlers that ignore touch, whose emulated enter would race the tap toggle. */
export const mouseOnly = (fn: () => void) => (e: PointerEvent) => { if (e.pointerType === 'mouse') fn(); };
