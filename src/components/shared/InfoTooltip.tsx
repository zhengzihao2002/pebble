'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';

/**
 * Explains how a metric is calculated. Hover on desktop, tap on mobile,
 * keyboard-operable everywhere.
 *
 * PORTALS INTO .pebble-root, NEVER document.body. Every rule in globals.css is
 * scoped under .pebble-root - INCLUDING the theme custom properties - so a
 * panel portalled to body renders transparent and unstyled. A previous session
 * lost time to exactly this.
 *
 * Portalled because a tooltip inside a card is clipped by the card's overflow
 * and by any scroll container above it. React portals still bubble events
 * through the React tree, so containment logic keeps working.
 */

interface InfoTooltipProps {
  /** Accessible name for the trigger, e.g. 'How average monthly spend is calculated'. */
  label: string;
  children: React.ReactNode;
}

const WIDTH = 264;
const GAP = 8;
const EDGE = 8;

export function InfoTooltip({ label, children }: InfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [hoverCapable, setHoverCapable] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    setRoot(document.querySelector<HTMLElement>('.pebble-root'));
    // Mobile has no hover. Attaching hover handlers there would fight the
    // synthetic mouse events a tap produces, so they are only wired up on
    // pointers that can actually hover.
    setHoverCapable(window.matchMedia('(hover: hover)').matches);
  }, []);

  const reposition = useCallback(() => {
    const t = triggerRef.current;
    if (!t) return;
    const r = t.getBoundingClientRect();
    const h = panelRef.current?.offsetHeight ?? 0;

    let left = r.left + r.width / 2 - WIDTH / 2;
    left = Math.max(EDGE, Math.min(left, window.innerWidth - WIDTH - EDGE));

    // Flip above when there is not room below and there IS room above.
    const below = r.bottom + GAP;
    const flip = h > 0 && below + h > window.innerHeight - EDGE && r.top - GAP - h > EDGE;
    const top = flip ? r.top - GAP - h : below;

    // Guarded so the post-measure pass cannot loop.
    setPos((p) => (p && p.top === top && p.left === left ? p : { top, left }));
  }, []);

  // Two passes on purpose: the first places the panel so it can be measured,
  // the second corrects using its real height.
  useLayoutEffect(() => {
    if (open) reposition();
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    // capture: true because scroll does NOT bubble - without it a tooltip
    // detaches from its trigger the moment any ancestor scrolls.
    const onScroll = () => reposition();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown, true);
    };
  }, [open]);

  const hoverProps = hoverCapable
    ? { onMouseEnter: () => setOpen(true), onMouseLeave: () => setOpen(false) }
    : {};

  const panel = open && pos && (
    <div
      ref={panelRef}
      id={id}
      role="tooltip"
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        width: WIDTH,
        maxWidth: `calc(100vw - ${EDGE * 2}px)`,
        zIndex: 60,
        backgroundColor: 'var(--mist)',
        color: 'var(--ink)',
        border: '1px solid var(--line)',
        borderRadius: '0.7rem',
        boxShadow: 'var(--shadow)',
        padding: '0.7rem 0.8rem',
        fontSize: '0.76rem',
        lineHeight: 1.45,
      }}
    >
      {children}
    </div>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => setOpen((v) => !v)}
        onFocus={() => setOpen(true)}
        {...hoverProps}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'none',
          border: 'none',
          padding: 2,
          marginLeft: 4,
          color: 'var(--ink-soft)',
          verticalAlign: 'middle',
          lineHeight: 0,
        }}
      >
        <Info size={13} />
      </button>
      {/* Rendered in place if .pebble-root is somehow missing - clipping is a
          better failure than an invisible explanation. */}
      {root ? createPortal(panel, root) : panel}
    </>
  );
}
