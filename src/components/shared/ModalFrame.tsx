'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

/**
 * The one frame every Pebble dialog sits in: themed backdrop, the card, and
 * the behaviour all of them share - Escape, backdrop click, focus in on open
 * and back to the trigger on close, the enter and exit motion, and a smooth
 * change of size when the content changes.
 *
 * Renders in place, never through a document.body portal: every Pebble style
 * is scoped under .pebble-root, and the modals already mount inside it
 * (AppShell), so a body portal would render unstyled.
 *
 * LAYOUT. The card is capped at the screen's height. Put the part that may
 * run long in <div className="pb-modal-body">: it scrolls inside the card
 * while the header stays in view.
 *
 * EXIT BEFORE UNMOUNT. Parents unmount a modal the moment their onClose runs,
 * which would cut the exit animation. So children receive close() instead:
 * it plays the exit, THEN calls onClose. A timer, not animationend, so a
 * reduced-motion setting (no animation, no event) cannot leave it stuck.
 *
 * BUSY. While a write is in flight nothing may close the dialog - the write
 * continues regardless, and closing would read as success for something
 * still unresolved (see AddTransactionModal). busy blocks Escape, backdrop
 * and close() alike.
 */

const EXIT_MS = 160; // --pb-dur-exit
const RESIZE_MS = 260;
const RESIZE_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'; // --pb-ease-out
// Smaller changes (a textarea being dragged, a one-line hint) follow at once.
const RESIZE_MIN_PX = 24;

// Open frames, innermost last: Escape closes only the top one.
const openFrames: symbol[] = [];

// What Tab can land on inside a dialog. Filtered further at run time:
// disabled, hidden, inert and tabindex="-1" elements are skipped.
const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex], [contenteditable="true"]';

interface ModalFrameProps {
  onClose: () => void;
  busy?: boolean;
  /** id of the dialog's heading, for aria-labelledby. */
  labelledBy?: string;
  maxWidth?: number;
  zIndex?: number;
  cardStyle?: CSSProperties;
  children: (close: () => void) => ReactNode;
}

export function ModalFrame({ onClose, busy = false, labelledBy, maxWidth = 420, zIndex = 50, cardStyle, children }: ModalFrameProps) {
  const [closing, setClosing] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const pressOnBackdrop = useRef(false);

  // Refs, not props, inside close(): the page hands a new onClose on every
  // re-render, and close() must stay stable for the Escape listener.
  const onCloseRef = useRef(onClose);
  const busyRef = useRef(busy);
  useEffect(() => { onCloseRef.current = onClose; busyRef.current = busy; });

  const close = useCallback(() => {
    if (busyRef.current || closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    timerRef.current = window.setTimeout(() => onCloseRef.current(), reduced ? 0 : EXIT_MS);
  }, []);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  // Focus into the dialog on open (the card itself, so a phone keyboard does
  // not pop up), and back to whatever opened it on close.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cardRef.current?.focus({ preventScroll: true });
    return () => {
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  // Smooth size changes. React has already laid the new content out when the
  // observer fires, before paint, so the card is animated from the height it
  // had to the height it now needs - it never jumps. One-off, not a loop,
  // and skipped under reduced motion.
  useEffect(() => {
    const card = cardRef.current;
    if (!card || typeof ResizeObserver === 'undefined') return;
    let last = card.offsetHeight;
    let running: Animation | null = null;
    // The animation resizes the card on every frame, and the observer sees
    // those frames too. They are ignored while it runs: treating them as new
    // content restarted the animation from a half-way height, which made the
    // card bounce big-small-big. If the content changed meanwhile, the
    // observer fires once more when it ends, and that one change animates.
    const observer = new ResizeObserver(() => {
      if (running?.playState === 'running') return;
      const next = card.offsetHeight;
      const prev = last;
      last = next;
      if (Math.abs(next - prev) < RESIZE_MIN_PX) return;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      // Marked while it runs, so the scroll area does not flash a
      // scrollbar as the card catches up with its content (globals.css).
      card.classList.add('pb-resizing');
      running = card.animate(
        [{ height: `${prev}px` }, { height: `${next}px` }],
        { duration: RESIZE_MS, easing: RESIZE_EASE },
      );
      running.onfinish = () => card.classList.remove('pb-resizing');
    });
    observer.observe(card);
    return () => { observer.disconnect(); running?.cancel(); };
  }, []);

  // Phones: the on-screen keyboard shrinks the visual viewport but not dvh, so
  // a pinned submit button would sit behind it. The overlay's height and top
  // follow the visual viewport instead (CSS variables read in globals.css).
  // Skipped while pinch-zoomed, when the visual viewport is smaller on purpose.
  // Event listeners only: no timers, no requests.
  useEffect(() => {
    const vv = window.visualViewport;
    const overlay = cardRef.current?.parentElement;
    if (!vv || !overlay) return;
    const sync = () => {
      if (Math.abs(vv.scale - 1) > 0.01) return;
      overlay.style.setProperty('--pb-vvh', `${vv.height}px`);
      overlay.style.setProperty('--pb-vvt', `${vv.offsetTop}px`);
    };
    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
    };
  }, []);

  useEffect(() => {
    const id = Symbol('modal');
    openFrames.push(id);
    // Focus trap: Tab and Shift+Tab wrap inside the topmost frame. Focus in
    // a dropdown list that portals outside the card is left alone; focus
    // that fell to <body> (a button that disabled itself) is brought back.
    const trapTab = (e: KeyboardEvent) => {
      const card = cardRef.current;
      if (!card) return;
      const active = document.activeElement;
      const inside = active instanceof Node && card.contains(active);
      if (!inside && active && active !== document.body) return;
      const items = Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) =>
        el !== card
        && !el.hasAttribute('disabled')
        && el.getAttribute('tabindex') !== '-1'
        && el.getAttribute('aria-hidden') !== 'true'
        && !el.closest('[inert]')
        && el.getClientRects().length > 0,
      );
      if (items.length === 0) { e.preventDefault(); card.focus({ preventScroll: true }); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (!inside) { e.preventDefault(); (e.shiftKey ? last : first).focus(); return; }
      if (e.shiftKey && (active === first || active === card)) { e.preventDefault(); last.focus(); return; }
      if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Tab' && !e.defaultPrevented) {
        if (openFrames[openFrames.length - 1] === id) trapTab(e);
        return;
      }
      if (e.key !== 'Escape' || e.isComposing || e.defaultPrevented) return;
      if (openFrames[openFrames.length - 1] !== id) return;
      // An open dropdown inside the dialog gets Escape first.
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (target?.closest('[aria-expanded="true"]')) return;
      e.preventDefault();
      close();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const i = openFrames.indexOf(id);
      if (i >= 0) openFrames.splice(i, 1);
    };
  }, [close]);

  return (
    <div
      className={`pb-modal-overlay${closing ? ' closing' : ''}`}
      style={{ zIndex }}
      // Closes only when the press STARTED on the backdrop, so dragging a
      // text selection out of a field never dismisses the form.
      onPointerDown={(e) => { pressOnBackdrop.current = e.target === e.currentTarget; }}
      onClick={(e) => {
        if (e.target === e.currentTarget && pressOnBackdrop.current) close();
        pressOnBackdrop.current = false;
      }}
    >
      <div
        ref={cardRef}
        className="card pb-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        style={{ maxWidth, ...cardStyle }}
      >
        {children(close)}
      </div>
    </div>
  );
}
