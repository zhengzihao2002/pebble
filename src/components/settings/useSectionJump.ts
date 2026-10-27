'use client';

import { flashSettingsTarget } from './flashSettingsTarget';
import { useCallback, useEffect, useRef, useState } from 'react';

// Upper bound on how long a click holds the highlight while the page scrolls.
// Normally released earlier by scrollend.
const CLICK_LOCK_FALLBACK_MS = 1200;
// How long the arrival pulse on a jumped-to row stays on (matches the CSS).
const FLASH_MS = 1900;

/**
 * Which Settings section is being read, and a jump to any of them. Moved out
 * of SettingsSectionNav unchanged so the wide-screen nav, the phone jump bar
 * and the overview chips share ONE set of observers and ONE click lock - two
 * copies could disagree about the active section mid-scroll.
 *
 * .pebble-root is the scroll container (html and body are fixed and never
 * scroll), so both observers use it as their root. Without an explicit root
 * they would watch the viewport and never report anything useful.
 *
 * Highlighting is visual only. Jumping scrolls correctly whatever the
 * observers do.
 */
export function useSectionJump(ids: string[]) {
  // Static initial value; the observers correct it after mount.
  const [activeId, setActiveId] = useState(ids[0] ?? '');
  // While a click-initiated scroll is running, the observers would walk the
  // highlight through every section passed on the way. Held until it ends.
  const lockedRef = useRef(false);
  const releaseRef = useRef<(() => void) | null>(null);
  const flashTimerRef = useRef(0);
  const clearFlashRef = useRef<(() => void) | null>(null);
  useEffect(() => () => { clearFlashRef.current?.(); window.clearTimeout(flashTimerRef.current); }, []);

  // A string, so a new ids array with the same ids does not rebuild the
  // observers on every render.
  const idsKey = ids.join('|');

  useEffect(() => {
    const list = idsKey ? idsKey.split('|') : [];
    const root = document.querySelector('.pebble-root');
    const els = list
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
      const first = list.find((id) => inBand.has(id));
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
      window.clearTimeout(flashTimerRef.current);
    };
  }, [idsKey]);

  // Scrolls `target` to the top of the scroller (its scroll-margin-top clears
  // the sticky chrome) and holds the section highlight on `highlightId` until
  // the scroll ends. Shared by the section jump and the row jump.
  const scrollToTarget = useCallback((target: HTMLElement, highlightId: string) => {
    const root = document.querySelector('.pebble-root');

    releaseRef.current?.();
    lockedRef.current = true;
    setActiveId(highlightId);

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
  }, []);

  const jump = useCallback((id: string) => {
    const target = document.getElementById(id);
    if (!target) return;
    scrollToTarget(target, id);
  }, [scrollToTarget]);

  // The overview chips: scroll to the EXACT row a chip summarises (not the
  // section that happens to contain it), make it unmistakable, and move
  // keyboard focus into it so a keyboard or screen-reader user arrives there
  // too. The row clears the sticky header and phone jump bar through its
  // scroll-margin-top (.pb-settings-target in settings.css).
  const jumpToRow = useCallback((rowId: string) => {
    const row = document.getElementById(rowId);
    if (!row) return;
    window.clearTimeout(flashTimerRef.current);
    clearFlashRef.current?.();
    clearFlashRef.current = flashSettingsTarget(row);
    scrollToTarget(row, row.closest('section')?.id ?? rowId);
    flashTimerRef.current = window.setTimeout(() => {
      clearFlashRef.current?.();
      clearFlashRef.current = null;
    }, FLASH_MS);

    // Focus AFTER the scroll has started, with preventScroll, so the browser
    // does not run a second (instant) scroll that cancels the smooth one. The
    // first control that Tab can reach: a radiogroup keeps only its checked
    // option in the tab order, which is the right place to land.
    const first = row.querySelector<HTMLElement>(
      'button:not([disabled]):not([tabindex="-1"]), input:not([disabled]):not([tabindex="-1"]), select:not([disabled]), a[href], [tabindex="0"]',
    );
    first?.focus({ preventScroll: true });
  }, [scrollToTarget]);

  return { activeId, jump, jumpToRow };
}
