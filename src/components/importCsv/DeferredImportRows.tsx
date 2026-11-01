'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

const BATCH = 8;
const INTRO_MS = 450;

/** Keep a large CSV from mounting hundreds of editable/statement rows in one
 * blocking commit. All rows remain in the import model and selection
 * calculations; only offscreen DOM work is spread across idle periods. */
export function DeferredImportRows({ children, list = false }: { children: ReactNode[]; list?: boolean }) {
  const [limit, setLimit] = useState(BATCH);
  const tail = useRef<HTMLElement | null>(null);
  const openedAt = useRef(0);
  const more = limit < children.length;
  useEffect(() => {
    openedAt.current ||= performance.now();
    if (!more) return;
    const reveal = () => setLimit(value => value + BATCH);
    const target = tail.current;
    const idle = 'requestIdleCallback' in window;
    let observer: IntersectionObserver | null = null;
    let timer: number | undefined;
    // Keep offscreen DOM batches out of the initial, staggered row fade.
    const intro = window.setTimeout(() => {
      observer = target ? new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) reveal();
      }, { root: target.closest('.pb-modal-body'), rootMargin: '400px' }) : null;
      if (target) observer?.observe(target);
      timer = idle ? window.requestIdleCallback(reveal, { timeout: 120 }) : window.setTimeout(reveal, 16);
    }, Math.max(0, openedAt.current + INTRO_MS - performance.now()));
    return () => {
      window.clearTimeout(intro);
      observer?.disconnect();
      if (timer !== undefined) { if (idle) window.cancelIdleCallback(timer); else window.clearTimeout(timer); }
    };
  }, [limit, more]);
  const Tail = list ? 'li' : 'div';
  return <>{children.slice(0, limit)}{more && <Tail ref={(node: HTMLLIElement | HTMLDivElement | null) => { tail.current = node; }} aria-hidden="true" style={{ height: 1, listStyle: 'none' }} />}</>;
}
