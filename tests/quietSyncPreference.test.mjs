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

test('an active browsing catch-up is due 24 hours after the last successful sync', () => {
  const cjs = { exports: {} };
  vm.runInNewContext(source, { module: cjs, exports: cjs.exports });
  const lastSyncedAt = 1_800_000_000_000;
  const day = 24 * 60 * 60 * 1000;
  const { isQuietSyncDue } = cjs.exports;
  assert.equal(isQuietSyncDue(lastSyncedAt, lastSyncedAt + day - 1), false);
  assert.equal(isQuietSyncDue(lastSyncedAt, lastSyncedAt + day), true);
  assert.equal(isQuietSyncDue(null, lastSyncedAt), true);
});
