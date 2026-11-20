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
  let expired = false;
  let blockedPath;
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
        if (url.pathname.endsWith('.ico') || url.pathname.endsWith('.png') || url.pathname.endsWith('.json') || url.pathname.endsWith('.html')) {
          return basic('static');
        }
        if (expired) return Object.defineProperties(basic('Sign in'), {
          redirected: { value: true }, url: { value: new URL('/auth/sign-in', origin).href },
        });
        return basic(`<meta name="pebble-session" content="${workerUser}|${build}"><main>${url.pathname} ${build}</main>`);
      },
      self: {
        location: workerURL,
        skipWaiting: async () => {},
        clients: { claim: async () => {}, get: async () => ({ url: new URL('/dashboard', origin).href }) },
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
        ports: [{ postMessage(value) { reply = value; } }],
        ...args,
      };
      handles.get(type)(event);
      const result = await response;
      await Promise.all(waits);
      return type === 'message' && reply ? JSON.parse(JSON.stringify(reply)) : result;
    };
  }
  let fire = boot();
  return {
    requests,
    boot() { fire = boot(); },
    advance(ms) { now += ms; },
    useBuild(next) { build = next; },
    useUser(next) { workerUser = next; },
    expire() { expired = true; },
    block(path) { blockedPath = path; },
    install() { return fire('install'); },
    message(data) { return fire('message', { data }); },
    fetch(path, { mode = 'navigate', method = 'GET' } = {}) {
      return fire('fetch', { request: { url: new URL(path, origin).href, mode, method, headers: new Headers() }, clientId: 'tab' });
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
  assert.equal(await worker.fetch('/transactions', { method: 'POST' }), undefined);
  await worker.message({ type: 'WARM', pages: ['/settings'] });
  assert.deepEqual(worker.requests, []);
});

test('the online window expires and the pause resumes without changing the preference', async () => {
  const worker = workerFixture();
  await save(worker);
  worker.requests.length = 0;

  await worker.message({ type: 'QUIET_RESUME_FALLBACK' });
  assert.equal((await worker.fetch('/reports', { mode: 'cors' })).status, 200);
  worker.useBuild('build-b');
  assert.match(await (await worker.fetch('/dashboard')).text(), /build-b/);
  assert.deepEqual(worker.requests, ['/reports', '/dashboard']);
  worker.advance(20 * 60 * 1000 + 1);
  const status = await worker.message({ type: 'QUIET_STATUS', user });
  assert.equal(status.enabled, true);
  assert.equal(status.liveUntil, null);
  assert.equal(status.build, 'build-a');
  assert.match(await (await worker.fetch('/reports')).text(), /build-a/);
  assert.equal((await worker.fetch('/reports', { mode: 'cors' })).type, 'error');
  assert.deepEqual(worker.requests, ['/reports', '/dashboard']);
});

test('refreshes are shared, only complete batches update their timestamp, and partial batches leave it alone', async () => {
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
  assert.equal(partial.lastSyncedAt, one.lastSyncedAt);

  worker.useBuild('build-b');
  worker.block('/reports');
  const failed = await worker.message(full);
  assert.equal(failed.ok, false);
  assert.equal(failed.lastSyncedAt, one.lastSyncedAt);
  assert.match(await (await worker.fetch('/dashboard')).text(), /build-a/);
  worker.block(undefined);
  const ready = await worker.message(full);
  assert.equal(ready.ok, true);
  assert.equal(ready.build, 'build-b');
  assert.match(await (await worker.fetch('/dashboard')).text(), /build-b/);
  assert.match(await (await worker.fetch('/reports')).text(), /build-b/);
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
