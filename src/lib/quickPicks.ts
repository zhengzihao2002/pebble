import type { CategoryItem } from '@/lib/data/mappers';

/**
 * Add transaction's quick picks: the categories THIS user records most.
 *
 * Expenses only (income has no user categories). Entries saved by an earlier
 * build may still carry an `income` list; it is ignored.
 *
 * The server ranks them (getFrequentCategoriesAction, one grouped query); this
 * file keeps the answer on the device for a week so opening the dialog does
 * not hit the database. Stored per user id, so a second person on the same
 * browser never sees (or reuses) someone else's habits.
 *
 * Nothing here throws. Storage that is missing, full or blocked just means the
 * answer lives in the in-memory `memo` for this page session instead.
 */
export interface QuickPicks { computedAt: number; expense: string[] }

export const QUICK_PICKS_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const QUICK_PICKS_COUNT = 6;
export const QUICK_PICKS_MIN = 3;
const PREFIX = 'pebble-quickpicks:';

/** Newest answer seen this session, by user - also the no-storage fallback. */
const memo = new Map<string, QuickPicks>();
/** One refresh per user per page session, shared by every caller (success or not). */
const refreshes = new Map<string, Promise<QuickPicks | null>>();

const isNames = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

export function readQuickPicks(userId: string): QuickPicks | null {
  const held = memo.get(userId);
  if (held) return held;
  try {
    const raw = window.localStorage.getItem(PREFIX + userId);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<QuickPicks> | null;
    if (!v || typeof v.computedAt !== 'number' || !Number.isFinite(v.computedAt) || !isNames(v.expense)) return null;
    const found = { computedAt: v.computedAt, expense: v.expense };
    memo.set(userId, found);
    return found;
  } catch { return null; }
}

export function writeQuickPicks(userId: string, picks: QuickPicks): void {
  memo.set(userId, picks);
  try { window.localStorage.setItem(PREFIX + userId, JSON.stringify(picks)); } catch { /* memo only */ }
}

export function isQuickPicksStale(picks: QuickPicks | null, now = Date.now()): boolean {
  return !picks || now - picks.computedAt >= QUICK_PICKS_MAX_AGE_MS || picks.computedAt > now + 60_000;
}

/**
 * Runs `fetchPicks` at most once per user per page session and hands every
 * caller the same promise - so a remount (React strict mode, reopening while a
 * request is in flight) shares the answer instead of finding "already tried"
 * and falling back. Stores the result on success; resolves null on failure.
 */
export function refreshQuickPicks(userId: string, fetchPicks: () => Promise<{ expense: string[] } | null>): Promise<QuickPicks | null> {
  let run = refreshes.get(userId);
  if (!run) {
    run = fetchPicks().then((r) => {
      if (!r || !isNames(r.expense)) return null;
      const picks = { computedAt: Date.now(), expense: r.expense };
      writeQuickPicks(userId, picks);
      return picks;
    }, () => null);
    refreshes.set(userId, run);
  }
  return run;
}

/** Sign-out: every user's picks go with the other per-user caches. */
export function clearAllQuickPicks(): void {
  memo.clear();
  refreshes.clear();
  try {
    const ls = window.localStorage;
    // Collect first: removing while walking by index would skip keys.
    const mine: string[] = [];
    for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (k && k.startsWith(PREFIX)) mine.push(k); }
    for (const k of mine) ls.removeItem(k);
  } catch { /* nothing stored we can reach */ }
}

/**
 * The tiles to show: cached names that still exist, in cached order, topped up
 * from sortOrder (a renamed/deleted pick leaves no hole). Always at least
 * QUICK_PICKS_MIN tiles - a user with only one or two used categories still
 * gets three - and the first six by sortOrder when there is no history.
 */
export function resolveQuickCategories(names: string[], categories: CategoryItem[]): CategoryItem[] {
  const bySort = [...categories].sort((a, b) => a.sortOrder - b.sortOrder);
  const byName = new Map(categories.map((c) => [c.name, c]));
  const target = names.length > 0 ? Math.max(QUICK_PICKS_MIN, Math.min(names.length, QUICK_PICKS_COUNT)) : QUICK_PICKS_COUNT;
  const out: CategoryItem[] = [];
  for (const n of names) {
    const c = byName.get(n);
    if (c && !out.includes(c)) out.push(c);
  }
  for (const c of bySort) {
    if (out.length >= target) break;
    if (!out.includes(c)) out.push(c);
  }
  return out.slice(0, target);
}
