'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { getAccountsAction, getCategoriesAction, refreshQuietViewAction } from '@/lib/actions/pebble';
import { callAction } from '@/lib/actions/callAction';
import { BUILD_ID } from '@/lib/offline/buildId';
import { isServerReachable, onlineServerSnapshot, readOffline, subscribeConnectivity } from '@/lib/offline/connectivity';
import { tellWorkerWho } from '@/lib/offline/serviceWorker';
import { saveSnapshot } from '@/lib/offline/queueStore';
import {
  QUIET_SYNC_PAGES, isQuietSyncLaunch, readQuietRestoreSignals, takeQuietNavigationMarker, quietWorkerCommand, readQuietPreference, subscribeQuietPreference, writeQuietPreference, type QuietWorkerStatus,
} from '@/lib/offline/quietSync';

type SaveKind = 'goal' | 'schedule' | 'transaction' | 'budget';

export interface QuietSyncApi {
  enabled: boolean;
  preferenceReady: boolean;
  status: 'paused' | 'syncing' | 'offline' | 'preparing';
  problem: 'unavailable' | 'incomplete' | null;
  lastSyncedAt: number | null;
  setEnabled(enabled: boolean): void;
  syncNow(): void;
  refreshAfterWrite(): void;
  refreshAfterSave(kind: SaveKind, options?: { refreshCurrent: boolean }): Promise<void>;
}

const QuietSyncContext = createContext<QuietSyncApi>({
  enabled: false, preferenceReady: true, status: 'paused', problem: null, lastSyncedAt: null,
  setEnabled() {}, syncNow() {}, refreshAfterWrite() {}, async refreshAfterSave() {},
});

export function useQuietSync() {
  return useContext(QuietSyncContext);
}

function activeRoute() {
  return location.pathname + location.search;
}

const savedView = { goal: '/goals', schedule: '/scheduled', transaction: '/transactions', budget: '/budgets' } as const;

export function QuietSyncProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [enabled, setEnabledState] = useState(false);
  const [preferenceReady, setPreferenceReady] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [saveSyncs, setSaveSyncs] = useState(0);
  const checkedLaunch = useRef(false);
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
    if (syncedAt != null) setLastSyncedAt(previous => Math.max(previous ?? 0, syncedAt));
    return state.ok;
  }, []);

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
      const state = await quietWorkerCommand({ type: 'QUIET_STATUS', user: userId, onDemand: true });
      if (!isCurrent()) return;
      if (state?.enabled && !state.liveUntil) {
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
  }, [receiveStatus, showPreference, userId]);

  useEffect(() => {
    void reconcile();
    const controllers = navigator.serviceWorker;
    const onController = () => { void reconcile(); };
    const onVisible = () => { if (!document.hidden) void reconcile(); };
    controllers?.addEventListener('controllerchange', onController);
    document.addEventListener('visibilitychange', onVisible);
    const stop = subscribeQuietPreference(showPreference);
    return () => {
      reconciliation.current += 1;
      stop();
      document.removeEventListener('visibilitychange', onVisible);
      controllers?.removeEventListener('controllerchange', onController);
    };
  }, [reconcile, showPreference]);

  const refreshReference = useCallback(() => {
    // Quiet Sync and the offline transaction form share this reference snapshot.
    return Promise.all([
      callAction(getAccountsAction), callAction(getCategoriesAction),
    ]).then(([accounts, categories]) =>
      accounts.ok && categories.ok
        ? saveSnapshot({ userId, accounts: accounts.accounts, categories: categories.categories, savedAt: Date.now() }).catch(() => {})
        : undefined,
    );
  }, [userId]);

  const download = useCallback(async ({ refreshView = false, afterWrite = false } = {}) => {
    if (!(await isServerReachable())) return false;
    await tellWorkerWho(userId);
    const pathname = location.pathname;
    const onSavedView = QUIET_SYNC_PAGES.includes(pathname) || pathname === '/budgets/plan';
    const required = [...new Set([...(onSavedView ? [activeRoute()] : []), ...QUIET_SYNC_PAGES])];
    const [result, viewResult] = await Promise.all([
      quietWorkerCommand({ type: 'QUIET_REFRESH', user: userId, pages: required, required, build: BUILD_ID, afterWrite }),
      refreshView && onSavedView ? callAction(refreshQuietViewAction) : undefined,
      refreshReference(),
    ]);
    if (receiveStatus(result) && viewResult?.ok !== false) return true;
    if (result && !result.authExpired) setProblem('incomplete');
    return false;
  }, [receiveStatus, refreshReference, userId]);

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
    }
  }, [download]);

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
    if (!takeQuietNavigationMarker(activeRoute()) && enabled && !readOffline() && QUIET_SYNC_PAGES.includes(location.pathname) &&
        isQuietSyncLaunch(performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined,
          document.referrer, location.origin, readQuietRestoreSignals())) {
      void sync();
    }
  }, [enabled, preferenceReady, sync]);

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
      const snapshot = quietWorkerCommand({ type: 'QUIET_REFRESH', user: userId, pages, required, build: BUILD_ID, afterWrite: true }, queued);
      const view = options?.refreshCurrent !== false && !readOffline() && pages.includes(route)
        ? callAction(refreshQuietViewAction)
        : undefined;
      void Promise.all([
        snapshot,
        view,
        refreshReference(),
      ]).then(([result, viewResult]) => {
        queued();
        if (!readQuietPreference(userId).enabled) return;
        const downloaded = receiveStatus(result);
        if ((result && !result.authExpired && !downloaded) || (viewResult?.ok === false && activeRoute() === route)) {
          setProblem('incomplete');
        }
      }).catch(() => {
        queued();
        setProblem('incomplete');
      }).finally(() => setSaveSyncs(count => count - 1));
    });
  }, [receiveStatus, refreshReference, userId]);

  const status = offline ? 'offline' : preparing ? 'preparing' : syncing || saveSyncs ? 'syncing' : 'paused';
  return (
    <QuietSyncContext.Provider value={{
      enabled: enabled || preparing, preferenceReady, status, problem, lastSyncedAt,
      setEnabled: next => { void setEnabled(next); },
      syncNow: () => { void sync(); },
      refreshAfterWrite,
      refreshAfterSave,
    }}>
      {children}
    </QuietSyncContext.Provider>
  );
}
