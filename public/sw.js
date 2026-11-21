/* Pebble service worker. Plain JavaScript, no dependencies.
 *
 * WHAT IT DOES. Lets the installed app (and the browser tab) OPEN without a
 * connection: pages the person has visited come back from a device cache with
 * the data they last saw, and the app's own code and fonts come from a second
 * cache. Writes are never touched here - adding a transaction offline is the
 * app's own queue (src/lib/offline), not this file.
 *
 * WHAT IT NEVER DOES.
 *  - Cache anything but a GET. Server Actions are POSTs (and carry
 *    Next-Action), so no write, and no auth call, ever passes through a cache.
 *  - Cache /auth/*, /api/*, a redirect, a non-200, or a page outside the
 *    signed-in app. A 200 that was not a redirect came from the signed-in
 *    layout, which redirects everyone else; anything unauthenticated is
 *    therefore never stored.
 *  - Keep data after sign-out. The app sends CLEAR_CACHES when you sign out,
 *    and visiting a sign-in page while online clears them too (covers
 *    expired sessions and deleted accounts).
 *  - Mix people or builds. Every saved page carries the user id and build id
 *    of the app that rendered it (the pebble-session <meta> from the signed-in
 *    layout; a page without it is not stored). Saving a page for a different
 *    user, or from a different build, first empties the saved pages - so one
 *    person's pages are never kept next to (or served after) another's, and
 *    after a deploy no old HTML is left pointing at the previous build's code.
 *    The app also reports who is signed in (SESSION); a different user than
 *    the saved pages belong to empties them at once.
 *
 * CACHES (names carry VERSION; activate deletes older ones).
 *   pebble-pages-*   the last good HTML of each visited page, keyed by URL.
 *   pebble-static-*  /_next/static/*, icons, the manifest, the offline page.
 *   pebble-meta-*    sizes and ages, so both caches can be trimmed.
 * Whole-thing budget: pages <= 10 MB / 16 entries, static <= 12 MB.
 *
 * WHY HTML ONLY, NOT THE CLIENT-NAVIGATION (RSC) REQUESTS. Moving between
 * pages in the app fetches an RSC payload shaped by the page you came from
 * (the router tree is sent as a header and the server leaves out what you
 * already have). Replaying one payload for another starting point is a source
 * of subtle breakage. Left alone, that request simply fails while offline and
 * Next falls back to a normal navigation to the URL - which this worker
 * answers from the HTML cache. One cache, one shape, always consistent.
 *
 * iOS: there is no Background Sync for web apps, and storage can be reclaimed
 * by the system, so nothing here depends on either. Uploading queued
 * transactions happens in the page, while the app is open.
 */
'use strict';

// v2: pages are now stored with the signed-in user and build they came from.
var VERSION = 'v2';
var PAGES = 'pebble-pages-' + VERSION;
var STATIC = 'pebble-static-' + VERSION;
var META = 'pebble-meta-' + VERSION;
var KNOWN = [PAGES, STATIC, META];

var OFFLINE_URL = '/offline.html';
var QUIET_URL = '/quiet-sync.html';
var PRECACHE = [OFFLINE_URL, QUIET_URL, '/manifest.json', '/icons/icon-192.png', '/icons/apple-touch-icon.png'];
var QUIET_LIVE_MS = 20 * 60 * 1000;
var QUIET_SAVE_MS = 5 * 60 * 1000;
var QUIET_PRIMARY = ['/dashboard', '/accounts', '/transactions', '/reports', '/analysis', '/insights', '/budgets', '/goals', '/scheduled', '/settings'];

// How long a visited page waits for the network before the saved copy is
// shown (the network response still updates the saved copy afterwards).
var NAV_TIMEOUT_MS = 3000;

var MAX_PAGE_ENTRIES = 16;
var MAX_PAGES_BYTES = 10 * 1024 * 1024;
var MAX_ONE_PAGE_BYTES = 5 * 1024 * 1024;
var MAX_STATIC_BYTES = 12 * 1024 * 1024;
var MAX_ONE_STATIC_BYTES = 3 * 1024 * 1024;

// Dev builds register with ?dev=1. The local-only /pb-preview/<page> routes
// then stand in for the real pages (same cache key as /<page>), so the offline
// behaviour can be exercised without a database. Never set in production.
var DEV = new URL(self.location.href).searchParams.has('dev');

// Pages that are part of the signed-in app. Anything else is never stored.
var APP_PATH = /^\/(dashboard|accounts|transactions|reports|analysis|insights|budgets|goals|scheduled|settings|account)(\/|$)/;

function pageKey(url) {
  var path = url.pathname;
  if (DEV && path.indexOf('/pb-preview/') === 0) path = path.slice('/pb-preview'.length);
  if (!APP_PATH.test(path)) return null;
  return self.location.origin + path + url.search;
}

/* ---- sizes and trimming ------------------------------------------------- */

var metaChain = Promise.resolve();

// Bumped by every clear. A page fetch that began before a clear and finishes
// after it must not write itself back (a sign-out would be undone).
var epoch = 0;

// Serialised: several stores finish at once (a warm-up fetches many files),
// and each rewrites the same small index.
function withMeta(work) {
  var next = metaChain.then(function () {
    return caches.open(META).then(function (cache) {
      return cache.match('/__meta').then(function (res) {
        return res ? res.json() : {};
      }).then(function (meta) {
        meta.pages = meta.pages || {};
        meta.static = meta.static || {};
        return Promise.resolve(work(meta)).then(function () {
          return cache.put('/__meta', new Response(JSON.stringify(meta), { headers: { 'content-type': 'application/json' } }));
        });
      });
    });
  });
  metaChain = next.catch(function () {});
  return next;
}

function readMeta() {
  return metaChain.then(function () { return caches.open(META); }).then(function (cache) {
    return cache.match('/__meta');
  }).then(function (res) { return res ? res.json() : {}; }).catch(function () { return {}; });
}

function quietPaused(meta) {
  return !!(meta.user && meta.quiet && meta.quiet.enabled && !(meta.quiet.liveUntil > Date.now()));
}

function quietStatus(meta, user) {
  var valid = !!user && user === meta.user;
  var quiet = valid && meta.quiet;
  return {
    ok: valid,
    enabled: !!(quiet && quiet.enabled),
    liveUntil: quiet && quiet.liveUntil > Date.now() ? quiet.liveUntil : null,
    lastSyncedAt: quiet && quiet.lastSyncedAt || null,
    build: valid && meta.build || null,
    available: valid ? Object.keys(meta.pages || {}).map(function (key) {
      var url = new URL(key);
      return url.pathname + url.search;
    }) : [],
  };
}

function setQuietPolicy(data) {
  return withMeta(function (meta) {
    if (meta.user !== data.user) return;
    var now = Date.now();
    if (data.afterSave === true) {
      if (!meta.quiet?.enabled) return;
      // A save may extend a lease, but it must not shorten an existing one.
      meta.quiet.liveUntil = Math.max(meta.quiet.liveUntil || 0, now + QUIET_SAVE_MS);
      return;
    }
    meta.quiet = {
      enabled: data.enabled === true,
      liveUntil: typeof data.liveUntil === 'number' && data.liveUntil > now
        ? Math.min(data.liveUntil, now + QUIET_LIVE_MS) : null,
      lastSyncedAt: meta.quiet && meta.quiet.lastSyncedAt || null,
    };
  }).then(readMeta).then(function (meta) { return quietStatus(meta, data.user); });
}

// Evicts the oldest entries until both limits hold. `keep` is the entry just
// written, which is never the one to go.
function trim(cacheName, entries, maxEntries, maxBytes, keep) {
  var keys = Object.keys(entries).sort(function (x, y) { return entries[x].at - entries[y].at; });
  var count = keys.length;
  var total = keys.reduce(function (sum, k) { return sum + entries[k].size; }, 0);
  var doomed = [];
  keys.forEach(function (k) {
    if (k === keep || (count <= maxEntries && total <= maxBytes)) return;
    total -= entries[k].size;
    count -= 1;
    doomed.push(k);
  });
  if (doomed.length === 0) return Promise.resolve();
  return caches.open(cacheName).then(function (cache) {
    return Promise.all(doomed.map(function (k) {
      delete entries[k];
      return cache.delete(k, { ignoreVary: true });
    }));
  });
}

/* ---- storing -------------------------------------------------------------- */

function isCacheablePage(res) {
  if (!res || res.status !== 200 || res.type !== 'basic' || res.redirected) return false;
  var type = res.headers.get('content-type') || '';
  return type.indexOf('text/html') !== -1;
}

// The user and build the page was rendered for: the pebble-session <meta>
// ("userId|buildId") written by the signed-in layout. Looked for in the first
// 256 KB only (it sits in the document head).
var CTX_RE = /<meta\b[^>]*\bname="pebble-session"[^>]*\bcontent="([^"]*)"|<meta\b[^>]*\bcontent="([^"]*)"[^>]*\bname="pebble-session"/;

function readContext(buf) {
  var head = new TextDecoder().decode(buf.byteLength > 262144 ? buf.slice(0, 262144) : buf);
  var m = CTX_RE.exec(head);
  var parts = m ? (m[1] || m[2] || '').split('|') : [];
  return parts.length === 2 && parts[0] && parts[1] ? { user: parts[0], build: parts[1] } : null;
}

// Reads the body once to learn its size, then stores a plain copy (only
// content-type is kept: no Set-Cookie or anything else from the response ever
// lands in the cache). Returns the bytes (for the warm-up's asset scan) or
// null when not stored.
function storePage(key, res, started) {
  return res.arrayBuffer().then(function (buf) {
    if (buf.byteLength > MAX_ONE_PAGE_BYTES) return null;
    var ctx = readContext(buf);
    // Not rendered by the signed-in layout: never stored.
    if (!ctx) return null;
    var headers = new Headers();
    headers.set('content-type', res.headers.get('content-type') || 'text/html; charset=utf-8');
    return withMeta(function (meta) {
      if (started !== epoch) return; // cleared while this was in flight
      // A live navigation after a deploy must not replace a complete quiet
      // snapshot with one page. A verified refresh promotes the new build.
      if (meta.user === ctx.user && meta.build && meta.build !== ctx.build && meta.quiet?.enabled) return;
      var changed = (meta.user && meta.user !== ctx.user) || (meta.build && meta.build !== ctx.build);
      return (changed ? caches.delete(PAGES).then(function () { meta.pages = {}; }) : Promise.resolve()).then(function () {
        return caches.open(PAGES);
      }).then(function (cache) {
        return cache.put(key, new Response(buf, { status: 200, headers: headers }));
      }).then(function () {
        if (meta.user && meta.user !== ctx.user) delete meta.quiet;
        meta.user = ctx.user;
        meta.build = ctx.build;
        meta.pages[key] = { size: buf.byteLength, at: Date.now() };
        return trim(PAGES, meta.pages, MAX_PAGE_ENTRIES, MAX_PAGES_BYTES, key);
      });
    }).then(function () { return buf; });
  });
}

function storeStatic(request, res) {
  if (!res || res.status !== 200 || res.type !== 'basic') return Promise.resolve();
  return res.arrayBuffer().then(function (buf) {
    if (buf.byteLength > MAX_ONE_STATIC_BYTES) return;
    var headers = new Headers();
    ['content-type', 'cache-control', 'etag'].forEach(function (h) {
      var v = res.headers.get(h);
      if (v) headers.set(h, v);
    });
    var key = new URL(request.url).pathname + new URL(request.url).search;
    return caches.open(STATIC).then(function (cache) {
      return cache.put(key, new Response(buf, { status: 200, headers: headers }));
    }).then(function () {
      return withMeta(function (meta) {
        meta.static[key] = { size: buf.byteLength, at: Date.now() };
        return trim(STATIC, meta.static, 4000, MAX_STATIC_BYTES, key);
      });
    });
  }).catch(function () {});
}

function staticKey(url) { return url.pathname + url.search; }

/* ---- responses ------------------------------------------------------------ */

function offlinePage() {
  return caches.open(STATIC).then(function (cache) {
    return cache.match(OFFLINE_URL);
  }).then(function (res) {
    return res || new Response('Offline', { status: 503, headers: { 'content-type': 'text/plain' } });
  });
}

function quietPage() {
  return caches.open(STATIC).then(function (cache) { return cache.match(QUIET_URL); }).then(function (saved) {
    if (!saved) return new Response('Quiet Sync paused. Return to a saved page to sync.', { status: 503 });
    return new Response(saved.body, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  });
}

function quietNavigation(url, user) {
  if (url.pathname === '/') return Promise.resolve(Response.redirect(self.location.origin + '/dashboard', 302));
  var key = pageKey(url);
  if (!key) return quietPage();
  function cachedPage() {
    return caches.open(PAGES).then(function (cache) {
      return cache.match(key, { ignoreVary: true }).then(function (saved) {
        if (saved || !url.search) return saved;
        return cache.match(pageKey(new URL(url.pathname, url.origin)), { ignoreVary: true });
      });
    }).then(function (saved) { return saved || quietPage(); }, quietPage);
  }
  var path = new URL(key).pathname;
  var writing = pendingQuietWrite(user, path);
  if (!writing) return cachedPage();
  return waitForQuietWrites(user, path).then(readMeta).then(function (meta) {
    return meta.user === user ? cachedPage() : quietPage();
  });
}

function handleNavigation(event, stayOnline) {
  var request = event.request;
  var url = new URL(request.url);

  // Sign-in and the other auth pages: never stored. Reaching one while online
  // means the session is gone (sign-out, expiry, deleted account), so the
  // saved pages go with it.
  if (url.pathname.indexOf('/auth/') === 0 || url.pathname === '/auth') {
    return fetch(request).then(function (res) {
      // (/auth/privacy and /auth/terms are public pages a signed-in person can
      // open: they say nothing about the session, so they keep what is saved.)
      if (res.status === 200 && res.type === 'basic' && url.pathname.indexOf('/auth/privacy') !== 0 && url.pathname.indexOf('/auth/terms') !== 0) event.waitUntil(clearPrivate());
      return res;
    }).catch(offlinePage);
  }

  var key = pageKey(url);
  if (!key) {
    return fetch(request).catch(offlinePage);
  }

  var started = epoch;
  var network = fetch(request).then(function (res) {
    if (isCacheablePage(res)) {
      // The write finishes after the page has been handed to the browser.
      event.waitUntil(storePage(key, res.clone(), started).catch(function () {}));
    }
    return res;
  });
  // A rejected network promise must never be unhandled.
  event.waitUntil(network.catch(function () {}));

  return caches.open(PAGES).then(function (cache) {
    return cache.match(key, { ignoreVary: true });
  }).then(function (saved) {
    if (!saved) return network.catch(offlinePage);
    // During an online window, a slow response can still contain a change
    // just saved on the server. Prefer it over an older local copy.
    var preferred = network;
    if (!stayOnline) {
      var timeout = new Promise(function (resolve) { setTimeout(function () { resolve(null); }, NAV_TIMEOUT_MS); });
      preferred = Promise.race([network, timeout]);
    }
    return preferred.then(function (res) {
      // Slow: show the saved copy; the network response still refreshes it.
      if (!res) return saved;
      // The server is failing: the saved copy beats an error page.
      if (res.status >= 500) return saved;
      return res;
    }, function () { return saved; });
  });
}

function rangeFrom(request, res) {
  var range = request.headers.get('range');
  if (!range) return Promise.resolve(res);
  return res.arrayBuffer().then(function (buf) {
    var m = /bytes=(\d*)-(\d*)/.exec(range);
    if (!m) return res;
    var start = m[1] === '' ? Math.max(0, buf.byteLength - Number(m[2])) : Number(m[1]);
    var end = m[1] === '' || m[2] === '' ? buf.byteLength - 1 : Math.min(Number(m[2]), buf.byteLength - 1);
    if (start > end || start >= buf.byteLength) {
      return new Response(null, { status: 416, headers: { 'content-range': 'bytes */' + buf.byteLength } });
    }
    return new Response(buf.slice(start, end + 1), {
      status: 206,
      headers: {
        'content-type': res.headers.get('content-type') || 'application/octet-stream',
        'content-range': 'bytes ' + start + '-' + end + '/' + buf.byteLength,
        'content-length': String(end - start + 1),
        'accept-ranges': 'bytes',
      },
    });
  });
}

function cacheFirst(event, url) {
  var request = event.request;
  var key = staticKey(url);
  var ranged = request.headers.has('range');
  // /_next/static/ files are named by content hash and never change. The
  // others (icons, manifest, sounds) keep their name when they change, so the
  // saved copy is shown now and refreshed in the background.
  var hashed = url.pathname.indexOf('/_next/static/') === 0;
  return caches.open(STATIC).then(function (cache) {
    return cache.match(key, { ignoreVary: true }).then(function (hit) {
      if (hit && !hashed && !ranged) {
        event.waitUntil(fetch(url.href, { cache: 'no-cache' }).then(function (res) { return storeStatic({ url: url.href }, res); }).catch(function () {}));
      }
      if (hit) return ranged ? rangeFrom(request, hit) : hit;
      // A ranged request (audio) is answered from a full copy fetched here,
      // so the file is stored whole and later ranges are served from it.
      var fetching = fetch(ranged ? url.href : request).then(function (res) {
        if (res.ok) event.waitUntil(storeStatic(request, res.clone()));
        return res;
      });
      return ranged ? fetching.then(function (res) { return res.ok ? rangeFrom(request, res) : res; }) : fetching;
    });
  });
}

/* ---- clearing ------------------------------------------------------------- */

function precache() {
  return caches.open(STATIC).then(function (cache) {
    return Promise.all(PRECACHE.map(function (path) {
      return fetch(path, { cache: 'reload' }).then(function (res) {
        if (res.ok) return cache.put(path, res);
      }).catch(function () {});
    }));
  });
}

// Deletes every Pebble cache (privacy: cached pages hold financial data), then
// puts the public offline page back so a signed-out device still shows
// something sensible without a connection. Runs in the same queue as the
// index updates, so nothing is half-written around it.
function clearAll() {
  epoch += 1;
  var next = metaChain.then(function () {
    return caches.keys();
  }).then(function (names) {
    return Promise.all(names.filter(function (n) { return n.indexOf('pebble-') === 0; }).map(function (n) { return caches.delete(n); }));
  }).then(precache);
  metaChain = next.catch(function () {});
  return next;
}

// Only the private part: saved pages and who they belong to. The app's code
// and fonts are the same for everyone and stay (their index with them, so they
// can still be trimmed).
function clearPrivate() {
  epoch += 1;
  return withMeta(function (meta) {
    meta.pages = {};
    delete meta.user;
    delete meta.build;
    delete meta.quiet;
    return caches.delete(PAGES);
  });
}

// The app says who is signed in. Pages saved for someone else go.
function adoptUser(user) {
  return withMeta(function (meta) {
    if (meta.user && meta.user !== user) {
      epoch += 1;
      meta.pages = {};
      delete meta.build;
      delete meta.quiet;
      meta.user = user;
      return caches.delete(PAGES);
    }
    if (!meta.user) meta.user = user;
  });
}

/* ---- warm-up --------------------------------------------------------------- */
// The first visit is not yet controlled by this worker, so the files it loaded
// were never cached. The page lists them, and also asks for the main pages to
// be fetched once so that the whole app opens offline, not only what has been
// visited. Pages go one at a time (each is a real server render).

var ASSET_RE = /\/_next\/static\/[A-Za-z0-9_\-.\/%~@\[\]]+\.(?:js|css|woff2?)/g;
var FLIGHT_ASSET_RE = /"(static\/(?:chunks|media|css)\/[A-Za-z0-9_\-.\/%~@\[\]]+\.(?:js|css|woff2?))"/g;

function assetsIn(text) {
  var found = {};
  var m;
  ASSET_RE.lastIndex = 0;
  FLIGHT_ASSET_RE.lastIndex = 0;
  while ((m = ASSET_RE.exec(text))) found[m[0]] = true;
  while ((m = FLIGHT_ASSET_RE.exec(text))) found['/_next/' + m[1]] = true;
  return Object.keys(found).slice(0, 160);
}

function warmAsset(path) {
  var url = new URL(path, self.location.origin);
  if (url.origin !== self.location.origin) return Promise.resolve();
  if (url.pathname.indexOf('/_next/static/') !== 0 && url.pathname.indexOf('/icons/') !== 0) return Promise.resolve();
  var key = staticKey(url);
  return caches.open(STATIC).then(function (cache) {
    return cache.match(key, { ignoreVary: true }).then(function (hit) {
      if (hit) return;
      return fetch(url.href).then(function (res) { return storeStatic({ url: url.href }, res); });
    });
  }).catch(function () {});
}

function warmPage(path) {
  var url = new URL(path, self.location.origin);
  var key = url.origin === self.location.origin ? pageKey(url) : null;
  if (!key) return Promise.resolve();
  var started = epoch;
  return fetch(url.href, { headers: { accept: 'text/html' }, credentials: 'same-origin', redirect: 'manual' }).then(function (res) {
    if (!isCacheablePage(res)) return;
    return storePage(key, res, started).then(function (buf) {
      if (!buf) return;
      var text = new TextDecoder().decode(buf);
      return assetsIn(text).reduce(function (chain, a) { return chain.then(function () { return warmAsset(a); }); }, Promise.resolve());
    });
  }).catch(function () {});
}

function warm(data) {
  var assets = (data.assets || []).slice(0, 400);
  var pages = (data.pages || []).slice(0, 12);
  return Promise.all(assets.map(warmAsset)).then(function () {
    return pages.reduce(function (chain, p) {
      return chain.then(readMeta).then(function (meta) { if (!quietPaused(meta)) return warmPage(p); });
    }, Promise.resolve());
  });
}

/* ---- explicit Quiet Sync --------------------------------------------------- */

var quietRefreshChain = Promise.resolve();
var quietFull = new Map();
var quietWrites = new Map();

function pendingQuietWrite(user, path) {
  return quietWrites.get(user)?.get(path);
}

function waitForQuietWrites(user, path) {
  var pending = pendingQuietWrite(user, path);
  return pending ? pending.then(function () { return waitForQuietWrites(user, path); }) : Promise.resolve();
}

function quietPageURLs(paths) {
  var urls = {};
  var list = Array.isArray(paths) ? paths : [];
  list.slice(0, MAX_PAGE_ENTRIES).forEach(function (path) {
    if (typeof path !== 'string' || !path.startsWith('/')) return;
    try {
      var url = new URL(path, self.location.origin);
      var key = url.origin === self.location.origin && pageKey(url);
      if (key) urls[key] = url.href.split('#')[0];
    } catch { /* Invalid route. */ }
  });
  return urls;
}

function readQuietDocument(url, key, user) {
  var controller = new AbortController();
  var timeout = setTimeout(function () { controller.abort(); }, 10000);
  return fetch(url, {
    headers: { accept: 'text/html' }, cache: 'no-store', credentials: 'same-origin', signal: controller.signal,
  }).then(function (res) {
    if (res.redirected && res.url && /^\/auth(?:\/|$)/.test(new URL(res.url).pathname)) return { authExpired: true };
    if (!isCacheablePage(res)) return null;
    return res.arrayBuffer().then(function (buf) {
      var ctx = buf.byteLength <= MAX_ONE_PAGE_BYTES && readContext(buf);
      if (!ctx || ctx.user !== user) return null;
      return { key: key, context: ctx, buf: buf, contentType: res.headers.get('content-type') || 'text/html; charset=utf-8' };
    });
  }).catch(function () { return null; }).finally(function () { clearTimeout(timeout); });
}

function refreshQuiet(data, publish) {
  var started = epoch;
  return readMeta().then(async function (before) {
    if (before.user !== data.user || started !== epoch) return quietStatus({}, data.user);
    var urls = quietPageURLs(data.pages);
    var keys = Object.keys(urls);
    var required = Object.keys(quietPageURLs(data.required || data.pages));
    if (!keys.length || !required.length) return Object.assign(quietStatus(before, data.user), { ok: false });
    var docs = new Map();
    var total = 0;
    var build;
    // Wake the origin only once per page and avoid a burst of database reads.
    for (var key of keys) {
      if (started !== epoch) return quietStatus({}, data.user);
      var doc = await readQuietDocument(urls[key], key, data.user);
      if (doc && doc.authExpired) {
        await withMeta(function (meta) {
          if (meta.user !== data.user || started !== epoch) return;
          epoch += 1;
          meta.pages = {};
          delete meta.user;
          delete meta.build;
          delete meta.quiet;
          return caches.delete(PAGES);
        });
        return Object.assign(quietStatus({}, data.user), { authExpired: true });
      }
      if (required.includes(key)) {
        if (!doc || build && doc.context.build !== build) {
          return Object.assign(quietStatus(before, data.user), { ok: false });
        }
        build = doc.context.build;
      } else if (!doc) continue;
      if (total + doc.buf.byteLength > MAX_PAGES_BYTES && required.includes(key)) {
        for (var [optional, previousDoc] of docs) {
          if (required.includes(optional)) continue;
          total -= previousDoc.buf.byteLength;
          docs.delete(optional);
          if (total + doc.buf.byteLength <= MAX_PAGES_BYTES) break;
        }
      }
      if (total + doc.buf.byteLength <= MAX_PAGES_BYTES) {
        docs.set(key, doc);
        total += doc.buf.byteLength;
      }
    }
    var complete = required.every(function (key) { return docs.get(key)?.context.build === build && !!build; });
    if (!complete) return Object.assign(quietStatus(before, data.user), { ok: false });
    if (data.partial && before.build && before.build !== build) {
      // Keep the existing build intact until the same refresh can populate
      // the full set of primary pages from the new deployment.
      var base = DEV ? '/pb-preview' : '';
      var primary = QUIET_PRIMARY.map(function (path) { return base + path; });
      return refreshQuiet({
        user: data.user, pages: [...new Set([...(data.pages || []), ...primary])], required: primary,
        afterWrite: data.afterWrite,
      }, publish);
    }
    var matching = Array.from(docs.values()).filter(function (doc) { return doc.context.build === build; });

    var saved = false;
    await withMeta(async function (meta) {
      if (meta.user !== data.user || started !== epoch) return;
      if (meta.build !== build) {
        await caches.delete(PAGES);
        meta.pages = {};
        meta.build = build;
      }
      var cache = await caches.open(PAGES);
      // Keep requested pages ahead of old entries, and the required pages
      // ahead of optional ones, when the cache reaches its size limit.
      var ordered = matching.sort(function (a, b) { return Number(required.includes(a.key)) - Number(required.includes(b.key)); });
      var at = Date.now();
      for (var doc of ordered) {
        await cache.put(doc.key, new Response(doc.buf, { headers: { 'content-type': doc.contentType } }));
        meta.pages[doc.key] = { size: doc.buf.byteLength, at: at++ };
      }
      if (data.afterWrite) {
        // Query variants can outlive the underlying record. If the base
        // page was refreshed, let older variants use that fresh snapshot.
        var freshKeys = new Set(matching.map(function (doc) { return doc.key; }));
        for (var existing of Object.keys(meta.pages)) {
          var url = new URL(existing);
          if (!url.search || freshKeys.has(existing) || !freshKeys.has(url.origin + url.pathname)) continue;
          await cache.delete(existing, { ignoreVary: true });
          delete meta.pages[existing];
        }
      }
      await trim(PAGES, meta.pages, MAX_PAGE_ENTRIES, MAX_PAGES_BYTES, required[0]);
      saved = required.every(function (key) { return key in meta.pages; });
      if (saved && !data.partial) {
        meta.quiet = meta.quiet || { enabled: false };
        meta.quiet.lastSyncedAt = Date.now();
      }
    });
    publish();
    if (saved) {
      var assets = new Set();
      for (var doc of matching) assetsIn(new TextDecoder().decode(doc.buf)).forEach(function (path) { assets.add(path); });
      for (var asset of assets) await warmAsset(asset);
    }
    var current = await readMeta();
    return Object.assign(quietStatus(current, data.user), {
      ok: saved && current.user === data.user && current.build === build && started === epoch,
      refreshed: matching.map(function (doc) { return doc.key; }).filter(function (key) { return key in (current.pages || {}); }),
    });
  });
}

function enqueueQuietRefresh(data) {
  var shared = !data.partial && !data.afterWrite;
  if (shared && quietFull.has(data.user)) {
    var existing = quietFull.get(data.user);
    // A different tab may be on an optional page the current batch did
    // not request. Follow with its own refresh only if a required route
    // was not covered by the shared run.
    return existing.then(function (result) {
      var required = Object.keys(quietPageURLs(data.required || data.pages));
      if (!result.ok || required.every(function (key) { return result.refreshed.includes(key); })) return result;
      return enqueueQuietRefresh(data);
    });
  }
  var resolvePublication;
  var publication = new Promise(function (resolve) { resolvePublication = resolve; });
  var writes = quietWrites.get(data.user) || new Map();
  var paths = data.afterWrite ? Object.keys(quietPageURLs(data.pages)).map(function (key) { return new URL(key).pathname; }) : [];
  if (paths.length) {
    quietWrites.set(data.user, writes);
    paths.forEach(function (path) { writes.set(path, publication); });
  }
  function publish() {
    if (!resolvePublication) return;
    paths.forEach(function (path) { if (writes.get(path) === publication) writes.delete(path); });
    if (paths.length && !writes.size && quietWrites.get(data.user) === writes) quietWrites.delete(data.user);
    resolvePublication();
    resolvePublication = null;
  }
  var result = quietRefreshChain.then(function () { return refreshQuiet(data, publish); }).catch(function () {
    return readMeta().then(function (meta) { return Object.assign(quietStatus(meta, data.user), { ok: false }); });
  });
  // A page batch is done when its cache writes are durable. Asset warming
  // can finish independently and must not keep a later write waiting.
  quietRefreshChain = publication;
  void result.then(publish, publish);
  if (shared) {
    quietFull.set(data.user, result);
    void result.finally(function () { if (quietFull.get(data.user) === result) quietFull.delete(data.user); });
  }
  return result;
}

/* ---- lifecycle -------------------------------------------------------------- */

self.addEventListener('install', function (event) {
  // Stateless apart from the caches, whose names are versioned, so taking over
  // immediately is safe and gets the offline page to a first-time visitor
  // without waiting for every tab to close.
  event.waitUntil(precache().then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.filter(function (n) {
        return n.indexOf('pebble-') === 0 && KNOWN.indexOf(n) === -1;
      }).map(function (n) { return caches.delete(n); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('message', function (event) {
  var data = event.data || {};
  var reply = function (result) {
    if (event.ports && event.ports[0]) event.ports[0].postMessage(result);
    else if (event.source && event.source.postMessage) event.source.postMessage(result);
  };
  if (data.type === 'CLEAR_CACHES') {
    event.waitUntil(clearAll().then(function () {
      if (event.source && event.source.postMessage) event.source.postMessage({ type: 'CLEARED' });
    }));
  } else if (data.type === 'SESSION' && typeof data.user === 'string' && data.user) {
    event.waitUntil(adoptUser(data.user).catch(function () {}));
  } else if (data.type === 'WARM') {
    event.waitUntil(warm(data).then(function () {
      if (event.source && event.source.postMessage) event.source.postMessage({ type: 'WARMED' });
    }));
  } else if (data.type === 'QUIET_STATUS') {
    event.waitUntil(readMeta().then(function (meta) { reply(quietStatus(meta, data.user)); }));
  } else if (data.type === 'QUIET_POLICY') {
    event.waitUntil(setQuietPolicy(data).then(reply, function () { reply({ ok: false }); }));
  } else if (data.type === 'QUIET_INVALIDATE') {
    event.waitUntil(withMeta(function (meta) {
      if (meta.user !== data.user || !meta.quiet?.enabled) return;
      epoch += 1;
      meta.pages = {};
      meta.quiet.lastSyncedAt = null;
      return caches.delete(PAGES);
    }).then(readMeta).then(function (meta) { reply(quietStatus(meta, data.user)); }, function () { reply({ ok: false }); }));
  } else if (data.type === 'QUIET_REFRESH') {
    var refresh = enqueueQuietRefresh(data);
    if (data.afterWrite && event.ports?.[0]) event.ports[0].postMessage({ queued: true });
    event.waitUntil(refresh.then(reply));
  } else if (data.type === 'QUIET_SYNC_FALLBACK') {
    event.waitUntil(readMeta().then(function (meta) {
      if (!meta.user || !meta.quiet?.enabled || !event.source?.url) return { ok: false };
      var url = new URL(event.source.url);
      if (url.origin !== self.location.origin || !pageKey(url)) return { ok: false };
      var base = DEV ? '/pb-preview' : '';
      var pages = [...new Set([url.pathname + url.search, ...QUIET_PRIMARY.map(function (path) { return base + path; })])];
      return enqueueQuietRefresh({ user: meta.user, pages: pages, required: pages });
    }).then(reply, function () { reply({ ok: false }); }));
  } else if (data.type === 'QUIET_RESUME_FALLBACK') {
    var changed = false;
    event.waitUntil(withMeta(function (meta) {
      if (!meta.user || !meta.quiet?.enabled) return;
      meta.quiet.liveUntil = Date.now() + QUIET_LIVE_MS;
      changed = true;
    }).then(function () { reply({ ok: changed }); }, function () { reply({ ok: false }); }));
  }
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;
  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  var path = url.pathname;

  // These files never reach the database. Signed-in GETs are checked before
  // anything can hit the network, including Next's RSC/prefetch requests.
  if (path === '/sw.js' || path === '/ping.txt') return;
  if (path.indexOf('/_next/static/') === 0 || path.indexOf('/icons/') === 0 || path === '/manifest.json'
    || path === '/favicon.ico' || path.indexOf('/sounds/') === 0 || path.indexOf('/cursors/') === 0
    || path === QUIET_URL || path === OFFLINE_URL) {
    event.respondWith(cacheFirst(event, url));
    return;
  }
  if (request.mode === 'navigate' && /^\/auth(?:\/|$)/.test(path)) {
    event.respondWith(handleNavigation(event));
    return;
  }
  if (request.mode === 'navigate' && path.indexOf('/api/auth/callback/') === 0) return;

  event.respondWith(readMeta().then(function (meta) {
    if (!quietPaused(meta)) {
      return request.mode === 'navigate' && path.indexOf('/api/') !== 0 ? handleNavigation(event, meta.quiet?.enabled) : fetch(request);
    }
    if (request.mode === 'navigate') return quietNavigation(url, meta.user);
    if (path.indexOf('/api/auth/') === 0 && event.clientId) {
      return self.clients.get(event.clientId).then(function (client) {
        // Sign-in pages can complete their own session flow. An app page
        // waiting on a session hook cannot bypass its deliberate pause.
        if (client && /^\/auth(?:\/|$)/.test(new URL(client.url).pathname)) return fetch(request);
        return new Response(null, { status: 503 });
      });
    }
    // The router handles a failed Flight request by navigating to the
    // document. Serving HTML as Flight would poison its client cache.
    return Response.error();
  }));
});
