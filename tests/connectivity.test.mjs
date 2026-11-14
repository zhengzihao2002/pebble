import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import vm from 'node:vm';

const source = buildSync({ entryPoints: ['src/lib/offline/connectivity.ts'], bundle: true,
  write: false, platform: 'node', format: 'cjs' }).outputFiles[0].text;
const settle = () => new Promise(resolve => setImmediate(resolve));
function fixture({ online = true, response = 'ok' } = {}) {
  const window = new EventTarget(), document = new EventTarget();
  document.hidden = false;
  const navigator = { onLine: online }, calls = [], intervals = new Map(), timeouts = new Map();
  let answer = response, nextId = 0;
  const compiled = { exports: {} };
  vm.runInNewContext(source, { module: compiled, exports: compiled.exports, window, document, navigator, AbortController,
    setInterval: fn => { const id = ++nextId; intervals.set(id, fn); return id; },
    clearInterval: id => intervals.delete(id),
    setTimeout: fn => { const id = ++nextId; timeouts.set(id, fn); return id; },
    clearTimeout: id => timeouts.delete(id),
    fetch: async (url, options) => {
      calls.push({ url, options });
      if (answer instanceof Error) throw answer;
      if (typeof answer === 'function') return answer(options);
      return { ok: true, text: async () => answer };
    },
  });
  return { ...compiled.exports, calls, window, document, navigator, intervals, timeouts,
    answer: value => { answer = value; }, tick: async () => { for (const fn of intervals.values()) fn(); await settle(); } };
}

test('a fresh server response beats a stale Chrome offline flag', async () => {
  const f = fixture({ online: false });
  assert.equal(await f.isServerReachable(), true);
  assert.equal(f.readOffline(), false);
  assert.match(f.calls[0].url, /^\/ping.txt\?t=\d+$/);
  assert.equal(f.calls[0].options.cache, 'no-store');
  assert.equal(f.calls[0].options.redirect, 'manual');
});

test('a failed check recovers on the retry timer without a browser online event', async () => {
  const f = fixture({ response: new Error('Network interrupted') });
  const notifications = [];
  const stop = f.subscribeConnectivity(() => notifications.push(f.readOffline()));
  await settle();
  assert.equal(f.readOffline(), true);
  f.answer('ok');
  await f.tick();
  assert.equal(f.readOffline(), false);
  assert.deepEqual(notifications, [true, false]);
  const calls = f.calls.length;
  await f.tick();
  assert.equal(f.calls.length, calls, 'healthy tabs do not keep pinging');
  stop();
  assert.equal(f.intervals.size, 0);
});

test('focus and returning to a visible tab verify recovery; hidden tabs do not poll', async () => {
  const f = fixture({ response: new Error('Network interrupted') });
  const stop = f.subscribeConnectivity(() => {});
  await settle();
  f.document.hidden = true;
  f.answer('ok');
  await f.tick();
  assert.equal(f.calls.length, 1);
  f.document.hidden = false;
  f.document.dispatchEvent(new Event('visibilitychange'));
  await settle();
  assert.equal(f.readOffline(), false);
  f.answer(new Error('Network interrupted'));
  f.window.dispatchEvent(new Event('focus'));
  await settle();
  assert.equal(f.readOffline(), true);
  stop();
  f.window.dispatchEvent(new Event('focus'));
  f.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(f.calls.length, 3, 'unmount removes shared event listeners');
});

test('a portal HTML response, redirect or timeout is not mistaken for Pebble', async () => {
  const f = fixture({ response: '<html>Sign in to Wi-Fi</html>' });
  assert.equal(await f.isServerReachable(), false);
  f.answer(async () => ({ ok: false, text: async () => 'ok' }));
  assert.equal(await f.isServerReachable(), false);
  f.answer(options => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('Aborted')));
  }));
  const pending = f.isServerReachable();
  for (const timeout of f.timeouts.values()) timeout();
  assert.equal(await pending, false);
  assert.equal(f.timeouts.size, 0);
});

test('multiple subscribers and simultaneous callers share a single in-flight check', async () => {
  const f = fixture();
  let resolve;
  f.answer(() => new Promise(done => { resolve = done; }));
  const first = f.isServerReachable(), second = f.isServerReachable();
  const stopOne = f.subscribeConnectivity(() => {}), stopTwo = f.subscribeConnectivity(() => {});
  assert.equal(first, second);
  assert.equal(f.calls.length, 1);
  assert.equal(f.intervals.size, 1);
  resolve({ ok: true, text: async () => 'ok' });
  await first;
  stopOne();
  assert.equal(f.intervals.size, 1);
  stopTwo();
  assert.equal(f.intervals.size, 0);
});
