'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from '@/lib/i18n/useTranslation';

/** The undo window. Nothing is sent to the server before it ends. */
const UNDO_MS = 5000;
/** How long "Deleted" stays before the bar leaves. */
const DONE_MS = 1600;

/** Sends the delete. Resolves to null on success, or the message to show. */
type Run = () => Promise<string | null>;

interface Item {
  id: number;
  phase: 'pending' | 'sending' | 'done' | 'failed';
  run: Run;
  message?: string;
}

interface UndoDeleteApi {
  scheduleDelete: (job: { run: Run }) => void;
}

const UndoDeleteContext = createContext<UndoDeleteApi | null>(null);

/**
 * Outside the provider a delete simply runs at once - today's behaviour -
 * rather than throwing.
 */
export function useUndoDelete(): UndoDeleteApi {
  return useContext(UndoDeleteContext) ?? { scheduleDelete: (job) => { void job.run(); } };
}

/**
 * Delayed delete with a 5-second undo, mounted once in AppShell so a pending
 * delete survives the dialog closing and moves between pages with you.
 *
 * NOTHING is deleted until the window ends: the row and every total stay
 * exactly as they are, and the action's own revalidate refreshes the page
 * once the delete has landed. Undo just cancels the timer. A tab closed
 * inside the window never sends the delete - the safe direction.
 *
 * Each delete has its own bar and timer, so two in a row neither rush each
 * other nor hide a failure.
 */
export function UndoDeleteProvider({ children }: { children: ReactNode }) {
  const { d } = useTranslation();
  const [items, setItems] = useState<Item[]>([]);
  const timers = useRef(new Map<number, number>());
  const nextId = useRef(1);
  // The phone's bottom bar is fixed; the stack sits just above it. Measured,
  // not hard-coded, so its height and breakpoint live in one place (CSS).
  const [navHeight, setNavHeight] = useState(0);
  const hasItems = items.length > 0;

  const clearTimer = (id: number) => {
    const t = timers.current.get(id);
    if (t !== undefined) window.clearTimeout(t);
    timers.current.delete(id);
  };
  const update = (id: number, patch: Partial<Item>) =>
    setItems((list) => list.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const remove = (id: number) => {
    clearTimer(id);
    setItems((list) => list.filter((it) => it.id !== id));
  };

  const send = async (id: number, run: Run) => {
    clearTimer(id);
    update(id, { phase: 'sending', message: undefined });
    let message: string | null;
    try {
      message = await run();
    } catch {
      message = d.undoDelete.failed;
    }
    if (message === null) {
      update(id, { phase: 'done' });
      timers.current.set(id, window.setTimeout(() => remove(id), DONE_MS));
    } else {
      update(id, { phase: 'failed', message });
    }
  };

  const scheduleDelete = (job: { run: Run }) => {
    const id = nextId.current++;
    setItems((list) => [...list, { id, phase: 'pending', run: job.run }]);
    timers.current.set(id, window.setTimeout(() => { void send(id, job.run); }, UNDO_MS));
  };

  // Unmounting (signing out) drops anything still pending: it is never sent.
  useEffect(() => {
    const map = timers.current;
    return () => { map.forEach((t) => window.clearTimeout(t)); map.clear(); };
  }, []);

  useEffect(() => {
    if (!hasItems) return;
    const measure = () => {
      const nav = document.querySelector('.pebble-bottom-nav');
      setNavHeight(nav instanceof HTMLElement ? nav.getBoundingClientRect().height : 0);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [hasItems]);

  return (
    <UndoDeleteContext.Provider value={{ scheduleDelete }}>
      {children}
      {hasItems && (
        <div
          className="pb-undo-stack"
          role="status"
          aria-live="polite"
          style={{ bottom: navHeight > 0 ? `${navHeight + 12}px` : 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' }}
        >
          {items.map((it) => (
            <div key={it.id} className="pb-undo-bar goal-step">
              {it.phase === 'pending' && (
                <>
                  <span style={{ flex: 1, minWidth: 0 }}>{d.undoDelete.pending}</span>
                  {/* Countdown: the arc unwinds 360 to 0 and the centre counts 5 to 0,
                      both CSS animations started with this bar - the same moment as
                      the delete timer - so neither can drift from the real delete. */}
                  <span className="pb-undo-ring" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="34" height="34">
                      <circle className="pb-undo-ring-track" cx="12" cy="12" r="10" />
                      <circle className="pb-undo-ring-arc" cx="12" cy="12" r="10" pathLength="100" />
                    </svg>
                    <span className="pb-undo-count" />
                  </span>
                  <button type="button" onClick={() => remove(it.id)}>{d.undoDelete.undo}</button>
                </>
              )}
              {it.phase === 'sending' && <span style={{ flex: 1, minWidth: 0 }}>{d.undoDelete.sending}</span>}
              {it.phase === 'done' && <span style={{ flex: 1, minWidth: 0 }}>{d.undoDelete.done}</span>}
              {it.phase === 'failed' && (
                <>
                  <span style={{ flex: 1, minWidth: 0 }}>{it.message ?? d.undoDelete.failed}</span>
                  <button type="button" onClick={() => { void send(it.id, it.run); }}>{d.undoDelete.retry}</button>
                  <button type="button" onClick={() => remove(it.id)}>{d.undoDelete.dismiss}</button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </UndoDeleteContext.Provider>
  );
}
