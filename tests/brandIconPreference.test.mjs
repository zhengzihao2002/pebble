import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const source = buildSync({ entryPoints: ['src/store/usePebbleStore.ts'], bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external' }).outputFiles[0].text;
function fixture(values = new Map()) {
  const compiled = { exports: {} };
  const localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  vm.runInNewContext(source, { module: compiled, exports: compiled.exports, require, console, window: { localStorage } });
  return { ...compiled.exports, values };
}

test('brand icons default ON for new and existing users whose preferences predate the setting', () => {
  assert.equal(fixture().usePebbleStore.getState().showBrandIcons, true);
  const values = new Map([['pebble-ui', JSON.stringify({ state: { locale: 'zh', showCardGlow: false }, version: 2 })]]);
  const store = fixture(values).usePebbleStore;
  assert.equal(store.getState().showBrandIcons, true);
  assert.equal(store.getState().locale, 'zh');
  assert.equal(store.getState().showCardGlow, undefined);
});

test('turning the setting off persists across a fresh app load', () => {
  const f = fixture();
  f.usePebbleStore.getState().setShowBrandIcons(false);
  assert.equal(fixture(f.values).usePebbleStore.getState().showBrandIcons, false);
});

test('one account disabling brand icons cannot change another account preference', async () => {
  const f = fixture();
  await f.switchPebbleUser('alice');
  f.usePebbleStore.getState().setShowBrandIcons(false);
  await f.switchPebbleUser('bob');
  assert.equal(f.usePebbleStore.getState().showBrandIcons, true);
  await f.switchPebbleUser('alice');
  assert.equal(f.usePebbleStore.getState().showBrandIcons, false);
});
