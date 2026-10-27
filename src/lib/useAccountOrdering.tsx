'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Account } from '@/lib/data/mappers';
import { accountOrderGroup, manualAccountIds, orderAccounts } from './accountOrder';
import { usePebbleStore } from '@/store/usePebbleStore';
import { useTranslation } from '@/lib/i18n/useTranslation';

type Drag = { id: string; target: string | null; ghost: HTMLElement; x: number; y: number; pointerX: number; pointerY: number };

/** Reorder the real cards. The lifted copy follows the pointer; only release
 * changes the draft. Save is the only operation that persists that draft. */
export function useAccountOrdering(accounts: Account[]) {
  const { d, t } = useTranslation();
  const saved = usePebbleStore((s) => s.manualAccountOrder);
  const setOrder = usePebbleStore((s) => s.setManualAccountOrder);
  const [draft, setDraft] = useState<string[] | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const drag = useRef<Drag | null>(null);
  const elements = useRef(new Map<string, HTMLElement>());
  const positions = useRef(new Map<string, { x: number; y: number }>());
  const frame = useRef(0);
  const displayed = draft ? orderAccounts(accounts, {}, 'manual', draft) : accounts;
  const stop = () => {
    cancelAnimationFrame(frame.current);
    drag.current?.ghost.remove();
    drag.current = null;
  };
  useEffect(() => () => { cancelAnimationFrame(frame.current); drag.current?.ghost.remove(); }, []);
  useLayoutEffect(() => {
    const next = new Map<string, { x: number; y: number }>();
    elements.current.forEach((el, id) => {
      const r = el.getBoundingClientRect(), old = positions.current.get(id);
      if (old && draft && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const x = old.x - r.left, y = old.y - r.top;
        if (x || y) el.animate([{ transform: `translate(${x}px, ${y}px)` }, { transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' });
      }
      next.set(id, { x: r.left, y: r.top });
    });
    positions.current = next;
  }, [draft]);
  const move = (from: string, to: string) => {
    const a = displayed.find((a) => a.id === from), b = displayed.find((a) => a.id === to);
    if (!a || !b || accountOrderGroup(a) !== accountOrderGroup(b) || a.id === b.id) return;
    const ids = displayed.map((a) => a.id), at = ids.indexOf(to);
    ids.splice(ids.indexOf(from), 1); ids.splice(at, 0, from);
    setDraft(ids);
  };
  const resetDrag = () => { stop(); setDragging(null); setTarget(null); };
  const editing = draft !== null;
  return {
    displayed, editing,
    begin: () => { resetDrag(); setDraft(manualAccountIds(saved).length ? manualAccountIds(saved) : accounts.map((a) => a.id)); },
    cancel: () => { resetDrag(); setDraft(null); },
    save: () => { resetDrag(); setOrder(displayed.map((a) => a.id)); setDraft(null); },
    wrap: (a: Account, children: ReactNode) => editing ? (
      <div key={a.id} ref={(el) => { if (el) elements.current.set(a.id, el); else elements.current.delete(a.id); }}
        className={`pb-reorder-card${dragging === a.id ? ' is-lifted' : ''}${target === a.id ? ' is-drop-target' : ''}`}
        data-account-id={a.id} role="button" tabIndex={0} aria-label={t(d.ux.accounts.dragAccount, { name: a.name })}
        onClickCapture={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          resetDrag();
          const el = e.currentTarget, r = el.getBoundingClientRect();
          const ghost = el.cloneNode(true) as HTMLElement;
          ghost.inert = true;
          ghost.removeAttribute('data-account-id'); ghost.removeAttribute('tabindex'); ghost.setAttribute('aria-hidden', 'true');
          ghost.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
          ghost.className = 'pb-reorder-ghost';
          Object.assign(ghost.style, { width: `${r.width}px`, height: `${r.height}px`, left: '0px', top: '0px', transform: `translate(${r.left}px, ${r.top}px)` });
          el.closest('.pebble-root')?.append(ghost);
          drag.current = { id: a.id, target: null, ghost, x: e.clientX - r.left, y: e.clientY - r.top, pointerX: e.clientX, pointerY: e.clientY };
          setDragging(a.id); el.setPointerCapture(e.pointerId);
          const tick = () => {
            const active = drag.current;
            if (!active) return;
            active.ghost.style.transform = `translate(${active.pointerX - active.x}px, ${active.pointerY - active.y}px) rotate(1deg)`;
            const hit = document.elementFromPoint(active.pointerX, active.pointerY)?.closest<HTMLElement>('[data-account-id]');
            const candidate = hit?.dataset.accountId;
            const account = displayed.find((item) => item.id === candidate);
            const valid = account && account.id !== a.id && accountOrderGroup(account) === accountOrderGroup(a) && elements.current.get(account.id) === hit ? account.id : null;
            active.target = valid; setTarget((old) => old === valid ? old : valid);
            const root = el.closest('.pebble-root');
            if (active.pointerY > innerHeight - 60) root?.scrollBy(0, 10);
            else if (active.pointerY < 60) root?.scrollBy(0, -10);
            frame.current = requestAnimationFrame(tick);
          };
          frame.current = requestAnimationFrame(tick);
        }}
        onPointerMove={(e) => { if (drag.current) { drag.current.pointerX = e.clientX; drag.current.pointerY = e.clientY; } }}
        onPointerUp={(e) => {
          const active = drag.current;
          const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-account-id]');
          const id = hit?.dataset.accountId;
          if (active && id && elements.current.get(id) === hit) move(active.id, id);
          resetDrag();
        }}
        onPointerCancel={resetDrag} onLostPointerCapture={resetDrag}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { resetDrag(); return; }
          if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
          e.preventDefault();
          const group = displayed.filter((item) => accountOrderGroup(item) === accountOrderGroup(a));
          const neighbor = group[group.findIndex((item) => item.id === a.id) + (e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 1)];
          if (neighbor) move(a.id, neighbor.id);
        }}>
        {children}
      </div>
    ) : children,
  };
}
