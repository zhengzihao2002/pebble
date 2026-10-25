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
var PRECACHE = [OFFLINE_URL, '/manifest.json', '/icons/icon-192.png', '/icons/apple-touch-icon.png'];

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
      var changed = (meta.user && meta.user !== ctx.user) || (meta.build && meta.build !== ctx.build);
      return (changed ? caches.delete(PAGES).then(function () { meta.pages = {}; }) : Promise.resolve()).then(function () {
        return caches.open(PAGES);
      }).then(function (cache) {
        return cache.put(key, new Response(buf, { status: 200, headers: headers }));
      }).then(function () {
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

function handleNavigation(event) {
  var request = event.request;
  var url = new URL(request.url);

  // Sign-in and the other auth pages: never stored. Reaching one while online
  // means the session is gone (sign-out, expiry, deleted account), so the
  // saved pages go with it.
  if (url.pathname.indexOf('/auth/') === 0 || url.pathname === '/auth') {
    return fetch(request).then(function (res) {
      // (/auth/privacy is a public page a signed-in person can open: it says
      // nothing about the session, so it keeps what is saved.)
      if (res.status === 200 && res.type === 'basic' && url.pathname.indexOf('/auth/privacy') !== 0) event.waitUntil(clearPrivate());
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
    var timeout = new Promise(function (resolve) { setTimeout(function () { resolve(null); }, NAV_TIMEOUT_MS); });
    return Promise.race([network, timeout]).then(function (res) {
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
    return pages.reduce(function (chain, p) { return chain.then(function () { return warmPage(p); }); }, Promise.resolve());
  });
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
  }
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;
  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  var path = url.pathname;

  // Never intercepted: the worker itself, the reachability probe (it must see
  // the real network), API and auth endpoints, Server Actions.
  if (path === '/sw.js' || path === '/ping.txt') return;
  if (path.indexOf('/api/') === 0 || request.headers.has('next-action')) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(event));
    return;
  }

  if (path.indexOf('/_next/static/') === 0 || path.indexOf('/icons/') === 0 || path === '/manifest.json' || path === '/favicon.ico' || path.indexOf('/sounds/') === 0) {
    event.respondWith(cacheFirst(event, url));
  }
  // Everything else - client-navigation (RSC) requests, prefetches, data -
  // goes straight to the network.
});
