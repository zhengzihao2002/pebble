/**
 * Client side of public/sw.js: registering it, warming its caches, and
 * emptying them on sign-out.
 *
 * ON BY DEFAULT IN PRODUCTION; OFF IN DEV. `next dev` rewrites its files
 * constantly and a worker serving saved copies of them gets in the way, so
 * development needs NEXT_PUBLIC_PB_SW=1 to opt in. NEXT_PUBLIC_PB_SW=0 turns
 * it off in production (a kill switch that does not need a code change).
 * Registering an off build also removes a worker an earlier build left behind.
 */

export function serviceWorkerWanted(): boolean {
  const flag = process.env.NEXT_PUBLIC_PB_SW;
  if (flag === '1') return true;
  if (flag === '0') return false;
  return process.env.NODE_ENV === 'production';
}

const SCRIPT = '/sw.js';
// Dev builds tell the worker to treat /pb-preview/<page> as the page (see the
// DEV note at the top of sw.js). Production never sets this.
const SCRIPT_URL = process.env.NODE_ENV === 'production' ? SCRIPT : `${SCRIPT}?dev=1`;

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    if (!serviceWorkerWanted()) {
      const existing = await navigator.serviceWorker.getRegistrations();
      await Promise.all(existing.map((r) => r.unregister()));
      await deleteAllCaches();
      return null;
    }
    // updateViaCache 'none': the worker file itself is always re-checked, so
    // a fix to it is not held back by the HTTP cache.
    return await navigator.serviceWorker.register(SCRIPT_URL, { scope: '/', updateViaCache: 'none' });
  } catch (err) {
    console.error('[pebble] service worker registration failed', err);
    return null;
  }
}

// Throttle for the page warm-up: it is a real server render per page.
const WARM_KEY = 'pebble-sw-warmed-at';
const WARM_TAG_KEY = 'pebble-sw-warmed-for';
const WARM_EVERY_MS = 12 * 60 * 60 * 1000;
// When saved pages have gone missing (a sign-in cleared them, the browser
// evicted them), warming again is allowed sooner.
const REWARM_MISSING_MS = 30 * 60 * 1000;

async function savedPagePaths(): Promise<Set<string>> {
  const found = new Set<string>();
  try {
    for (const name of await caches.keys()) {
      if (!name.startsWith('pebble-pages-')) continue;
      for (const req of await (await caches.open(name)).keys()) found.add(new URL(req.url).pathname);
    }
  } catch { /* unknown: treated as nothing saved */ }
  return found;
}

/** Tells the worker who is signed in; pages it saved for anyone else are dropped. */
export async function tellWorkerWho(userId: string): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    registration.active?.postMessage({ type: 'SESSION', user: userId });
  } catch { /* offline support is a bonus */ }
}

/**
 * Hands the worker what it cannot know for itself. The first load of a visit
 * happens before the worker controls the page, so the files it already loaded
 * (from the browser's own resource list) are passed along to be stored, and
 * the main pages are fetched once so the whole app opens offline, not only
 * what has been visited. The pages part runs at most twice a day - except
 * right away when the person or the build changed (the worker emptied its
 * pages then), and again after 30 minutes if saved pages have gone missing.
 *
 * The tag ("who + which build") decides the first of those.
 */
export async function warmServiceWorker(pages: string[], userId: string, buildId: string): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator) || navigator.onLine === false) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const worker = registration.active;
    if (!worker) return;
    const assets = performance.getEntriesByType('resource')
      .map((e) => e.name)
      .filter((name) => {
        try { const u = new URL(name); return u.origin === location.origin && (u.pathname.startsWith('/_next/static/') || u.pathname.startsWith('/icons/')); } catch { return false; }
      });
    const tag = `${userId}|${buildId}`;
    let warmPages: string[] = [location.pathname + location.search];
    let last = 0;
    let lastTag = '';
    try {
      last = Number(window.localStorage.getItem(WARM_KEY)) || 0;
      lastTag = window.localStorage.getItem(WARM_TAG_KEY) ?? '';
    } catch { /* storage unavailable */ }
    const age = Date.now() - last;
    let due = lastTag !== tag || age > WARM_EVERY_MS;
    if (!due && age > REWARM_MISSING_MS) {
      const saved = await savedPagePaths();
      due = pages.some((p) => !saved.has(p));
    }
    if (due) {
      warmPages = [...warmPages, ...pages];
      try {
        window.localStorage.setItem(WARM_KEY, String(Date.now()));
        window.localStorage.setItem(WARM_TAG_KEY, tag);
      } catch { /* storage unavailable */ }
    }
    worker.postMessage({ type: 'WARM', assets, pages: [...new Set(warmPages)] });
  } catch { /* offline support is a bonus; never break the app for it */ }
}

async function deleteAllCaches(): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith('pebble-')).map((n) => caches.delete(n)));
  } catch { /* nothing to clear */ }
}

/**
 * Sign-out: everything the worker saved holds the signed-in person's
 * financial data, so all of it goes. Deleted from the page directly (does not
 * depend on a worker being awake) AND the worker is told to, so a copy it is
 * writing at this moment cannot survive. Bounded wait: sign-out must never
 * hang on cache housekeeping.
 */
export async function clearOfflineCaches(): Promise<void> {
  const work = (async () => {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      try { navigator.serviceWorker.controller?.postMessage({ type: 'CLEAR_CACHES' }); } catch { /* no worker */ }
    }
    await deleteAllCaches();
  })();
  await Promise.race([work, new Promise<void>((resolve) => setTimeout(resolve, 2500))]);
}
