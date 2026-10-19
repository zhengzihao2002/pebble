'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '@/lib/i18n/useTranslation';

export interface JumpItem {
  id: string;
  label: string;
  /** A count beside the label (notes needing attention). */
  count?: number;
}

/**
 * NEW: a sticky row of chips under the glass header that jumps to each
 * section and lights the one in view - the page is long on a phone. It
 * publishes its own height as --pb-ins-bar-h on the page wrapper, so the
 * sections scroll to just below it and the desktop rail sticks under it.
 * Scrolls sideways when the chips do not fit (never along the bottom edge).
 */
export function JumpBar({ items }: { items: JumpItem[] }) {
  const { d } = useTranslation();
  const ref = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<string | null>(null);
  const key = items.map((i) => i.id).join('|');

  useEffect(() => {
    const el = ref.current;
    const host = el?.closest<HTMLElement>('.pb-ins');
    if (!el || !host) return;
    const publish = () => host.style.setProperty('--pb-ins-bar-h', `${el.offsetHeight}px`);
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The section nearest the top of the reading area is the lit one.
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const ids = key.split('|');
    const els = ids.map((id) => document.getElementById(id)).filter((e): e is HTMLElement => e !== null);
    const seen = new Map<string, boolean>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) seen.set(e.target.id, e.isIntersecting);
      // Of the sections crossing the reading band, the one that starts
      // lowest is the one just scrolled to - so the sticky desktop rail,
      // which always crosses the band, does not keep the first chip lit.
      let best: string | null = null;
      let bestTop = -Infinity;
      for (const id of ids) {
        if (!seen.get(id)) continue;
        const top = document.getElementById(id)?.getBoundingClientRect().top ?? -Infinity;
        if (top > bestTop) { bestTop = top; best = id; }
      }
      if (best) setActive(best);
    }, { rootMargin: '-25% 0px -60% 0px' });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [key]);

  // Keep the lit chip in view when the row scrolls sideways.
  useEffect(() => {
    const track = trackRef.current;
    const on = track?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!track || !on) return;
    const left = on.offsetLeft - track.clientWidth / 2 + on.offsetWidth / 2;
    track.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
  }, [active]);

  const jump = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    setActive(id);
  };

  return (
    <nav ref={ref} className="pb-ins-bar" aria-label={d.ux.insights.jumpTo}>
      <div ref={trackRef} className="pb-ins-bar-track">
        {items.map((i) => (
          <button
            key={i.id} type="button" className="pb-ins-chip"
            aria-current={active === i.id ? 'true' : undefined}
            onClick={() => jump(i.id)}
          >
            {i.label}
            {i.count !== undefined && i.count > 0 && <span className="pb-ins-chip-count pb-tnum">{i.count}</span>}
          </button>
        ))}
      </div>
    </nav>
  );
}
