import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const origin = 'https://pebble.example';
const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const workerURL = new URL('/sw.js', origin);
const asURL = input => new URL(typeof input === 'string' ? input : input.url, origin).href;

function workerFixture() {
  const entries = new Map();
  const requests = [];
  let workerUser = 'user-a';
  let build = 'build-a';
  let version = '4.54.0';
  let asset = '';
  let partnerPair;
  let partnerAccess = 'open';
  let revision = 'snapshot-before-write';
  let expired = false;
  let online = true;
  let blockedPath;
  let hold;
  let now = 10_000_000;
  const caches = {
    async open(name) {
      if (!entries.has(name)) entries.set(name, new Map());
      const store = entries.get(name);
      return {
        async match(input) { return store.get(asURL(input))?.clone(); },
        async put(input, response) { store.set(asURL(input), response.clone()); },
        async delete(input) { return store.delete(asURL(input)); },
      };
    },
    async keys() { return [...entries.keys()]; },
    async delete(name) { return entries.delete(name); },
  };
  const basic = (body, init = {}) => Object.defineProperty(new Response(body, { headers: { 'content-type': 'text/html' }, ...init }), 'type', { value: 'basic' });

  function boot() {
    const handles = new Map();
    runInNewContext(source, {
      URL, Headers, Response, TextDecoder, AbortController, caches,
      setTimeout, clearTimeout, Date: { now: () => now },
      fetch: async (input) => {
        const url = new URL(asURL(input));
        requests.push(url.pathname);
        if (url.pathname === blockedPath) return basic('Unavailable', { status: 503 });
        if (url.pathname === '/quiet-sync.html') return basic('<main>Saved pages only</main>');
        if (url.pathname === '/offline.html') return basic('<main>Offline fallback</main>');
        if (url.pathname.endsWith('.ico') || url.pathname.endsWith('.png') || url.pathname.endsWith('.json') || url.pathname.endsWith('.html')) {
          return basic('static');
        }
        if (expired) return Object.defineProperties(basic('Sign in'), {
          redirected: { value: true }, url: { value: new URL('/auth/sign-in', origin).href },
        });
        const marker = url.pathname.startsWith('/partner/')
          ? partnerPair && partnerAccess && `<meta name="pebble-partner-session" content="${workerUser}|${partnerPair}|${build}|${partnerAccess}|${now + 8 * 60 * 60 * 1000}">`
          : `<meta name="pebble-session" content="${workerUser}|${build}">`;
        const response = url.pathname.startsWith('/_next/static/')
          ? new Response('fixture asset', { headers: { 'content-type': 'application/javascript' } })
          : basic(`<meta content="${version}" name="pebble-release">${marker || ''}<main>${url.pathname} ${build} ${revision} ${asset}</main>`);
        if (hold?.path === url.pathname) {
          const next = hold;
          hold = undefined;
          next.started();
          await next.released;
        }
        return response;
      },
      self: {
        location: workerURL,
        navigator: { get onLine() { return online; } },
        skipWaiting: async () => {},
        clients: { claim: async () => {}, matchAll: async () => [], get: async () => ({ url: new URL('/dashboard', origin).href }) },
        addEventListener(type, fn) { handles.set(type, fn); },
      },
    });
    return async (type, args = {}) => {
      const waits = [];
      let reply;
      let response;
      const event = {
        waitUntil(value) { waits.push(value); },
        respondWith(value) { response = Promise.resolve(value); },
        ports: [{ postMessage(value) { reply = value; args.onMessage?.(value); } }],
        ...args,
      };
      handles.get(type)(event);
      const result = await response;
      for (const wait of waits) await wait;
      return type === 'message' && reply ? JSON.parse(JSON.stringify(reply)) : result;
    };
  }
  let fire = boot();
  return {
    requests,
    boot() { fire = boot(); },
    advance(ms) { now += ms; },
    useBuild(next) { build = next; },
    useVersion(next) { version = next; },
    useAsset(path) { asset = path; },
    usePartner(pair, access = 'open') { partnerPair = pair; partnerAccess = access; },
    useRevision(next) { revision = next; },
    useUser(next) { workerUser = next; },
    expire() { expired = true; },
    disconnect() { online = false; },
    connect() { online = true; },
    savedCaches() { return [...entries.keys()]; },
    block(path) { blockedPath = path; },
    holdNext(path) {
      let started, release;
      const ready = new Promise(resolve => { started = resolve; });
      const released = new Promise(resolve => { release = resolve; });
      hold = { path, started, released };
      return { ready, release };
    },
    install() { return fire('install'); },
    message(data, onMessage, onClientMessage) {
      return fire('message', { data: data.type === 'QUIET_STATUS' ? { onDemand: true, ...data } : data, onMessage,
        source: { id: 'tab', postMessage: onClientMessage ?? (() => {}) } });
    },
    fetch(path, { mode = 'navigate', method = 'GET', headers, body, clientId = 'tab' } = {}) {
      const request = { url: new URL(path, origin).href, mode, method, headers: new Headers(headers) };
      request.clone = () => new Request(request.url, { method, headers, body });
      return fire('fetch', { request, clientId });
    },
  };
}

const user = 'user-a';
const pages = ['/dashboard', '/reports'];

async function save(worker) {
  await worker.install();
  await worker.message({ type: 'SESSION', user });
  const refresh = await worker.message({ type: 'QUIET_REFRESH', user, pages });
  assert.equal(refresh.ok, true);
  assert.deepEqual(refresh.available.sort(), pages);
  await worker.message({ type: 'QUIET_POLICY', user, enabled: true });
  return refresh;
}

test('paused GET, RSC, and account lookups stay local even after a worker restart', async () => {
  const worker = workerFixture();
  await save(worker);
  worker.boot();
  worker.requests.length = 0;

  for (const path of ['/reports', '/dashboard?period=month']) {
    assert.match(await (await worker.fetch(path)).text(), /build-a/);
  }
  for (const path of ['/insights', '/partner/reports']) {
    assert.match(await (await worker.fetch(path)).text(), /Saved pages only/);
  }
  assert.equal((await worker.fetch('/reports?_rsc=1', { mode: 'cors' })).type, 'error');
  assert.equal((await worker.fetch('/api/auth/get-session', { mode: 'cors' })).status, 503);
  assert.equal((await worker.fetch('/transactions', { method: 'POST' })).status, 403);
  await worker.message({ type: 'WARM', pages: ['/settings'] });
  assert.deepEqual(worker.requests, []);
});

test('quiet reads stay cached even if an older client requests a timed window', async () => {
  const worker = workerFixture();
  await save(worker);
  worker.requests.length = 0;
  await worker.message({ type: 'QUIET_POLICY', user, enabled: true, liveUntil: Number.MAX_SAFE_INTEGER });
  await worker.message({ type: 'QUIET_POLICY', user, enabled: true, afterSave: true });
  await worker.message({ type: 'QUIET_POLICY', user, enabled: true, keepLonger: true });
  await worker.message({ type: 'QUIET_RESUME_FALLBACK' });
  assert.equal((await worker.message({ type: 'QUIET_STATUS', user })).enabled, true);
  assert.equal((await worker.message({ type: 'QUIET_STATUS', user, onDemand: false })).enabled, false);
  assert.equal((await worker.fetch('/reports', { mode: 'cors' })).type, 'error');
  assert.match(await (await worker.fetch('/dashboard')).text(), /snapshot-before-write/);
  assert.deepEqual(worker.requests, []);

  await worker.message({ type: 'QUIET_POLICY', user, enabled: false });
  assert.equal((await worker.fetch('/reports', { mode: 'cors' })).status, 200);
  assert.deepEqual(worker.requests, ['/reports']);
});

test('a save refresh publishes its snapshot without allowing live navigation', async () => {
  const worker = workerFixture();
  await save(worker);
  worker.requests.length = 0;
  worker.useRevision('confirmed-save');
  const hold = worker.holdNext('/goals');
  const refreshed = worker.message({ type: 'QUIET_REFRESH', user, pages: ['/goals'], partial: true, afterWrite: true });
  await hold.ready;
  assert.equal((await worker.fetch('/reports', { mode: 'cors' })).type, 'error');
  assert.match(await (await worker.fetch('/reports')).text(), /snapshot-before-write/);
  hold.release();
  assert.equal((await refreshed).ok, true);
  worker.boot();
  assert.match(await (await worker.fetch('/goals')).text(), /confirmed-save/);
  assert.deepEqual(worker.requests, ['/goals']);
});

test('a saved goal becomes available in local browsing even if a related Insights refresh fails', async () => {
  const worker = workerFixture();
  await save(worker);
  worker.useRevision('confirmed-goal');
  worker.block('/insights');
  const fresh = await worker.message({
    type: 'QUIET_REFRESH', user, pages: ['/goals', '/insights'], required: ['/goals'], partial: true, afterWrite: true,
  });
  assert.equal(fresh.ok, true);
  worker.advance(120_001);
  worker.requests.length = 0;
  assert.match(await (await worker.fetch('/goals')).text(), /confirmed-goal/);
  assert.deepEqual(worker.requests, []);
});

test('refreshes are shared and successful full and partial batches update their timestamp', async () => {
  const worker = workerFixture();
  const first = await save(worker);
  worker.advance(60_000);
  worker.requests.length = 0;
  const full = { type: 'QUIET_REFRESH', user, pages };
  const [one, two] = await Promise.all([worker.message(full), worker.message(full)]);
  assert.equal(one.ok, true);
  assert.deepEqual(two, one);
  assert.deepEqual(worker.requests, pages);
  assert.ok(one.lastSyncedAt > first.lastSyncedAt);
  worker.advance(60_000);
  const partial = await worker.message({ type: 'QUIET_REFRESH', user, pages: ['/dashboard'], partial: true });
  assert.equal(partial.ok, true);
  assert.ok(partial.lastSyncedAt > one.lastSyncedAt);

  worker.useBuild('build-b');
  worker.block('/reports');
  const failed = await worker.message(full);
  assert.equal(failed.ok, false);
  assert.equal(failed.lastSyncedAt, partial.lastSyncedAt);
  assert.match(await (await worker.fetch('/dashboard')).text(), /build-a/);
  worker.block(undefined);
  const ready = await worker.message(full);
  assert.equal(ready.ok, true);
  assert.equal(ready.build, 'build-b');
  assert.match(await (await worker.fetch('/dashboard')).text(), /build-b/);
  assert.match(await (await worker.fetch('/reports')).text(), /build-b/);
});

test('a sync replies with the new build timestamp while its assets are still downloading', async () => {
  const worker = workerFixture();
  const first = await save(worker);
  worker.advance(60_000);
  worker.useBuild('build-b');
  worker.useVersion('4.54.1');
  const asset = '/_next/static/chunks/build-b.js';
  worker.useAsset(asset);
  const hold = worker.holdNext(asset);
  let reply;
  let clientReply;
  const sync = worker.message({ type: 'QUIET_REFRESH', user, pages, requestId: 9 }, response => { reply = response; }, response => { clientReply = response; });

  try {
    await hold.ready;
    const persisted = await worker.message({ type: 'QUIET_STATUS', user });
    assert.equal(reply?.ok, true);
    assert.equal(reply.build, 'build-b');
    assert.equal(reply.version, '4.54.1');
    assert.equal(persisted.version, reply.version);
    assert.equal(persisted.lastSyncedAt, reply.lastSyncedAt);
    assert.equal(clientReply?.requestId, 9);
    assert.equal(clientReply.result.lastSyncedAt, reply.lastSyncedAt);
    assert.ok(reply.lastSyncedAt > first.lastSyncedAt);
    assert.match(await (await worker.fetch('/reports')).text(), /build-b/);
  } finally {
    hold.release();
    await sync;
  }
});

test('a hard refresh syncs the new build before a following normal refresh can use older pages', async () => {
  const worker = workerFixture();
  const first = await save(worker);
  worker.advance(60_000);
  worker.useBuild('build-b');
  worker.useVersion('4.54.2');
  const hold = worker.holdNext('/reports');
  const sync = worker.message({ type: 'QUIET_REFRESH', user, pages, afterWrite: true, reloadBuild: 'build-b' });
  let navigated = false;
  const next = worker.fetch('/dashboard').then(response => { navigated = true; return response.text(); });
  try {
    await hold.ready;
    assert.equal(navigated, false);
  } finally { hold.release(); }
  const result = await sync;
  assert.equal(result.ok, true);
  assert.equal(result.version, '4.54.2');
  assert.ok(result.lastSyncedAt > first.lastSyncedAt);
  assert.match(await next, /build-b/);
});

test('a failed new-build reload cannot silently return to an earlier saved build', async () => {
  const worker = workerFixture();
  await save(worker);
  const command = { type: 'QUIET_REFRESH', user, pages };
  const mixed = await worker.message({ ...command, afterWrite: true, reloadBuild: 'build-b' });
  assert.equal(mixed.ok, false);
  worker.boot();
  assert.match(await (await worker.fetch('/dashboard')).text(), /Saved pages only/);
  worker.useBuild('build-b');
  assert.equal((await worker.message(command)).ok, true);
  assert.match(await (await worker.fetch('/dashboard')).text(), /build-b/);
});

test('a write refresh waits behind a pre-write sync, gates affected reads, and replaces stale query variants', async () => {
  const worker = workerFixture();
  await save(worker);
  await worker.message({ type: 'QUIET_REFRESH', user, pages: ['/reports?period=month'], partial: true });
  worker.requests.length = 0;

  const hold = worker.holdNext('/reports');
  const preWrite = worker.message({ type: 'QUIET_REFRESH', user, pages: ['/reports'] });
  await hold.ready;
  worker.useRevision('confirmed-edit');
  let queued;
  const ack = new Promise(resolve => { queued = resolve; });
  const afterWrite = worker.message({ type: 'QUIET_REFRESH', user, pages: ['/reports'], afterWrite: true }, result => {
    if (result.queued) queued();
  });
  await ack;
  let settled = false;
  const report = worker.fetch('/reports?period=month').then(response => { settled = true; return response.text(); });

  assert.match(await (await worker.fetch('/dashboard')).text(), /snapshot-before-write/);
  assert.equal(settled, false);
  hold.release();
  assert.equal((await preWrite).ok, true);
  const saved = await afterWrite;
  assert.equal(saved.ok, true);
  assert.equal(saved.available.includes('/reports?period=month'), false);
  assert.match(await report, /confirmed-edit/);
  assert.deepEqual(worker.requests, ['/reports', '/reports']);
});

test('a full sync replaces stale query variants without enabling network navigation', async () => {
  const worker = workerFixture();
  await save(worker);
  await worker.message({ type: 'QUIET_REFRESH', user, pages: ['/reports?period=month'], partial: true });
  worker.useRevision('manually-synced');
  worker.requests.length = 0;

  const result = await worker.message({ type: 'QUIET_REFRESH', user, pages });
  assert.equal(result.ok, true);
  assert.equal(result.available.includes('/reports?period=month'), false);
  assert.match(await (await worker.fetch('/reports?period=month')).text(), /manually-synced/);
  assert.deepEqual(worker.requests, pages);
});

test('a cached page waits for successive writes on its path and resumes when a write refresh fails', async () => {
  const worker = workerFixture();
  await save(worker);
  worker.requests.length = 0;

  const write = { type: 'QUIET_REFRESH', user, pages: ['/reports'], afterWrite: true, partial: true };
  worker.useRevision('first-edit');
  const firstHeld = worker.holdNext('/reports');
  const first = worker.message(write);
  await firstHeld.ready;
  worker.useRevision('second-edit');
  const secondHeld = worker.holdNext('/reports');
  const second = worker.message(write);
  let settled = false;
  const report = worker.fetch('/reports').then(response => { settled = true; return response.text(); });
  firstHeld.release();
  await secondHeld.ready;
  assert.equal(settled, false);
  secondHeld.release();
  assert.equal((await first).ok, true);
  assert.equal((await second).ok, true);
  assert.match(await report, /second-edit/);

  worker.block('/reports');
  const failed = worker.message(write);
  const browser = worker.fetch('/reports');
  assert.equal((await failed).ok, false);
  assert.match(await (await browser).text(), /second-edit/);
  assert.deepEqual(worker.requests, ['/reports', '/reports', '/reports']);
});

test('different accounts and expired authentication clear saved pages and the pause', async () => {
  const worker = workerFixture();
  await save(worker);
  worker.useUser('user-b');
  await worker.message({ type: 'SESSION', user: 'user-b' });
  assert.equal((await worker.message({ type: 'QUIET_STATUS', user })).ok, false);
  assert.equal((await worker.message({ type: 'QUIET_STATUS', user: 'user-b' })).enabled, false);
  worker.useUser(user);
  const refresh = await worker.message({ type: 'QUIET_REFRESH', user, pages });
  assert.equal(refresh.ok, false);
  await worker.message({ type: 'SESSION', user });
  await save(worker);
  worker.expire();
  const expired = await worker.message({ type: 'QUIET_REFRESH', user, pages });
  assert.equal(expired.authExpired, true);
  assert.equal((await worker.message({ type: 'QUIET_STATUS', user })).ok, false);
});

test('a disconnected browser keeps the ordinary offline fallback while Quiet Sync is enabled', async () => {
  const worker = workerFixture();
  await save(worker);
  worker.requests.length = 0;
  worker.disconnect();
  assert.match(await (await worker.fetch('/dashboard')).text(), /snapshot-before-write/);
  assert.match(await (await worker.fetch('/insights')).text(), /Offline fallback/);
  assert.equal((await worker.fetch('/transactions', { method: 'POST' })).status, 403);
  assert.deepEqual(worker.requests, []);
});

test('paused Next actions require a fresh permit from the initiating tab', async () => {
  const worker = workerFixture();
  await save(worker);
  worker.requests.length = 0;
  const token = '12345678-1234-4321-8123-123456789abc';
  const action = { method: 'POST', headers: { 'Next-Action': 'fixture' }, body: JSON.stringify(['tag', { __pebbleQuietPost: token }]) };
  assert.equal((await worker.fetch('/settings', action)).status, 403);
  assert.deepEqual(await worker.message({ type: 'QUIET_PERMIT_POST', user, token }), { ok: true });
  assert.equal((await worker.fetch('/settings', { ...action, clientId: 'other-tab' })).status, 403);
  assert.deepEqual(worker.requests, []);
  assert.equal((await worker.fetch('/settings', action)).status, 200);
  assert.equal((await worker.fetch('/settings', action)).status, 403);
  assert.deepEqual(worker.requests, ['/settings']);

  await worker.message({ type: 'QUIET_POLICY', user, enabled: false });
  assert.equal((await worker.fetch('/settings', { method: 'POST', headers: action.headers })).status, 200);
});

test('Partner View stays local until its eight-hour deadline, then deletes the saved pages', async () => {
  const worker = workerFixture();
  const own = await save(worker);
  const pair = 'pair-one';
  worker.usePartner(pair);
  worker.useRevision('shared-spending');
  worker.advance(200);
  const saved = await worker.message({ type: 'QUIET_PARTNER_REFRESH', user, pair });
  assert.equal(saved.ok, true);
  assert.equal(saved.available.length, 10);
  assert.equal((await worker.message({ type: 'QUIET_STATUS', user })).lastSyncedAt, own.lastSyncedAt);
  assert.equal((await worker.message({ type: 'QUIET_STATUS', user, pair: 'pair-two' })).ok, false);
  worker.boot();
  worker.disconnect();
  worker.requests.length = 0;
  worker.advance(8 * 60 * 60 * 1000 - 1);
  assert.match(await (await worker.fetch('/partner/reports')).text(), /shared-spending/);
  assert.match(await (await worker.fetch('/reports')).text(), /snapshot-before-write/);
  worker.advance(1);
  assert.match(await (await worker.fetch('/partner/reports')).text(), /Saved pages only/);
  assert.ok(worker.savedCaches().every(cache => !cache.startsWith('pebble-partner-pages')));
  assert.deepEqual(worker.requests, []);

  worker.connect();
  worker.useRevision('fresh-shared-spending');
  assert.equal((await worker.message({ type: 'QUIET_PARTNER_REFRESH', user, pair })).ok, true);
  assert.match(await (await worker.fetch('/partner/reports')).text(), /fresh-shared-spending/);
});

test('partner sync replaces restricted data and drops access when the pairing is revoked', async () => {
  const worker = workerFixture();
  await save(worker);
  const pair = 'pair-one';
  const sync = { type: 'QUIET_PARTNER_REFRESH', user, pair };
  worker.usePartner(pair);
  worker.useRevision('before-restriction');
  assert.equal((await worker.message(sync)).ok, true);
  worker.advance(1000);
  worker.usePartner(pair, 'restricted');
  worker.useRevision('filtered-view');
  assert.equal((await worker.message(sync)).ok, true);
  assert.match(await (await worker.fetch('/partner/reports')).text(), /filtered-view/);
  worker.usePartner(pair, null);
  assert.equal((await worker.message(sync)).accessDenied, true);
  assert.match(await (await worker.fetch('/partner/reports')).text(), /Saved pages only/);
  assert.ok(worker.savedCaches().every(cache => !cache.startsWith('pebble-partner-pages')));
  assert.match(await (await worker.fetch('/reports')).text(), /snapshot-before-write/);
});

test('leaving Partner View or changing the saved owner removes the partner snapshots', async () => {
  const worker = workerFixture();
  await save(worker);
  const pair = 'pair-one';
  worker.usePartner(pair);
  const sync = { type: 'QUIET_PARTNER_REFRESH', user, pair };
  assert.equal((await worker.message(sync)).ok, true);
  await worker.message({ type: 'QUIET_PARTNER_CLEAR', user });
  assert.match(await (await worker.fetch('/partner/reports')).text(), /Saved pages only/);
  assert.equal((await worker.message(sync)).ok, true);
  await worker.message({ type: 'SESSION', user: 'user-b' });
  assert.equal((await worker.message({ type: 'QUIET_STATUS', user, pair })).ok, false);
  assert.ok(worker.savedCaches().every(cache => !cache.startsWith('pebble-partner-pages')));
});

test('a normal Partner View refresh waits for the new build started by a hard refresh', async () => {
  const worker = workerFixture();
  await save(worker);
  const pair = 'pair-one';
  worker.usePartner(pair);
  const command = { type: 'QUIET_PARTNER_REFRESH', user, pair };
  assert.equal((await worker.message(command)).ok, true);
  worker.useBuild('build-b');
  const hold = worker.holdNext('/partner/reports');
  const sync = worker.message({ ...command, reloadBuild: 'build-b' });
  let navigated = false;
  const next = worker.fetch('/partner/dashboard').then(response => { navigated = true; return response.text(); });
  try {
    await hold.ready;
    assert.equal(navigated, false);
  } finally { hold.release(); }
  assert.equal((await sync).ok, true);
  assert.match(await next, /build-b/);
  assert.match(await (await worker.fetch('/dashboard')).text(), /build-a/);
});
