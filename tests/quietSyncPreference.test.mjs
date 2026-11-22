import assert from 'node:assert/strict';
import vm from 'node:vm';
import { test } from 'node:test';
import { MessageChannel } from 'node:worker_threads';
import { buildSync } from 'esbuild';

const source = buildSync({
  entryPoints: ['src/lib/offline/quietSync.ts'], bundle: true, write: false, format: 'cjs',
}).outputFiles[0].text;

test('Quiet Sync can message an active registration after a hard reload without a controller', async () => {
  const cjs = { exports: {} };
  const order = [];
  const active = {
    postMessage(command, [port]) {
      assert.equal(command.type, 'QUIET_REFRESH');
      port.postMessage({ queued: true });
      port.postMessage({ ok: true, enabled: true });
      port.close();
    },
  };
  vm.runInNewContext(source, {
    module: cjs, exports: cjs.exports, MessageChannel, clearTimeout,
    window: { setTimeout },
    navigator: { serviceWorker: {
      controller: null,
      getRegistration: async () => ({ active }),
      ready: new Promise(() => {}),
    } },
  });
  const result = await cjs.exports.quietWorkerCommand({ type: 'QUIET_REFRESH', user: 'first' }, () => order.push('queued'));
  order.push('complete');
  assert.equal(result.ok, true);
  assert.equal(result.enabled, true);
  assert.deepEqual(order, ['queued', 'complete']);
});

test('Quiet Sync defaults off and keeps its preference on this device for the same owner', () => {
  const values = new Map();
  const now = 40_000_000;
  const mount = owner => {
    const cjs = { exports: {} };
    vm.runInNewContext(source, {
      module: cjs,
      exports: cjs.exports,
      document: { querySelector: () => ({ content: owner + '|build' }) },
      localStorage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) },
      window: { dispatchEvent() {} },
      Event,
      Date: { now: () => now },
    });
    return cjs.exports;
  };
  const first = mount('first');
  assert.equal(first.quietSyncIsEnabled(), false);
  first.writeQuietPreference('first', { enabled: true });
  const nextPage = mount('first');
  assert.equal(nextPage.quietSyncIsPaused(), true);
  nextPage.writeQuietPreference('first', { liveUntil: now + 1 });
  assert.equal(mount('first').quietSyncIsPaused(), true);
  assert.equal(mount('second').quietSyncIsEnabled(), false);
  nextPage.writeQuietPreference('first', { enabled: false });
  assert.equal(mount('first').quietSyncIsEnabled(), false);
});

test('Quiet Sync can confirm a snapshot if its original message port never replies', async () => {
  const cjs = { exports: {} };
  const serviceWorker = new EventTarget();
  const result = { ok: true, lastSyncedAt: 1_800_000_000_000, version: '4.54.1' };
  serviceWorker.controller = {
    postMessage(command, [port]) {
      serviceWorker.dispatchEvent(new MessageEvent('message', { data: {
        type: 'QUIET_REFRESH_RESULT', requestId: command.requestId + 1, result: { ok: false },
      } }));
      serviceWorker.dispatchEvent(new MessageEvent('message', { data: {
        type: 'QUIET_REFRESH_RESULT', requestId: command.requestId, result,
      } }));
      port.close();
    },
  };
  vm.runInNewContext(source, {
    module: cjs, exports: cjs.exports, MessageChannel, clearTimeout,
    window: { setTimeout }, navigator: { serviceWorker },
  });
  assert.deepEqual(await cjs.exports.quietWorkerCommand({ type: 'QUIET_REFRESH', user: 'first' }), result);
});

test('a network hard reload schedules all saved pages and an ordinary cached reload stays local', async () => {
  const cjs = { exports: {} };
  vm.runInNewContext(source, { module: cjs, exports: cjs.exports });
  const commands = [];
  const active = { postMessage(command, [port]) { commands.push(command); port.postMessage({ ok: true }); port.close(); } };
  const simulate = ({ workerStart = 0, controller = null, enabled = true, pair = null } = {}) => {
    const window = {};
    vm.runInNewContext(cjs.exports.QUIET_SYNC_RELOAD_PREINIT, {
      window, MessageChannel, setTimeout, clearTimeout,
      document: { currentScript: { getAttribute: name => ({ 'data-pb-quiet-owner': 'first', 'data-pb-quiet-build': 'build-new', 'data-pb-quiet-pair': pair })[name] } },
      navigator: { serviceWorker: { controller, getRegistration: async () => ({ active }) } },
      performance: { getEntriesByType: () => [{ type: 'reload', workerStart }] },
      localStorage: { getItem: () => JSON.stringify({ enabled }) },
      location: { pathname: pair ? '/partner/dashboard' : '/budgets/plan', search: '?year=2026' },
    });
    return window.pebbleQuietReload?.result;
  };
  assert.equal(simulate({ workerStart: 25 }), undefined);
  assert.equal(simulate({ controller: active }), undefined);
  assert.equal(simulate({ enabled: false }), undefined);
  assert.equal((await simulate()).ok, true);
  assert.equal(commands[0].afterWrite, true);
  assert.equal(commands[0].reloadBuild, 'build-new');
  assert.equal(commands[0].pages.length, 11);
  assert.equal(commands[0].pages[0], '/budgets/plan?year=2026');
  assert.equal((await simulate({ pair: 'partner-pair' })).ok, true);
  assert.equal(commands[1].type, 'QUIET_PARTNER_REFRESH');
  assert.equal(commands[1].pair, 'partner-pair');
});

test('cached HTML paints the document owner’s Quiet Sync status before hydration', () => {
  const cjs = { exports: {} };
  vm.runInNewContext(source, { module: cjs, exports: cjs.exports });
  const now = 40_000_000;
  const values = {
    'pebble-quiet-sync:v1:paused': JSON.stringify({ enabled: true, liveUntil: now - 1 }),
    'pebble-quiet-sync:v1:live': JSON.stringify({ enabled: true, liveUntil: now + 1 }),
    'pebble-quiet-sync:v1:off': JSON.stringify({ enabled: false, liveUntil: now + 1 }),
  };
  const boot = (owner, onLine = true) => {
    const attrs = new Map();
    vm.runInNewContext(cjs.exports.QUIET_SYNC_HEADER_PREINIT, {
      document: {
        currentScript: { getAttribute: () => owner },
        documentElement: { setAttribute: (key, value) => attrs.set(key, value) },
      },
      localStorage: { getItem: key => values[key] ?? null },
      navigator: { onLine },
      Date: { now: () => now },
    });
    return attrs.get('data-pb-quiet-startup');
  };
  assert.equal(boot('paused'), 'paused');
  assert.equal(boot('live'), 'paused');
  assert.equal(boot('paused', false), 'offline');
  assert.equal(boot('off'), undefined);
  assert.equal(boot('other'), undefined);
});


test('automatic sync is confined to a fresh launch and sign-in', () => {
  const cjs = { exports: {} };
  vm.runInNewContext(source, { module: cjs, exports: cjs.exports, URL });
  const detect = cjs.exports.isQuietSyncLaunch;
  const origin = 'https://pebble.example';
  assert.equal(detect({ type: 'navigate' }, '', origin), true);
  assert.equal(detect({ type: 'navigate' }, 'https://elsewhere.example/', origin), true);
  assert.equal(detect({ type: 'navigate' }, origin + '/auth/sign-in', origin), true);
  assert.equal(detect({ type: 'navigate' }, origin + '/goals', origin), false);
  assert.equal(detect({ type: 'reload' }, '', origin), false);
  assert.equal(detect({ type: 'back_forward' }, '', origin), false);
  assert.equal(detect({ type: 'back_forward' }, '', origin, { activation: { navigationType: 'traverse', from: {} } }), false);
  assert.equal(detect({ type: 'back_forward' }, origin + '/reports', origin, { activation: { navigationType: 'traverse', from: null } }), true);
  assert.equal(detect({ type: 'reload' }, '', origin, { wasDiscarded: true }), true);
  assert.equal(detect(undefined, '', origin), false);
});

test('an active browsing catch-up is due eight hours after the last successful sync', () => {
  const cjs = { exports: {} };
  vm.runInNewContext(source, { module: cjs, exports: cjs.exports });
  const lastSyncedAt = 1_800_000_000_000;
  const eightHours = 8 * 60 * 60 * 1000;
  const { isQuietSyncDue } = cjs.exports;
  assert.equal(isQuietSyncDue(lastSyncedAt, lastSyncedAt + eightHours - 1), false);
  assert.equal(isQuietSyncDue(lastSyncedAt, lastSyncedAt + eightHours), true);
  assert.equal(isQuietSyncDue(null, lastSyncedAt), true);
});
