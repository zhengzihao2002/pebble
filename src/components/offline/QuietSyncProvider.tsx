'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { getAccountsAction, getCategoriesAction } from '@/lib/actions/pebble';
import { callAction } from '@/lib/actions/callAction';
import { BUILD_ID } from '@/lib/offline/buildId';
import { isServerReachable, onlineServerSnapshot, readOffline, subscribeConnectivity } from '@/lib/offline/connectivity';
import { tellWorkerWho } from '@/lib/offline/serviceWorker';
import { saveSnapshot } from '@/lib/offline/queueStore';
import {
  QUIET_SYNC_INTERVAL, QUIET_SYNC_LIVE_PERIOD, QUIET_SYNC_PAGES, QUIET_SYNC_RETRY_INTERVAL,
  quietSyncDue, quietSyncIsPaused, quietWorkerCommand, readQuietPreference, subscribeQuietPreference, writeQuietPreference, type QuietWorkerStatus,
} from '@/lib/offline/quietSync';

export interface QuietSyncApi {
  enabled: boolean;
  status: 'paused' | 'syncing' | 'live' | 'offline' | 'preparing';
  problem: 'unavailable' | 'incomplete' | null;
  liveUntil: number | null;
  lastSyncedAt: number | null;
  setEnabled(enabled: boolean): void;
  syncNow(): void;
  goOnline(): void;
  refreshAfterWrite(full?: boolean): void;
}

const QuietSyncContext = createContext<QuietSyncApi>({
  enabled: false, status: 'live', problem: null, liveUntil: null, lastSyncedAt: null,
  setEnabled() {}, syncNow() {}, goOnline() {}, refreshAfterWrite() {},
});

export function useQuietSync() {
  return useContext(QuietSyncContext);
}

function activeRoute() {
  return location.pathname + location.search;
}

export function QuietSyncProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [enabled, setEnabledState] = useState(false);
  const [liveUntil, setLiveUntil] = useState<number | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [writePending, setWritePending] = useState<'partial' | 'full' | null>(null);
  const [problem, setProblem] = useState<QuietSyncApi['problem']>(null);
  const offline = useSyncExternalStore(subscribeConnectivity, readOffline, onlineServerSnapshot);
  const busy = useRef(false);

  const showPreference = useCallback(() => {
    const preference = readQuietPreference(userId);
    setEnabledState(preference.enabled);
    setLiveUntil(preference.liveUntil > Date.now() ? preference.liveUntil : null);
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
    setLastSyncedAt(state.lastSyncedAt ?? null);
    return state.ok;
  }, []);

  const reconcile = useCallback(async () => {
    if (busy.current) return;
    showPreference();
    const preference = readQuietPreference(userId);
    if (preference.enabled) {
      const state = await quietWorkerCommand({ type: 'QUIET_STATUS', user: userId });
      if (state?.enabled) {
        receiveStatus(state);
        setProblem(previous => previous === 'unavailable' ? null : previous);
        if ((state.liveUntil ?? 0) !== preference.liveUntil) {
          writeQuietPreference(userId, { liveUntil: state.liveUntil ?? 0 });
        }
      } else if (state) {
        await tellWorkerWho(userId);
        const policy = await quietWorkerCommand({ type: 'QUIET_POLICY', user: userId, enabled: true, liveUntil: preference.liveUntil });
        if (!receiveStatus(policy)) setProblem('unavailable');
        else setProblem(null);
      } else setProblem('unavailable');
    }
    setInitializing(false);
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
      stop();
      document.removeEventListener('visibilitychange', onVisible);
      controllers?.removeEventListener('controllerchange', onController);
    };
  }, [reconcile, showPreference]);

  useEffect(() => {
    if (!liveUntil) return;
    const expire = () => { if (Date.now() >= liveUntil) showPreference(); };
    const timer = window.setTimeout(expire, Math.max(0, liveUntil - Date.now()) + 10);
    document.addEventListener('visibilitychange', expire);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', expire);
    };
  }, [liveUntil, showPreference]);

  const download = useCallback(async (partial: boolean) => {
    if (!(await isServerReachable())) return false;
    const hasPrimaryRoute = QUIET_SYNC_PAGES.includes(location.pathname);
    const pages = partial ? ['/dashboard', '/transactions', '/accounts'] : QUIET_SYNC_PAGES;
    const required = [...new Set([...(hasPrimaryRoute ? [activeRoute()] : []), ...pages])];
    if (!partial) writeQuietPreference(userId, { attemptedAt: Date.now() });
    // The transaction form shares the ordinary offline reference snapshot.
    // Refresh it only as part of an intentional Quiet Sync.
    const reference = partial ? Promise.resolve() : Promise.all([
      callAction(getAccountsAction), callAction(getCategoriesAction),
    ]).then(([accounts, categories]) =>
      accounts.ok && categories.ok
        ? saveSnapshot({ userId, accounts: accounts.accounts, categories: categories.categories, savedAt: Date.now() }).catch(() => {})
        : undefined,
    );
    const [result] = await Promise.all([
      quietWorkerCommand({ type: 'QUIET_REFRESH', user: userId, pages: required, required, build: BUILD_ID, partial }),
      reference,
    ]);
    if (receiveStatus(result)) return true;
    if (result && !result.authExpired) setProblem('incomplete');
    return false;
  }, [receiveStatus, userId]);

  const sync = useCallback(async (reload: boolean, partial = false) => {
    if (busy.current) return;
    const route = activeRoute();
    busy.current = true;
    setSyncing(true);
    setProblem(null);
    try {
      if (await download(partial) && reload && route === activeRoute() && QUIET_SYNC_PAGES.includes(location.pathname)) location.reload();
    } finally {
      setSyncing(false);
      busy.current = false;
    }
  }, [download]);

  const setEnabled = useCallback(async (next: boolean) => {
    if (busy.current) return;
    if (!navigator.serviceWorker?.controller) { setProblem('unavailable'); return; }
    busy.current = true;
    try {
      setProblem(null);
      if (next) {
        setPreparing(true);
        await tellWorkerWho(userId);
        // An incomplete first snapshot leaves ordinary navigation available.
        if (!await download(false)) return;
      }
      const state = await quietWorkerCommand({ type: 'QUIET_POLICY', user: userId, enabled: next, liveUntil: 0 });
      if (!receiveStatus(state)) { setProblem('unavailable'); return; }
      if (!writeQuietPreference(userId, { enabled: next, liveUntil: 0 })) {
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

  const goOnline = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      if (!(await isServerReachable())) return;
      const until = Date.now() + QUIET_SYNC_LIVE_PERIOD;
      const state = await quietWorkerCommand({ type: 'QUIET_POLICY', user: userId, enabled: true, liveUntil: until });
      if (!receiveStatus(state)) { setProblem('unavailable'); return; }
      writeQuietPreference(userId, { enabled: true, liveUntil: state?.liveUntil ?? until });
      setProblem(null);
      location.reload();
    } finally { busy.current = false; }
  }, [receiveStatus, userId]);

  useEffect(() => {
    if (!writePending || busy.current) return;
    setWritePending(null);
    if (enabled && (writePending === 'full' || quietSyncIsPaused())) void sync(true, writePending === 'partial');
  }, [enabled, preparing, sync, syncing, writePending]);

  useEffect(() => {
    if (!enabled || liveUntil || offline || initializing || syncing || problem === 'unavailable') return;
    let timer = 0;
    let stopped = false;
    const check = () => {
      clearTimeout(timer);
      if (document.hidden) return;
      const now = Date.now();
      const { attemptedAt, liveUntil: lease } = readQuietPreference(userId);
      if (lease > now) return;
      const due = quietSyncDue(now, lastSyncedAt, attemptedAt);
      const canSync = () => !document.hidden && !document.querySelector('[role="dialog"]') &&
        !document.activeElement?.matches('input, textarea, select, [contenteditable="true"]');
      if (due && canSync()) {
        void quietWorkerCommand({ type: 'QUIET_STATUS', user: userId }).then(current => {
          if (stopped || !current?.enabled || !receiveStatus(current) || current.liveUntil || !canSync()) return;
          if (quietSyncDue(Date.now(), current.lastSyncedAt, readQuietPreference(userId).attemptedAt)) void sync(false);
        });
      }
      const scheduled = Math.max((lastSyncedAt ?? 0) + QUIET_SYNC_INTERVAL, attemptedAt + QUIET_SYNC_RETRY_INTERVAL);
      timer = window.setTimeout(check, due ? 60_000 : Math.max(1_000, scheduled - now));
    };
    check();
    document.addEventListener('visibilitychange', check);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, [enabled, initializing, lastSyncedAt, liveUntil, offline, problem, receiveStatus, sync, syncing, userId]);

  const refreshAfterWrite = useCallback((full?: boolean) => {
    setWritePending(previous => full || previous === 'full' ? 'full' : 'partial');
  }, []);
  const status = offline ? 'offline' : preparing || enabled && initializing ? 'preparing'
    : syncing ? 'syncing' : enabled && !liveUntil && problem !== 'unavailable' ? 'paused' : 'live';
  return (
    <QuietSyncContext.Provider value={{
      enabled: enabled || preparing, status, problem, liveUntil, lastSyncedAt,
      setEnabled: next => { void setEnabled(next); },
      syncNow: () => { void sync(true); },
      goOnline: () => { void goOnline(); },
      refreshAfterWrite,
    }}>
      {children}
    </QuietSyncContext.Provider>
  );
}
