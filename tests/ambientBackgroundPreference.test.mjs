import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
// Exercise the actual preference store in fresh runtimes, without app or DB imports.
const source = buildSync({
  entryPoints: ['src/store/usePebbleStore.ts'], bundle: true, write: false,
  platform: 'node', format: 'cjs', packages: 'external',
}).outputFiles[0].text;

function fixture(values = new Map()) {
  const compiled = { exports: {} };
  const localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
  vm.runInNewContext(source, {
    module: compiled, exports: compiled.exports, require, console,
    window: { localStorage },
  });
  return { ...compiled.exports, values };
}

function savedPreferences(state) {
  return new Map([['pebble-ui', JSON.stringify({ state, version: 2 })]]);
}

test('living background defaults OFF for new users and existing preferences', () => {
  assert.equal(fixture().usePebbleStore.getState().ambientBackground, false);
  const existing = fixture(savedPreferences({ locale: 'zh', showCardGlow: false }));
  assert.equal(existing.usePebbleStore.getState().ambientBackground, false);
  assert.equal(existing.usePebbleStore.getState().locale, 'zh');
  assert.equal(existing.usePebbleStore.getState().showCardGlow, false);
});

test('the rejected fluid-background preference cannot enable the new background', () => {
  const f = fixture(savedPreferences({ fluidBackground: true, locale: 'en' }));
  assert.equal(f.usePebbleStore.getState().ambientBackground, false);
});

test('explicit enable and disable survive fresh runtimes using only saved storage', async () => {
  const first = fixture();
  await first.switchPebbleUser('ambient-alice');
  first.usePebbleStore.getState().setAmbientBackground(true);
  const stored = JSON.parse(first.values.get('pebble-ui:ambient-alice')).state;
  assert.equal(stored.ambientBackground, true);
  const enabled = fixture(first.values);
  assert.equal(enabled.usePebbleStore.getState().ambientBackground, true);
  enabled.usePebbleStore.getState().setAmbientBackground(false);
  assert.equal(fixture(enabled.values).usePebbleStore.getState().ambientBackground, false);
});

test('account switches restore each user independently and give new users OFF', async () => {
  const f = fixture();
  await f.switchPebbleUser('ambient-alice');
  f.usePebbleStore.getState().setAmbientBackground(true);
  await f.switchPebbleUser('ambient-bob');
  assert.equal(f.usePebbleStore.getState().ambientBackground, false);
  await f.switchPebbleUser('ambient-alice');
  assert.equal(f.usePebbleStore.getState().ambientBackground, true);
  await f.switchPebbleUser('ambient-bob');
  assert.equal(f.usePebbleStore.getState().ambientBackground, false);
});
