'use client';

import { useEffect, useState } from 'react';

export interface ShownRow<T> {
  key: string;
  value: T;
  /** On its way out: still drawn (collapsing) for a moment, then dropped. */
  leaving: boolean;
}

interface Ghost<T> {
  key: string;
  value: T;
  /** The key of the row that was below it and is still shown, to keep its place. */
  before: string | null;
}

/**
 * A keyed list whose removed rows stay drawn for `ms` so they can collapse
 * instead of vanishing (the If imported pane: unticking a row on the left).
 * Only rows `canLeave` accepts linger; the rest go at once.
 *
 * `rows` must be memoised: it is compared by identity to notice a change
 * (the "adjust state while rendering" pattern, so the leaving row is in the
 * very same commit as the change and never blinks out for a frame).
 */
export function useLeavingRows<T>(rows: { key: string; value: T }[], canLeave: (value: T) => boolean, ms: number): ShownRow<T>[] {
  const [prev, setPrev] = useState(rows);
  const [ghosts, setGhosts] = useState<Ghost<T>[]>([]);

  if (prev !== rows) {
    const now = new Set(rows.map((r) => r.key));
    const gone: Ghost<T>[] = [];
    prev.forEach((r, i) => {
      if (now.has(r.key) || !canLeave(r.value)) return;
      let before: string | null = null;
      for (let j = i + 1; j < prev.length; j += 1) {
        if (now.has(prev[j].key)) { before = prev[j].key; break; }
      }
      gone.push({ key: r.key, value: r.value, before });
    });
    // A row ticked back in before its exit finished is simply shown again.
    const kept = ghosts.filter((g) => !now.has(g.key) && !gone.some((n) => n.key === g.key));
    if (gone.length > 0 || kept.length !== ghosts.length) setGhosts([...kept, ...gone]);
    setPrev(rows);
  }

  // Dropped once the collapse has played (at once under reduced motion,
  // where the global rule has already ended the animation).
  useEffect(() => {
    if (ghosts.length === 0) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const id = window.setTimeout(() => setGhosts([]), reduce ? 0 : ms);
    return () => window.clearTimeout(id);
  }, [ghosts, ms]);

  if (ghosts.length === 0) return rows.map((r) => ({ ...r, leaving: false }));
  const out: ShownRow<T>[] = rows.map((r) => ({ ...r, leaving: false }));
  for (const g of ghosts) {
    const at = g.before ? out.findIndex((r) => r.key === g.before) : -1;
    const row = { key: g.key, value: g.value, leaving: true };
    if (at === -1) out.push(row); else out.splice(at, 0, row);
  }
  return out;
}
