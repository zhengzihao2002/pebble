'use client';

import { createContext, startTransition, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { addTransactionAction, getAccountsAction, getCategoriesAction, type AddTransactionActionInput } from '@/lib/actions/pebble';
import { callAction } from '@/lib/actions/callAction';
import type { Account, CategoryItem } from '@/lib/data/mappers';
import { isServerReachable } from '@/lib/offline/connectivity';
import {
  clearOtherSnapshots, clearQueue, clearSnapshot, dequeue, enqueue, listQueue, loadSnapshot, saveSnapshot, subscribeQueueChanges,
  queueKey, type QueuedPayload, type QueuedTransaction, type ReferenceSnapshot,
} from '@/lib/offline/queueStore';
import { registerServiceWorker, serviceWorkerWanted, tellWorkerWho, warmServiceWorker } from '@/lib/offline/serviceWorker';
import { BUILD_ID } from '@/lib/offline/buildId';
import { PendingUploadsDialog } from './PendingUploadsDialog';

/**
 * Everything about working without a connection, in one provider mounted by
 * the (app) layout: the waiting queue, the "Waiting to upload" dialog and its
 * prompting rules, the upload run, the reference-data snapshot, and the
 * service worker's registration.
 *
 * The user id is passed in by the layout (resolved from the session on the
 * SERVER), not read from the auth client: the auth client needs the network,
 * and this must work with none. It also rides along in the cached page, so an
 * offline start knows whose queue to open.
 *
 * HYDRATION. Server and first client render agree: nothing waiting, online,
 * no dialog. Everything real arrives from effects.
 *
 * NO ROUTE CHANGES, NO RELOADS. A finished upload refreshes the page's data
 * through router.refresh() (skipped while offline); nothing here ever calls
 * location.reload(), which can freeze an installed app's web view when there
 * is no network.
 */

export type UploadStatus = 'waiting' | 'uploading' | 'done' | 'failed';
/**
 * `reason` is the server's own (English) sentence; `code` and `params` are what
 * the dialog translates it from (translateActionError). No code means a
 * refusal the dictionary has no wording for - the dialog says so generically.
 */
export interface ItemUpload { status: UploadStatus; reason?: string; code?: string; params?: Record<string, string | string[]>; }
export type RunBanner = 'sessionExpired' | 'connectionLost' | null;

export interface NewQueuedTransaction {
  clientId: string;
  kind: 'expense' | 'income';
  createdAt: number;
  payload: QueuedPayload;
  display: QueuedTransaction['display'];
}

export interface OfflineApi {
  userId: string | null;
  /** This user's waiting transactions, oldest first. */
  items: QueuedTransaction[];
  /** True once the queue has been read from the device. */
  ready: boolean;
  /** navigator.onLine === false. Only a hint that a connection is missing. */
  offline: boolean;
  uploads: Record<string, ItemUpload>;
  running: boolean;
  banner: RunBanner;
  /** Set when a run finishes; the dialog's summary. */
  result: { done: number; failed: number } | null;
  dialogOpen: boolean;
  openList: () => void;
  /** "Later" / Escape / backdrop: hides the dialog, keeps the badge. */
  closeList: () => void;
  uploadAll: () => void;
  uploadOne: (clientId: string) => void;
  removeItem: (clientId: string) => Promise<void>;
  /** Saves on the device. Resolves false if it could NOT be saved. */
  queueTransaction: (item: NewQueuedTransaction) => Promise<boolean>;
  readReference: () => Promise<ReferenceSnapshot | null>;
  rememberReference: (accounts: Account[], categories: CategoryItem[]) => void;
  /** Removes this user's waiting items and snapshot from the device. */
  discardAll: () => Promise<void>;
  /** In-app refresh of the page's data. False (and does nothing) offline. */
  refresh: () => boolean;
}

// Used when no provider is mounted (an auth page, a test harness): inert, so
// components that read it never need to guard.
const INERT: OfflineApi = {
  userId: null, items: [], ready: false, offline: false, uploads: {}, running: false, banner: null, result: null,
  dialogOpen: false,
  openList: () => {}, closeList: () => {}, uploadAll: () => {}, uploadOne: () => {},
  removeItem: async () => {},
  queueTransaction: async () => false,
  readReference: async () => null,
  rememberReference: () => {},
  discardAll: async () => {},
  refresh: () => false,
};

const OfflineContext = createContext<OfflineApi>(INERT);
export function useOfflineQueue(): OfflineApi { return useContext(OfflineContext); }

function subscribeOnline(onChange: () => void): () => void {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}
const readOffline = () => navigator.onLine === false;

// A fresh snapshot is not rewritten on every load: it is two small queries.
const SNAPSHOT_FRESH_MS = 10 * 60 * 1000;

interface OfflineProviderProps {
  userId: string;
  /** Pages the service worker should save so the whole app opens offline. */
  warmPaths?: string[];
  children: ReactNode;
}

export function OfflineProvider({ userId, warmPaths = DEFAULT_WARM_PATHS, children }: OfflineProviderProps) {
  const router = useRouter();
  const [items, setItems] = useState<QueuedTransaction[]>([]);
  const [ready, setReady] = useState(false);
  // A subscription, not state set from an effect: the server and the first
  // client render both say "online", then React switches to the real value.
  const offline = useSyncExternalStore(subscribeOnline, readOffline, () => false);
  const [uploads, setUploads] = useState<Record<string, ItemUpload>>({});
  const [running, setRunning] = useState(false);
  const [banner, setBanner] = useState<RunBanner>(null);
  const [result, setResult] = useState<{ done: number; failed: number } | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Latest values for handlers that outlive a render (events, the upload loop).
  const itemsRef = useRef(items);
  const runningRef = useRef(false);
  const dialogRef = useRef(false);
  const userRef = useRef(userId);
  // True once the dialog has been offered in this stretch of connectivity.
  // Reset by an offline/online change; "Later" simply leaves it set. That is
  // the whole "ask once, then respect Later" rule.
  const promptedRef = useRef(false);
  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => { dialogRef.current = dialogOpen; }, [dialogOpen]);
  useEffect(() => { userRef.current = userId; }, [userId]);

  const reload = useCallback(async () => {
    try {
      const rows = await listQueue(userRef.current);
      itemsRef.current = rows;
      setItems(rows);
    } catch {
      // IndexedDB unavailable: nothing is queued, and queueTransaction will
      // say so rather than pretend.
    }
    setReady(true);
  }, []);

  // ---- service worker ----------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const registration = await registerServiceWorker();
      if (cancelled || !registration || !serviceWorkerWanted()) return;
      // Who is signed in, so pages the worker saved for someone ELSE (an
      // expired session, another account signing in on this device without
      // passing the sign-in page) are dropped now, not at the next save.
      void tellWorkerWho(userId);
      // Give the page's own requests a moment to finish first; the warm-up is
      // low priority housekeeping.
      const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number };
      const idle = (cb: () => void) => (w.requestIdleCallback ? w.requestIdleCallback(cb, { timeout: 6000 }) : window.setTimeout(cb, 3000));
      idle(() => { if (!cancelled) void warmServiceWorker(warmPaths, userId, BUILD_ID); });
    })();
    return () => { cancelled = true; };
    // warmPaths is a constant list in practice; listing it would re-warm on identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- the prompt --------------------------------------------------------
  // Offers the upload dialog at most once per stretch of connectivity. The
  // reachability probe comes first: navigator.onLine is true on a Wi-Fi with
  // no internet, and a dialog whose Upload button then fails helps nobody.
  const maybePrompt = useCallback(async () => {
    const blocked = () => promptedRef.current || dialogRef.current || runningRef.current || itemsRef.current.length === 0;
    if (blocked()) return;
    if (!(await isServerReachable())) return;
    if (blocked()) return;
    promptedRef.current = true;
    setResult(null);
    setBanner(null);
    setDialogOpen(true);
  }, []);

  // ---- connectivity hint -------------------------------------------------
  useEffect(() => {
    const goOffline = () => { promptedRef.current = false; };
    const goOnline = () => { promptedRef.current = false; void maybePrompt(); };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, [maybePrompt]);

  // Startup (once the queue is read), and coming back to the app.
  useEffect(() => { if (ready) void maybePrompt(); }, [ready, maybePrompt]);
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') void maybePrompt(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [maybePrompt]);

  // ---- the queue ---------------------------------------------------------
  useEffect(() => {
    // Other people's saved account/category lists do not stay on a device
    // someone else is now using. Their waiting transactions DO stay (they are
    // kept for that account's next sign-in, never shown or sent for this one).
    void clearOtherSnapshots(userId).catch(() => {});
    void reload();
    return subscribeQueueChanges(() => { void reload(); });
  }, [userId, reload]);

  const queueTransaction = useCallback(async (item: NewQueuedTransaction): Promise<boolean> => {
    const record: QueuedTransaction = { ...item, key: queueKey(userRef.current, item.clientId), userId: userRef.current };
    try {
      await enqueue(record);
    } catch {
      return false;
    }
    // A new waiting item re-arms the prompt; it is offered at the next
    // connectivity change or return to the app, never over the form that was
    // just saved.
    promptedRef.current = false;
    await reload();
    return true;
  }, [reload]);

  const removeItem = useCallback(async (clientId: string) => {
    try { await dequeue(userRef.current, clientId); } catch { /* the list reload below shows the truth */ }
    setUploads((u) => { const next = { ...u }; delete next[clientId]; return next; });
    await reload();
  }, [reload]);

  // ---- reference data (so Add transaction works offline) ------------------
  const readReference = useCallback(async () => {
    try { return await loadSnapshot(userRef.current); } catch { return null; }
  }, []);

  const rememberReference = useCallback((accounts: Account[], categories: CategoryItem[]) => {
    void saveSnapshot({ userId: userRef.current, savedAt: Date.now(), accounts, categories }).catch(() => {});
  }, []);

  // On each online load: keep the snapshot fresh so the dialog is complete the
  // first time it is opened without a connection.
  useEffect(() => {
    if (!userId || navigator.onLine === false) return;
    let cancelled = false;
    void (async () => {
      const existing = await readReference();
      if (existing && Date.now() - existing.savedAt < SNAPSHOT_FRESH_MS) return;
      const [accounts, categories] = await Promise.all([callAction(getAccountsAction), callAction(getCategoriesAction)]);
      if (cancelled || !accounts.ok || !categories.ok) return;
      rememberReference(accounts.accounts, categories.categories);
    })();
    return () => { cancelled = true; };
  }, [userId, readReference, rememberReference]);

  // ---- safe refresh ------------------------------------------------------
  const refresh = useCallback((): boolean => {
    // Offline there is nothing new to fetch, and a failed refresh makes Next
    // fall back to a full navigation - exactly what must not happen to an
    // installed app with no network.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
    startTransition(() => router.refresh());
    return true;
  }, [router]);

  // ---- the upload run ----------------------------------------------------
  const setStatus = useCallback((clientId: string, state: ItemUpload) => {
    setUploads((u) => ({ ...u, [clientId]: state }));
  }, []);

  const runUploads = useCallback(async (wanted: QueuedTransaction[]) => {
    if (runningRef.current || wanted.length === 0) return;
    runningRef.current = true;
    setRunning(true);
    setBanner(null);
    setResult(null);
    let done = 0;
    let failed = 0;
    let stopped: RunBanner = null;

    for (const item of wanted) {
      setStatus(item.clientId, { status: 'uploading' });
      // The SAME client id every time: if an earlier attempt committed but its
      // answer was lost, the server recognises it and reports success instead
      // of inserting a second copy.
      const outcome = await callAction(() => addTransactionAction({ ...item.payload, clientId: item.clientId } as AddTransactionActionInput));
      if (outcome.ok) {
        done += 1;
        setStatus(item.clientId, { status: 'done' });
        // Only now, with the server's yes in hand, does the item leave the
        // device. If this delete fails the row is already safe on the server
        // and a later upload of it is a harmless no-op.
        try { await dequeue(userRef.current, item.clientId); } catch { /* idempotent on retry */ }
        continue;
      }
      if (outcome.kind === 'session') {
        stopped = 'sessionExpired';
        setStatus(item.clientId, { status: 'waiting' });
        break;
      }
      if (outcome.kind === 'network' || outcome.kind === 'auth') {
        // Not this item's fault: the connection (or the sign-in service) went
        // away. Stop; the rest are untouched and still queued.
        stopped = 'connectionLost';
        setStatus(item.clientId, { status: 'waiting' });
        break;
      }
      failed += 1;
      const refusal = outcome as { error: string; code?: string; params?: Record<string, string | string[]> };
      setStatus(item.clientId, { status: 'failed', reason: refusal.error, code: refusal.code, params: refusal.params });
    }

    runningRef.current = false;
    setRunning(false);
    setBanner(stopped);
    await reload();
    if (done > 0) {
      refresh();
      setResult({ done, failed });
    }
  }, [reload, refresh, setStatus]);

  const uploadAll = useCallback(() => {
    if (navigator.onLine === false) return;
    void runUploads(itemsRef.current);
  }, [runUploads]);

  const uploadOne = useCallback((clientId: string) => {
    if (navigator.onLine === false) return;
    const one = itemsRef.current.find((i) => i.clientId === clientId);
    if (one) void runUploads([one]);
  }, [runUploads]);

  const openList = useCallback(() => {
    setResult(null);
    setBanner(null);
    setDialogOpen(true);
  }, []);
  const closeList = useCallback(() => {
    setDialogOpen(false);
    // A closed dialog counts as "Later" for this stretch of connectivity.
    promptedRef.current = true;
    setUploads((u) => {
      // Finished rows are gone from the queue; forget their state.
      const kept: Record<string, ItemUpload> = {};
      for (const [id, s] of Object.entries(u)) if (s.status !== 'done') kept[id] = s;
      return kept;
    });
  }, []);

  const discardAll = useCallback(async () => {
    try { await clearQueue(userRef.current); } catch { /* nothing to discard */ }
    try { await clearSnapshot(userRef.current); } catch { /* nothing to discard */ }
    await reload();
  }, [reload]);

  // The dialog renders inside .pebble-root (every Pebble style is scoped
  // there); this provider sits above it, so it portals in once it is open.
  // dialogOpen is never true on the server or during hydration, so reading
  // the DOM here cannot cause a mismatch.
  const portalRoot = dialogOpen && typeof document !== 'undefined' ? document.querySelector('.pebble-root') : null;

  const api = useMemo<OfflineApi>(() => ({
    userId, items, ready, offline, uploads, running, banner, result, dialogOpen,
    openList, closeList, uploadAll, uploadOne, removeItem, queueTransaction, readReference, rememberReference, discardAll, refresh,
  }), [userId, items, ready, offline, uploads, running, banner, result, dialogOpen, openList, closeList, uploadAll, uploadOne, removeItem, queueTransaction, readReference, rememberReference, discardAll, refresh]);

  return (
    <OfflineContext.Provider value={api}>
      {children}
      {dialogOpen && portalRoot && createPortal(<PendingUploadsDialog />, portalRoot)}
    </OfflineContext.Provider>
  );
}

// The ten pages of the app (navItems.ts). Listed here rather than imported so
// this module does not pull the navigation icons into the layout bundle.
const DEFAULT_WARM_PATHS = [
  '/dashboard', '/accounts', '/transactions', '/reports', '/analysis',
  '/insights', '/budgets', '/goals', '/scheduled', '/settings',
];
