'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

/**
 * Keeps what the reader is looking at in a scroll box still while rows are
 * added or removed above it (the If imported pane: ticking a row on the left
 * inserts it somewhere in the right card's list).
 *
 * The first row in view is the anchor. After every commit, and for `settleMs`
 * after it while rows grow or collapse, the box's scrollTop is corrected so
 * the anchor stays at the same height on screen. Done by hand, not left to
 * the browser's own scroll anchoring: Safari has none, and Chrome's gave up
 * when rows were re-created. The box sets overflow-anchor: none so the two
 * never both correct.
 *
 * At the very top nothing is pinned, so a row added there is seen arriving.
 * Rows carry data-row-key; `changeKey` changes whenever the list does.
 */
export function useScrollPin(boxRef: RefObject<HTMLElement | null>, changeKey: string, settleMs: number) {
  const anchor = useRef<{ key: string; offset: number } | null>(null);
  // The scrollTop this hook last set, so its own corrections are not taken
  // for the reader scrolling.
  const expected = useRef<number | null>(null);
  const frame = useRef(0);

  const capture = useCallback(() => {
    const box = boxRef.current;
    if (!box) return;
    if (box.scrollTop <= 0) { anchor.current = null; return; }
    const top = box.getBoundingClientRect().top;
    for (const el of box.querySelectorAll<HTMLElement>('[data-row-key]')) {
      const r = el.getBoundingClientRect();
      if (r.bottom > top + 1 && el.dataset.leaving !== 'true') {
        anchor.current = { key: el.dataset.rowKey as string, offset: r.top - top };
        return;
      }
    }
    anchor.current = null;
  }, [boxRef]);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const onScroll = () => {
      if (expected.current !== null && Math.abs(box.scrollTop - expected.current) <= 1) return;
      expected.current = null;
      capture();
    };
    capture();
    box.addEventListener('scroll', onScroll, { passive: true });
    return () => box.removeEventListener('scroll', onScroll);
  }, [boxRef, capture]);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box || !anchor.current) return;
    // Reads the anchor afresh each frame: if the reader scrolls meanwhile,
    // the scroll listener has taken a new one and the pin follows it rather
    // than pulling them back.
    const pin = () => {
      const held = anchor.current;
      if (!held) return;
      const el = box.querySelector<HTMLElement>(`[data-row-key="${CSS.escape(held.key)}"]`);
      if (!el) return;
      const drift = el.getBoundingClientRect().top - box.getBoundingClientRect().top - held.offset;
      if (Math.abs(drift) > 0.5) {
        box.scrollTop += drift;
        expected.current = box.scrollTop;
      }
    };
    pin();
    const until = performance.now() + settleMs;
    const loop = () => {
      pin();
      if (performance.now() < until) frame.current = requestAnimationFrame(loop);
      else capture();
    };
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame.current);
  }, [boxRef, changeKey, settleMs, capture]);
}
