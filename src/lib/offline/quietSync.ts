export const QUIET_SYNC_INTERVAL = 8 * 60 * 60 * 1000;
export const QUIET_SYNC_LIVE_PERIOD = 20 * 60 * 1000;
export const QUIET_SYNC_RETRY_INTERVAL = 30 * 60 * 1000;
export const QUIET_SYNC_PAGES = [
  '/dashboard', '/accounts', '/transactions', '/reports', '/analysis',
  '/insights', '/budgets', '/goals', '/scheduled', '/settings',
];

interface QuietPreference {
  enabled: boolean;
  liveUntil: number;
  attemptedAt: number;
}

const DEFAULT: QuietPreference = { enabled: false, liveUntil: 0, attemptedAt: 0 };
const prefix = 'pebble-quiet-sync:v1:';
const changeEvent = 'pebble:quiet-sync-change';

/** Runs in the cached HTML before the header is parsed. The script element
 * carries the authenticated document owner, so preferences never cross accounts. */
export const QUIET_SYNC_HEADER_PREINIT = `try{var owner=document.currentScript.getAttribute('data-pb-quiet-owner');var prefs=owner&&JSON.parse(localStorage.getItem(${JSON.stringify(prefix)}+owner)||'null');if(prefs&&prefs.enabled===true){var status=navigator.onLine===false?'offline':prefs.liveUntil>Date.now()?'live':'paused';document.documentElement.setAttribute('data-pb-quiet-startup',status);}}catch(err){}`;

function readOwner() {
  if (typeof document === 'undefined') return undefined;
  return document.querySelector<HTMLMetaElement>('meta[name="pebble-session"]')?.content.split('|')[0];
}

export function readQuietPreference(user = readOwner()): QuietPreference {
  if (!user) return DEFAULT;
  try {
    const value = JSON.parse(localStorage.getItem(prefix + user) ?? 'null');
    return {
      enabled: value?.enabled === true,
      liveUntil: typeof value?.liveUntil === 'number' ? value.liveUntil : 0,
      attemptedAt: typeof value?.attemptedAt === 'number' ? value.attemptedAt : 0,
    };
  } catch { return DEFAULT; }
}

export function writeQuietPreference(user: string, patch: Partial<QuietPreference>) {
  try {
    localStorage.setItem(prefix + user, JSON.stringify({ ...readQuietPreference(user), ...patch }));
    window.dispatchEvent(new Event(changeEvent));
    return true;
  } catch { return false; }
}

export function subscribeQuietPreference(listener: () => void) {
  const storage = (event: StorageEvent) => { if (event.key === prefix + readOwner() || event.key === null) listener(); };
  window.addEventListener(changeEvent, listener);
  window.addEventListener('storage', storage);
  return () => {
    window.removeEventListener(changeEvent, listener);
    window.removeEventListener('storage', storage);
  };
}

export function quietSyncIsPaused() {
  const { enabled, liveUntil } = readQuietPreference();
  return enabled && liveUntil <= Date.now();
}

export function quietSyncIsEnabled() {
  return readQuietPreference().enabled;
}

/** HTML snapshots travel independently of Next's page-specific RSC tree. */
export function navigateQuietly(href: string) {
  if (!quietSyncIsPaused()) return false;
  const url = new URL(href, window.location.href);
  if (url.origin !== location.origin || url.pathname === location.pathname && url.search === location.search) return false;
  window.location.assign(url.href);
  return true;
}

export function quietSyncDue(now: number, lastSyncedAt: number | null, attemptedAt: number) {
  return now >= (lastSyncedAt ?? 0) + QUIET_SYNC_INTERVAL && now >= attemptedAt + QUIET_SYNC_RETRY_INTERVAL;
}

export interface QuietWorkerStatus {
  ok: boolean;
  enabled: boolean;
  liveUntil: number | null;
  lastSyncedAt: number | null;
  available: string[];
  build?: string | null;
  authExpired?: boolean;
}

type QuietCommand = { user: string } & (
  | { type: 'QUIET_STATUS' }
  | { type: 'QUIET_INVALIDATE' }
  | { type: 'QUIET_POLICY'; enabled: boolean; liveUntil: number }
  | { type: 'QUIET_REFRESH'; pages: string[]; required: string[]; build: string; partial?: boolean; afterWrite?: boolean }
);

export function activeQuietWorker(services: ServiceWorkerContainer): Promise<ServiceWorker | null> {
  if (services.controller) return Promise.resolve(services.controller);
  // A hard reload can bypass interception for this document while leaving an
  // active registration that can still answer messages and serve the next page.
  return new Promise(resolve => {
    const timeout = window.setTimeout(() => resolve(null), 6000);
    const receive = (registration: ServiceWorkerRegistration | undefined) => {
      if (!registration?.active) return;
      clearTimeout(timeout);
      resolve(registration.active);
    };
    void services.getRegistration().then(receive, () => {});
    void services.ready.then(receive, () => {});
  });
}

export async function quietWorkerCommand(command: QuietCommand, onQueued?: () => void): Promise<QuietWorkerStatus | null> {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return null;
  const services = navigator.serviceWorker;
  const worker = services.controller ?? await activeQuietWorker(services);
  if (!worker) return null;
  return new Promise(resolve => {
    const channel = new MessageChannel();
    const finish = (result: QuietWorkerStatus | null) => {
      clearTimeout(timeout);
      channel.port1.close();
      resolve(result);
    };
    const timeout = window.setTimeout(() => finish(null), command.type === 'QUIET_REFRESH' ? 120_000 : 6000);
    channel.port1.onmessage = event => {
      if (event.data?.queued === true) onQueued?.();
      else finish(event.data && typeof event.data.ok === 'boolean' ? event.data : null);
    };
    try { worker.postMessage(command, [channel.port2]); }
    catch { finish(null); }
  });
}
