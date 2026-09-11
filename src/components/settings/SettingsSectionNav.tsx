'use client';

import { useEffect, useRef, useState } from 'react';

export interface SettingsNavItem {
  id: string;
  title: string;
}

interface SettingsSectionNavProps {
  items: SettingsNavItem[];
  label: string;
}

// Upper bound on how long a click holds the highlight while the page scrolls.
// Normally released earlier by scrollend.
const CLICK_LOCK_FALLBACK_MS = 1200;

/**
 * Jump list for the Settings sections, shown beside the column on wide
 * screens (CSS decides when - see .settings-nav in globals.css).
 *
 * Buttons, not links: there are no URLs. A hash link would push a history
 * entry per click, so Back would walk through sections instead of leaving.
 *
 * .pebble-root is the scroll container (html and body are fixed and never
 * scroll), so both observers use it as their root. Without an explicit root
 * they would watch the viewport and never report anything useful.
 *
 * Highlighting is visual only. Clicking scrolls correctly whatever the
 * observers do.
 */
export function SettingsSectionNav({ items, label }: SettingsSectionNavProps) {
  // Static initial value; the observers correct it after mount.
  const [activeId, setActiveId] = useState(items[0]?.id ?? '');
  // While a click-initiated scroll is running, the observers would walk the
  // highlight through every section passed on the way. Held until it ends.
  const lockedRef = useRef(false);
  const releaseRef = useRef<(() => void) | null>(null);

  // A string, so a new items array with the same ids does not rebuild the
  // observers on every render.
  const idsKey = items.map((i) => i.id).join('|');

  useEffect(() => {
    const ids = idsKey ? idsKey.split('|') : [];
    const root = document.querySelector('.pebble-root');
    const els = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (!root || els.length === 0 || typeof IntersectionObserver === 'undefined') return;

    const last = els[els.length - 1];
    const inBand = new Set<string>();
    let atBottom = false;

    const recompute = () => {
      if (lockedRef.current) return;
      if (atBottom) { setActiveId(last.id); return; }
      // First in PAGE order, not first to arrive, so the result never depends
      // on the order the browser happens to deliver entries in. Nothing in
      // the band (between two sections) keeps the previous highlight.
      const first = ids.find((id) => inBand.has(id));
      if (first) setActiveId(first);
    };

    // A thin band near the top of the scroller: whichever section crosses it
    // is the one being read.
    const band = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) inBand.add(e.target.id);
        else inBand.delete(e.target.id);
      }
      recompute();
    }, { root, rootMargin: '-20% 0px -70% 0px' });

    // A short last section may never reach the band, so it could never
    // highlight. Once it is fully visible on a page that has been scrolled,
    // the reader is at the bottom and it wins.
    const bottom = new IntersectionObserver((entries) => {
      for (const e of entries) {
        atBottom = e.intersectionRatio > 0.98
          && root.scrollHeight > root.clientHeight + 1
          && root.scrollTop > 0;
      }
      recompute();
    }, { root, threshold: [0, 0.99, 1] });

    els.forEach((el) => band.observe(el));
    bottom.observe(last);
    return () => {
      band.disconnect();
      bottom.disconnect();
      releaseRef.current?.();
    };
  }, [idsKey]);

  const handleClick = (id: string) => {
    const target = document.getElementById(id);
    if (!target) return;
    const root = document.querySelector('.pebble-root');

    releaseRef.current?.();
    lockedRef.current = true;
    setActiveId(id);

    let timer = 0;
    const release = () => {
      lockedRef.current = false;
      window.clearTimeout(timer);
      root?.removeEventListener('scrollend', release);
      releaseRef.current = null;
    };
    releaseRef.current = release;
    root?.addEventListener('scrollend', release);
    // Also covers a click on the section already in place, where no scroll
    // happens and scrollend never fires.
    timer = window.setTimeout(release, CLICK_LOCK_FALLBACK_MS);

    // Read at click time, never during render: matchMedia is client-only.
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };

  return (
    <nav className="settings-nav" aria-label={label}>
      <ul className="settings-nav-list">
        {items.map((item) => {
          const active = item.id === activeId;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => handleClick(item.id)}
                aria-current={active ? 'true' : undefined}
                className={`settings-nav-btn ${active ? 'active' : ''}`}
              >
                {item.title}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
