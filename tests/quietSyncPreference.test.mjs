import assert from 'node:assert/strict';
import vm from 'node:vm';
import { test } from 'node:test';
import { buildSync } from 'esbuild';

const source = buildSync({
  entryPoints: ['src/lib/offline/quietSync.ts'], bundle: true, write: false, format: 'cjs',
}).outputFiles[0].text;

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
  nextPage.writeQuietPreference('first', { liveUntil: now + nextPage.QUIET_SYNC_LIVE_PERIOD });
  assert.equal(mount('first').quietSyncIsPaused(), false);
  assert.equal(mount('second').quietSyncIsEnabled(), false);
  nextPage.writeQuietPreference('first', { enabled: false });
  assert.equal(mount('first').quietSyncIsEnabled(), false);
  assert.equal(first.quietSyncDue(now, now - first.QUIET_SYNC_INTERVAL, now - first.QUIET_SYNC_RETRY_INTERVAL), true);
  assert.equal(first.quietSyncDue(now, now - first.QUIET_SYNC_INTERVAL, now), false);
});
