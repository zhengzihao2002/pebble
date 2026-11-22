import type { QuietPostPermit } from './quietPost';

export const QUIET_SYNC_PAGES = [
  '/dashboard', '/accounts', '/transactions', '/reports', '/analysis',
  '/insights', '/budgets', '/goals', '/scheduled', '/settings',
];

export const QUIET_SYNC_MAX_AGE_HOURS = 8;
export const QUIET_SYNC_MAX_AGE_MS = QUIET_SYNC_MAX_AGE_HOURS * 60 * 60 * 1000;

export function isQuietSyncDue(lastSyncedAt: number | null, now: number) {
  return lastSyncedAt === null || now - lastSyncedAt >= QUIET_SYNC_MAX_AGE_MS;
}

interface QuietPreference {
  enabled: boolean;
}

const DEFAULT: QuietPreference = { enabled: false };
const prefix = 'pebble-quiet-sync:v1:';
const changeEvent = 'pebble:quiet-sync-change';

/** Runs in the cached HTML before the header is parsed. The script element
 * carries the authenticated document owner, so preferences never cross accounts. */
export const QUIET_SYNC_HEADER_PREINIT = `try{var owner=document.currentScript.getAttribute('data-pb-quiet-owner');var prefs=owner&&JSON.parse(localStorage.getItem(${JSON.stringify(prefix)}+owner)||'null');if(prefs&&prefs.enabled===true){var status=navigator.onLine===false?'offline':'paused';document.documentElement.setAttribute('data-pb-quiet-startup',status);}}catch(err){}`;

/** A hard reload bypasses the service worker for the document. Start saving
 * the live build before React loads so subsequent navigation can wait for it. */
export const QUIET_SYNC_RELOAD_PREINIT = `try{
  var script=document.currentScript, owner=script.getAttribute('data-pb-quiet-owner');
  var build=script.getAttribute('data-pb-quiet-build'), pair=script.getAttribute('data-pb-quiet-pair');
  var nav=performance.getEntriesByType('navigation')[0], sw=navigator.serviceWorker;
  var prefs=owner&&JSON.parse(localStorage.getItem(${JSON.stringify(prefix)}+owner)||'null');
  if(prefs?.enabled===true&&build&&sw&&nav?.type==='reload'&&!nav.workerStart&&!sw.controller&&!window.pebbleQuietReload){
    var primary=${JSON.stringify(QUIET_SYNC_PAGES)}, path=location.pathname;
    var pages=primary.includes(path)||path==='/budgets/plan'?Array.from(new Set([path+location.search].concat(primary))):primary;
    var command=pair?{type:'QUIET_PARTNER_REFRESH',user:owner,pair:pair,reloadBuild:build}:{type:'QUIET_REFRESH',user:owner,pages:pages,required:pages,build:build,afterWrite:true,reloadBuild:build};
    window.pebbleQuietReload={owner:owner,pair:pair,result:sw.getRegistration().then(function(reg){
      if(!reg?.active)return null;
      return new Promise(function(resolve){
        var channel=new MessageChannel();
        function finish(value){clearTimeout(timeout);channel.port1.close();resolve(value);}
        var timeout=setTimeout(function(){finish(null);},120000);
        channel.port1.onmessage=function(event){if(typeof event.data?.ok==='boolean')finish(event.data);};
        try{reg.active.postMessage(command,[channel.port2]);}catch(err){finish(null);}
      });
    }).catch(function(){return null;})};
  }
}catch(err){}`;

export function readQuietReloadSync(user: string, pair?: string): Promise<QuietWorkerStatus | null> | undefined {
  const reload = (window as Window & { pebbleQuietReload?: {
    owner: string; pair: string | null; result: Promise<QuietWorkerStatus | null>;
  } }).pebbleQuietReload;
  if (reload?.owner === user && reload.pair === (pair ?? null)) return reload.result;
}

function readOwner() {
  if (typeof document === 'undefined') return undefined;
  return document.querySelector<HTMLMetaElement>('meta[name="pebble-session"], meta[name="pebble-partner-session"]')?.content.split('|')[0];
}

export function readQuietPreference(user = readOwner()): QuietPreference {
  if (!user) return DEFAULT;
  try {
    const value = JSON.parse(localStorage.getItem(prefix + user) ?? 'null');
    return {
      enabled: value?.enabled === true,
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
  return quietSyncIsEnabled();
}

export function quietSyncIsEnabled() {
  return readQuietPreference().enabled;
}

export async function permitQuietPost(): Promise<QuietPostPermit | undefined> {
  if (!quietSyncIsPaused()) return;
  const user = readOwner();
  if (!user) throw new Error('Quiet Sync has no active user');
  const token = crypto.randomUUID();
  if (navigator.serviceWorker?.controller && !(await quietWorkerCommand({ type: 'QUIET_PERMIT_POST', user, token }))?.ok) {
    throw new Error('Quiet Sync could not authorize the request');
  }
  return { __pebbleQuietPost: token };
}

export async function selectQuietPartner(pair: string | null, permit?: QuietPostPermit): Promise<{ ok: true } | { ok: false; error: string; reason?: string }> {
  const response = await fetch('/api/partner/quiet-view', {
    method: 'POST', headers: { 'content-type': 'application/json', ...(permit && { 'X-Pebble-Quiet-Post': permit.__pebbleQuietPost }) }, body: JSON.stringify({ pair }),
  });
  if (!response.ok) throw new Error('Could not switch partner workspace');
  return response.json();
}

/** HTML snapshots travel independently of Next's page-specific RSC tree. */
export function navigateQuietly(href: string) {
  if (!quietSyncIsPaused()) return false;
  const url = new URL(href, window.location.href);
  if (url.origin !== location.origin || url.pathname === location.pathname && url.search === location.search) return false;
  try { sessionStorage.setItem('pebble-quiet-route', url.pathname + url.search); } catch { /* Referrer still distinguishes in-app navigation. */ }
  window.location.assign(url.href);
  return true;
}

interface RestoreSignals {
  wasDiscarded?: boolean;
  activation?: { navigationType: string; from: object | null } | null;
}

export function readQuietRestoreSignals(): RestoreSignals {
  const browser = window as Window & { navigation?: Pick<RestoreSignals, 'activation'> };
  const page = document as Document & Pick<RestoreSignals, 'wasDiscarded'>;
  return { activation: browser.navigation?.activation, wasDiscarded: page.wasDiscarded };
}

export function isQuietSyncLaunch(navigation: Pick<PerformanceNavigationTiming, 'type'> | undefined, referrer: string, origin: string, restore?: RestoreSignals) {
  if (restore?.wasDiscarded) return true;
  // Chromium restores a session as a history traversal without a previously
  // active entry. Ordinary Back/Forward has a previous entry inside Pebble.
  if (navigation?.type === 'back_forward' && restore?.activation?.navigationType === 'traverse' && restore.activation.from === null) {
    return true;
  }
  if (navigation?.type !== 'navigate') return false;
  try {
    if (referrer && new URL(referrer).origin === origin) {
      return /^\/auth(?:\/|$)/.test(new URL(referrer).pathname);
    }
  } catch { return false; }
  return true;
}

export function takeQuietNavigationMarker(route: string) {
  try {
    const pending = sessionStorage.getItem('pebble-quiet-route');
    sessionStorage.removeItem('pebble-quiet-route');
    return pending === route;
  } catch { return false; }
}

export interface QuietWorkerStatus {
  ok: boolean;
  enabled: boolean;
  liveUntil?: number | null;
  lastSyncedAt: number | null;
  available: string[];
  refreshed?: string[];
  build?: string | null;
  version?: string | null;
  authExpired?: boolean;
  accessDenied?: boolean;
  expiresAt?: number;
  accessVersion?: string | null;
}

type QuietCommand = { user: string } & (
  | { type: 'QUIET_STATUS'; onDemand: true; pair?: string }
  | { type: 'QUIET_PERMIT_POST'; token: string }
  | { type: 'QUIET_PARTNER_REFRESH'; pair: string }
  | { type: 'QUIET_PARTNER_CLEAR'; pair?: string }
  | { type: 'QUIET_INVALIDATE' }
  | { type: 'QUIET_POLICY'; enabled: boolean; liveUntil: 0 }
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

let refreshRequestId = 0;

export async function quietWorkerCommand(command: QuietCommand, onQueued?: () => void): Promise<QuietWorkerStatus | null> {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return null;
  const services = navigator.serviceWorker;
  const worker = services.controller ?? await activeQuietWorker(services);
  if (!worker) return null;
  return new Promise(resolve => {
    const channel = new MessageChannel();
    const refresh = command.type === 'QUIET_REFRESH' || command.type === 'QUIET_PARTNER_REFRESH';
    const requestId = refresh ? ++refreshRequestId : undefined;
    const receive = (event: MessageEvent) => {
      if (event.data?.type === 'QUIET_REFRESH_RESULT' && event.data.requestId === requestId &&
          typeof event.data.result?.ok === 'boolean') {
        finish(event.data.result);
      }
    };
    const finish = (result: QuietWorkerStatus | null) => {
      clearTimeout(timeout);
      channel.port1.close();
      if (refresh) services.removeEventListener?.('message', receive);
      resolve(result);
    };
    const timeout = window.setTimeout(() => finish(null), refresh ? 120_000 : 6000);
    channel.port1.onmessage = event => {
      if (event.data?.queued === true) onQueued?.();
      else finish(event.data && typeof event.data.ok === 'boolean' ? event.data : null);
    };
    if (refresh) services.addEventListener?.('message', receive);
    try { worker.postMessage(refresh ? { ...command, requestId } : command, [channel.port2]); }
    catch { finish(null); }
  });
}
