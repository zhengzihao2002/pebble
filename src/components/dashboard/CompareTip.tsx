'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface CompareTipProps {
  /** The visible trigger content: the change chip and "vs {range}". */
  children: React.ReactNode;
  /** A hidden suffix to the trigger's visible text (which stays its name,
      so voice control can say what it sees). Words only, never an amount. */
  hint: string;
  /** The popover's content. Money inside it wears font-mono-tab. */
  panel: React.ReactNode;
  /** The trigger's class; the change chip's .pb-dash-cmp when omitted. */
  className?: string;
  /** On a touch screen, a tap inside the panel that is not on a figure
      closes it, so a control it covers is one tap away (the savings-rate
      panel opens over the tiles' change chips on a phone). A tap on a
      figure still only reveals it in privacy mode. Off by default. */
  closeOnPanelTap?: boolean;
}

const WIDTH = 232;
const GAP = 6;
const EDGE = 8;
/** Grace period for the pointer to cross from the chip into the panel. */
const LEAVE_MS = 150;

/**
 * A tile's change against the previous period, explained on demand: hover
 * (or keyboard focus) on a Mac, tap on a phone, shows the two figures being
 * compared. The savings-rate tile's figure and ring use it too, to say what
 * the ring shows. The custom popover rather than a native title: the figures are
 * money, which must blur in privacy mode, and a title cannot.
 *
 * Portals into .pebble-root (never body - the theme lives there) because the
 * stats grid clips its cells. Escape closes (and leaves focus where it was;
 * it stays shut until the pointer leaves or focus moves on, so a pointer still
 * over the chip does not reopen it). A tap or click outside closes. The panel
 * is hoverable (WCAG 1.4.13): the pointer may cross into it, and a tap inside
 * it keeps it open, so its blurred figures can be tapped to reveal in privacy
 * mode. The tap toggle reads the open state at pointerdown, before a phone's
 * tap-focus runs, so a second tap on an open trigger closes it.
 */
export function CompareTip({ children, hint, panel, className = 'pb-dash-cmp', closeOnPanelTap = false }: CompareTipProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const tap = useRef<{ type: string; was: boolean }>({ type: 'mouse', was: false });
  // The pointer type of the last press inside the panel (closeOnPanelTap).
  const panelTap = useRef('mouse');
  // Set by Escape: hover and focus may not reopen it until they end.
  const dismissed = useRef(false);
  const leaveTimer = useRef<number | null>(null);
  const id = useId();

  const cancelLeave = useCallback(() => {
    if (leaveTimer.current !== null) { window.clearTimeout(leaveTimer.current); leaveTimer.current = null; }
  }, []);
  const leaveSoon = useCallback(() => {
    cancelLeave();
    leaveTimer.current = window.setTimeout(() => { leaveTimer.current = null; setOpen(false); }, LEAVE_MS);
  }, [cancelLeave]);
  useEffect(() => cancelLeave, [cancelLeave]);

  const reposition = useCallback(() => {
    const t = triggerRef.current;
    if (!t) return;
    const r = t.getBoundingClientRect();
    const h = panelRef.current?.offsetHeight ?? 0;
    // Starts at the trigger's left edge (the chip), clamped to the viewport.
    const left = Math.max(EDGE, Math.min(r.left, window.innerWidth - WIDTH - EDGE));
    const below = r.bottom + GAP;
    const flip = h > 0 && below + h > window.innerHeight - EDGE && r.top - GAP - h > EDGE;
    const top = flip ? r.top - GAP - h : below;
    setPos((p) => (p && p.top === top && p.left === left ? p : { top, left }));
  }, []);

  // First pass places the panel so it can be measured; the second uses its height.
  useLayoutEffect(() => { if (open) reposition(); }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => reposition();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Only the open state: moving focus here would make it :focus-visible
      // and reopen it through onFocus. The panel never holds focus.
      cancelLeave();
      dismissed.current = true;
      setOpen(false);
    };
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown, true);
    };
  }, [open, reposition, cancelLeave]);

  // Looked up only once open - always after hydration, so never during the
  // server render or the first client render.
  const root = open ? document.querySelector<HTMLElement>('.pebble-root') : null;

  const box = open && (
    <div
      ref={panelRef} id={id} role="tooltip" className="pb-dash-cmp-tip"
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: WIDTH, maxWidth: `calc(100vw - ${EDGE * 2}px)` }}
      // A press inside keeps focus on the trigger, so it stays open; the
      // click still reaches AppShell's capture-phase privacy reveal.
      onMouseDown={(e) => e.preventDefault()}
      onPointerDown={closeOnPanelTap ? (e) => { panelTap.current = e.pointerType; } : undefined}
      onClick={closeOnPanelTap ? (e) => {
        const type = panelTap.current;
        panelTap.current = 'mouse';
        if (type !== 'mouse' && !(e.target as Element).closest?.('.font-mono-tab')) setOpen(false);
      } : undefined}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') cancelLeave(); }}
      onPointerLeave={(e) => { if (e.pointerType === 'mouse') leaveSoon(); }}
    >
      {panel}
    </div>
  );

  return (
    <>
      <button
        ref={triggerRef} type="button" className={className}
        aria-expanded={open} aria-describedby={open ? id : undefined}
        onPointerDown={(e) => { tap.current = { type: e.pointerType, was: open }; }}
        onPointerEnter={(e) => {
          if (e.pointerType !== 'mouse') return;
          cancelLeave();
          if (!dismissed.current) setOpen(true);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType !== 'mouse') return;
          dismissed.current = false;
          leaveSoon();
        }}
        // Keyboard focus opens it; a tap's focus does not (the click decides).
        onFocus={(e) => { if (!dismissed.current && e.currentTarget.matches(':focus-visible')) setOpen(true); }}
        onBlur={(e) => {
          if (panelRef.current?.contains(e.relatedTarget as Node | null)) return;
          dismissed.current = false;
          cancelLeave();
          setOpen(false);
        }}
        onClick={() => {
          dismissed.current = false;
          const { type, was } = tap.current;
          tap.current = { type: 'mouse', was: false };
          // A mouse click keeps it open (hover already opened it); a tap toggles.
          setOpen(type === 'mouse' ? true : !was);
        }}
      >
        {children}
        <span className="pb-dash-sr"> {hint}</span>
      </button>
      {root ? createPortal(box, root) : box}
    </>
  );
}
