'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { getAccountsAction, getCategoriesAction, refreshQuietViewAction } from '@/lib/actions/pebble';
import { refreshQuietPartnerViewAction } from '@/lib/actions/partner';
import { callAuthorizedAction } from '@/lib/actions/callAction';
import { confirmQuietDatabase } from '@/lib/offline/confirmQuietDatabase';
import { BUILD_ID } from '@/lib/offline/buildId';
import release from '@/lib/releaseSnapshot.json';
import { isServerReachable, onlineServerSnapshot, readOffline, subscribeConnectivity } from '@/lib/offline/connectivity';
import { tellWorkerWho } from '@/lib/offline/serviceWorker';
import { saveSnapshot } from '@/lib/offline/queueStore';
import {
  QUIET_SYNC_PAGES, isQuietSyncDue, isQuietSyncLaunch, readQuietReloadSync, readQuietRestoreSignals, takeQuietNavigationMarker, quietWorkerCommand, readQuietPreference, subscribeQuietPreference, writeQuietPreference, type QuietWorkerStatus,
} from '@/lib/offline/quietSync';

type SaveKind = 'goal' | 'schedule' | 'transaction' | 'budget';

export interface QuietSyncApi {
  enabled: boolean;
  preferenceReady: boolean;
  status: 'paused' | 'syncing' | 'offline' | 'preparing';
  problem: 'unavailable' | 'incomplete' | null;
  lastSyncedAt: number | null;
  updateVersion: string | null;
  partnerExpiresAt?: number;
  partnerAccessVersion?: string | null;
  setEnabled(enabled: boolean): void;
  syncNow(): void;
  checkSnapshot(): Promise<void>;
  refreshAfterWrite(): void;
  refreshAfterSave(kind: SaveKind, options?: { refreshCurrent: boolean }): Promise<void>;
}

const QuietSyncContext = createContext<QuietSyncApi>({
  enabled: false, preferenceReady: true, status: 'paused', problem: null, lastSyncedAt: null, updateVersion: null,
  setEnabled() {}, syncNow() {}, async checkSnapshot() {}, refreshAfterWrite() {}, async refreshAfterSave() {},
});

export function useQuietSync() {
  return useContext(QuietSyncContext);
}

function activeRoute() {
  return location.pathname + location.search;
}

const savedView = { goal: '/goals', schedule: '/scheduled', transaction: '/transactions', budget: '/budgets' } as const;
const catchUpRetryDelay = 5 * 60 * 1000;
const scrollKeys = new Set(['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' ']);

function isSavedView(pathname: string, pair?: string) {
  if (pair) return pathname.startsWith('/partner/') && QUIET_SYNC_PAGES.includes(pathname.slice('/partner'.length));
  return QUIET_SYNC_PAGES.includes(pathname) || pathname === '/budgets/plan';
}

export function QuietSyncProvider({ userId, pair, children }: { userId: string; pair?: string; children: ReactNode }) {
  const [enabled, setEnabledState] = useState(false);
  const [preferenceReady, setPreferenceReady] = useState(false);
  const [snapshot, setSnapshot] = useState<{ at: number; version: string | null }>();
  const lastSyncedAt = snapshot?.at ?? null;
  const [partnerExpiresAt, setPartnerExpiresAt] = useState<number>();
  const [partnerAccessVersion, setPartnerAccessVersion] = useState<string | null>();
  const [syncing, setSyncing] = useState(false);
  const [saveSyncs, setSaveSyncs] = useState(0);
  const checkedLaunch = useRef(false);
  const nextCatchUpAttempt = useRef(0);
  const [preparing, setPreparing] = useState(false);
  const [writePending, setWritePending] = useState(false);
  const [problem, setProblem] = useState<QuietSyncApi['problem']>(null);
  const offline = useSyncExternalStore(subscribeConnectivity, readOffline, onlineServerSnapshot);
  const busy = useRef(false);
  const reconciliation = useRef(0);

  const showPreference = useCallback(() => {
    const preference = readQuietPreference(userId);
    setEnabledState(preference.enabled);
    setPreferenceReady(true);
  }, [userId]);

  const receiveStatus = useCallback((state: QuietWorkerStatus | null) => {
    if (state?.authExpired) {
      location.replace('/auth/sign-in');
      return false;
    }
    if (!state) {
      setProblem('unavailable');
      return false;
    }
    const syncedAt = state.lastSyncedAt;
    if (syncedAt != null) {
      setSnapshot(previous => {
        const version = state.version ?? (previous?.at === syncedAt ? previous.version : null);
        if (previous && (previous.at > syncedAt || previous.at === syncedAt && previous.version === version)) return previous;
        return { at: syncedAt, version };
      });
    }
    if (state.expiresAt !== undefined) setPartnerExpiresAt(state.expiresAt);
    if (state.accessVersion !== undefined) setPartnerAccessVersion(state.accessVersion);
    return state.ok;
  }, []);

  const checkSnapshot = useCallback(async () => {
    if (!readQuietPreference(userId).enabled) return;
    const state = await quietWorkerCommand({ type: 'QUIET_STATUS', user: userId, onDemand: true, pair });
    if (state && readQuietPreference(userId).enabled) receiveStatus(state);
  }, [pair, receiveStatus, userId]);

  const reconcile = useCallback(async () => {
    if (busy.current) return;
    const id = ++reconciliation.current;
    showPreference();
    const preference = readQuietPreference(userId);
    const isCurrent = () => {
      const current = readQuietPreference(userId);
      return id === reconciliation.current && !busy.current && current.enabled === preference.enabled;
    };
    if (preference.enabled) {
      const state = await quietWorkerCommand({ type: 'QUIET_STATUS', user: userId, onDemand: true, pair });
      if (!isCurrent()) return;
      if (pair) {
        if (receiveStatus(state)) setProblem(previous => previous === 'unavailable' ? null : previous);
      } else if (state?.enabled && !state.liveUntil) {
        receiveStatus(state);
        setProblem(previous => previous === 'unavailable' ? null : previous);
      } else if (state) {
        await tellWorkerWho(userId);
        if (!isCurrent()) return;
        const policy = await quietWorkerCommand({ type: 'QUIET_POLICY', user: userId, enabled: true, liveUntil: 0 });
        if (!isCurrent()) return;
        if (!receiveStatus(policy)) setProblem('unavailable');
        else setProblem(null);
      } else setProblem('unavailable');
    }
  }, [pair, receiveStatus, showPreference, userId]);

  useEffect(() => {
    void reconcile();
    const controllers = navigator.serviceWorker;
    const onController = () => { void (busy.current ? checkSnapshot() : reconcile()); };
    const onVisible = () => { if (!document.hidden) void reconcile(); };
    const onSnapshot = (event: MessageEvent) => {
      const expected = pair ? 'QUIET_PARTNER_CACHE_CHANGED' : 'QUIET_CACHE_CHANGED';
      if (event.data?.type === expected && event.data.user === userId) void checkSnapshot();
    };
    controllers?.addEventListener('controllerchange', onController);
    controllers?.addEventListener('message', onSnapshot);
    document.addEventListener('visibilitychange', onVisible);
    const stop = subscribeQuietPreference(showPreference);
    return () => {
      reconciliation.current += 1;
      stop();
      document.removeEventListener('visibilitychange', onVisible);
      controllers?.removeEventListener('controllerchange', onController);
      controllers?.removeEventListener('message', onSnapshot);
    };
  }, [checkSnapshot, pair, reconcile, showPreference, userId]);

  const refreshReference = useCallback(() => {
    // Quiet Sync and the offline transaction form share this reference snapshot.
    return Promise.all([
      callAuthorizedAction(getAccountsAction), callAuthorizedAction(getCategoriesAction),
    ]).then(([accounts, categories]) =>
      accounts.ok && categories.ok
        ? saveSnapshot({ userId, accounts: accounts.accounts, categories: categories.categories, savedAt: Date.now() }).catch(() => {})
        : undefined,
    );
  }, [userId]);

  const download = useCallback(async ({ refreshView = false, afterWrite = false } = {}) => {
    if (!(await isServerReachable())) return false;
    if (!pair) await tellWorkerWho(userId);
    const onSavedView = isSavedView(location.pathname, pair);
    const required = [...new Set([...(onSavedView ? [activeRoute()] : []), ...QUIET_SYNC_PAGES])];
    const [{ result, downloaded }, viewResult] = await Promise.all([
      quietWorkerCommand(pair ? { type: 'QUIET_PARTNER_REFRESH', user: userId, pair }
        : { type: 'QUIET_REFRESH', user: userId, pages: required, required, build: BUILD_ID, afterWrite })
        .then(result => ({ result, downloaded: receiveStatus(result) })),
      refreshView && onSavedView ? (pair ? callAuthorizedAction(refreshQuietPartnerViewAction) : callAuthorizedAction(refreshQuietViewAction)) : undefined,
      pair ? undefined : refreshReference(),
    ]);
    // A new deployment can replace the saved pages even when the currently
    // running build cannot apply its server action response in place.
    const newerBuildSaved = result?.build && result.build !== BUILD_ID;
    if (downloaded && (viewResult?.ok !== false || newerBuildSaved)) return true;
    if (result && !result.authExpired) setProblem('incomplete');
    return false;
  }, [pair, receiveStatus, refreshReference, userId]);

  const sync = useCallback(async ({ afterWrite = false } = {}) => {
    if (busy.current) return;
    busy.current = true;
    setSyncing(true);
    setProblem(null);
    try {
      await download({ refreshView: true, afterWrite });
    } finally {
      setSyncing(false);
      busy.current = false;
      void checkSnapshot();
    }
  }, [checkSnapshot, download]);

  const setEnabled = useCallback(async (next: boolean) => {
    if (busy.current) return;
    busy.current = true;
    try {
      setProblem(null);
      if (next) {
        setPreparing(true);
        if (!await quietWorkerCommand({ type: 'QUIET_STATUS', user: userId, onDemand: true })) { setProblem('unavailable'); return; }
        await tellWorkerWho(userId);
        // An incomplete first snapshot leaves ordinary navigation available.
        if (!await download()) return;
      }
      const state = await quietWorkerCommand({ type: 'QUIET_POLICY', user: userId, enabled: next, liveUntil: 0 });
      if (!receiveStatus(state)) { setProblem('unavailable'); return; }
      if (!writeQuietPreference(userId, { enabled: next })) {
        await quietWorkerCommand({ type: 'QUIET_POLICY', user: userId, enabled: false, liveUntil: 0 });
        setProblem('unavailable');
        return;
      }
      setProblem(null);
    } finally {
      setPreparing(false);
      busy.current = false;
    }
  }, [download, receiveStatus, userId]);

  useEffect(() => {
    if (!writePending || busy.current) return;
    setWritePending(false);
    if (enabled) void sync({ afterWrite: true });
  }, [enabled, preparing, sync, syncing, writePending]);

  useEffect(() => {
    if (checkedLaunch.current || !preferenceReady) return;
    checkedLaunch.current = true;
    const reload = enabled ? readQuietReloadSync(userId, pair) : undefined;
    if (reload) {
      busy.current = true;
      setSyncing(true);
      void reload.then(result => {
        if (!receiveStatus(result) && result && !result.authExpired) setProblem('incomplete');
      }).finally(() => {
        busy.current = false;
        setSyncing(false);
        void checkSnapshot();
      });
      return;
    }
    if (!takeQuietNavigationMarker(activeRoute()) && enabled && !readOffline() && isSavedView(location.pathname, pair) &&
        isQuietSyncLaunch(performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined,
          document.referrer, location.origin, readQuietRestoreSignals())) {
      void sync();
    }
  }, [checkSnapshot, enabled, pair, preferenceReady, receiveStatus, sync, userId]);

  const canCatchUp = enabled && !offline && !syncing && saveSyncs === 0;
  useEffect(() => {
    if (!canCatchUp || !isSavedView(location.pathname, pair)) return;
    let listening = true;
    const catchUp = async (event: Event) => {
      const now = Date.now();
      if (now < nextCatchUpAttempt.current || !isQuietSyncDue(lastSyncedAt, now) && !(pair && partnerExpiresAt !== undefined && partnerExpiresAt <= now)) return;
      if (!event.isTrusted || document.hidden || busy.current) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (event instanceof KeyboardEvent) {
        if (!scrollKeys.has(event.key) || event.altKey || event.ctrlKey || event.metaKey ||
            target.closest('button, a, input, textarea, select, [contenteditable], [role="dialog"], [role="tablist"]') ||
            (target !== document.body && !target.closest('main'))) return;
      } else if (!target.closest('main') || target.closest('[role="dialog"], nav')) return;

      // Only a scroll gesture can trigger this check. Ask the worker first so
      // a recent sync in another tab can satisfy it without a server request.
      nextCatchUpAttempt.current = now + catchUpRetryDelay;
      const state = await quietWorkerCommand({ type: 'QUIET_STATUS', user: userId, onDemand: true, pair });
      if (!listening || !state?.enabled || (!state.ok && !pair) || document.hidden || readOffline() || !readQuietPreference(userId).enabled) return;
      receiveStatus(state);
      if (isQuietSyncDue(state.lastSyncedAt, Date.now()) || (pair && (state.expiresAt ?? 0) <= Date.now())) await sync();
      else nextCatchUpAttempt.current = 0;
    };
    document.addEventListener('wheel', catchUp, { passive: true });
    document.addEventListener('touchmove', catchUp, { passive: true });
    document.addEventListener('keydown', catchUp);
    return () => {
      listening = false;
      document.removeEventListener('wheel', catchUp);
      document.removeEventListener('touchmove', catchUp);
      document.removeEventListener('keydown', catchUp);
    };
  }, [canCatchUp, lastSyncedAt, pair, partnerExpiresAt, receiveStatus, sync, userId]);

  const refreshAfterWrite = useCallback(() => {
    setWritePending(true);
  }, []);

  const refreshAfterSave = useCallback<QuietSyncApi['refreshAfterSave']>(async (kind, options) => {
    if (!readQuietPreference(userId).enabled) return;
    const route = activeRoute();
    const primary = savedView[kind];
    const pathname = location.pathname;
    const required = [...new Set([primary, ...QUIET_SYNC_PAGES])];
    const pages = [...new Set([
      ...required,
      ...(required.includes(pathname) || pathname === '/budgets/plan' ? [route] : []),
    ])];
    setSaveSyncs(count => count + 1);
    setProblem(null);
    await new Promise<void>(queued => {
      // Register the refresh before allowing another navigation. Only the
      // downloads and current-view action go to the server. Navigation stays local.
      const snapshot = quietWorkerCommand({ type: 'QUIET_REFRESH', user: userId, pages, required, build: BUILD_ID, afterWrite: true }, queued)
        .then(result => ({ result, downloaded: readQuietPreference(userId).enabled && receiveStatus(result) }));
      const view = options?.refreshCurrent !== false && !readOffline() && pages.includes(route)
        ? callAuthorizedAction(refreshQuietViewAction)
        : undefined;
      void Promise.all([
        snapshot,
        view,
        refreshReference(),
      ]).then(([{ result, downloaded }, viewResult]) => {
        queued();
        if (!readQuietPreference(userId).enabled) return;
        const newerBuildSaved = downloaded && result?.build && result.build !== BUILD_ID;
        if ((result && !result.authExpired && !downloaded) || (viewResult?.ok === false && !newerBuildSaved && activeRoute() === route)) {
          setProblem('incomplete');
        }
      }).catch(() => {
        queued();
        setProblem('incomplete');
      }).finally(() => setSaveSyncs(count => count - 1));
    });
  }, [receiveStatus, refreshReference, userId]);

  const status = offline ? 'offline' : preparing ? 'preparing' : syncing || saveSyncs ? 'syncing' : 'paused';
  const updateVersion = enabled && snapshot?.version && snapshot.version !== release.version ? snapshot.version : null;
  return (
    <QuietSyncContext.Provider value={{
      enabled: enabled || preparing, preferenceReady, status, problem, lastSyncedAt, updateVersion, partnerExpiresAt, partnerAccessVersion,
      setEnabled: next => {
        void confirmQuietDatabase(next ? 'enable' : 'disable').then(confirmed => { if (confirmed) void setEnabled(next); });
      },
      syncNow: () => { void confirmQuietDatabase().then(confirmed => { if (confirmed) void sync(); }); },
      checkSnapshot,
      refreshAfterWrite,
      refreshAfterSave,
    }}>
      {children}
    </QuietSyncContext.Provider>
  );
}
