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

const plain = value => JSON.parse(JSON.stringify(value));
const originalLook = {
  route: 'default', frost: 50, speed: 1, count: 3,
  colours: [null, null, null, null, null, null],
};

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

test('existing users with only the background toggle retain the original look', () => {
  for (const enabled of [false, true]) {
    const f = fixture(savedPreferences({ ambientBackground: enabled, locale: 'zh' }));
    assert.equal(f.usePebbleStore.getState().ambientBackground, enabled);
    assert.deepEqual(plain(f.usePebbleStore.getState().ambientSettings), originalLook);
    assert.equal(f.usePebbleStore.getState().locale, 'zh');
  }
});

test('partial customization updates retain other choices without enabling the background', () => {
  const f = fixture();
  f.usePebbleStore.getState().setAmbientSettings({ route: 'orbit', count: 5, colours: ['#ABCDEF', '#123456', null, '#112233', '#778899'] });
  f.usePebbleStore.getState().setAmbientSettings({ speed: .75 });
  f.usePebbleStore.getState().setAmbientSettings({ frost: 28 });
  assert.deepEqual(plain(f.usePebbleStore.getState().ambientSettings), {
    route: 'orbit', count: 5, speed: .75, frost: 28,
    colours: ['#abcdef', '#123456', null, '#112233', '#778899', null],
  });
  assert.equal(f.usePebbleStore.getState().ambientBackground, false);
});

test('all custom choices survive a fresh runtime using saved local storage', async () => {
  const first = fixture();
  await first.switchPebbleUser('ambient-custom-alice');
  first.usePebbleStore.getState().setAmbientBackground(true);
  first.usePebbleStore.getState().setAmbientSettings({ route: 'sweep', frost: 82, speed: 2.25, count: 6, colours: ['#123456', null, '#abcdef', '#112233', '#445566', '#778899'] });
  const stored = JSON.parse(first.values.get('pebble-ui:ambient-custom-alice')).state;
  assert.deepEqual(stored.ambientSettings, plain(first.usePebbleStore.getState().ambientSettings));
  const reloaded = fixture(first.values);
  assert.deepEqual(plain(reloaded.usePebbleStore.getState().ambientSettings), stored.ambientSettings);
  assert.equal(reloaded.usePebbleStore.getState().ambientBackground, true);
});

test('custom settings are isolated by user and new users receive defaults', async () => {
  const f = fixture();
  await f.switchPebbleUser('ambient-custom-alice');
  f.usePebbleStore.getState().setAmbientBackground(true);
  f.usePebbleStore.getState().setAmbientSettings({ route: 'weave', frost: 20, count: 4, colours: ['#123456'] });
  const alice = plain(f.usePebbleStore.getState().ambientSettings);
  await f.switchPebbleUser('ambient-custom-bob');
  assert.deepEqual(plain(f.usePebbleStore.getState().ambientSettings), originalLook);
  assert.equal(f.usePebbleStore.getState().ambientBackground, false);
  f.usePebbleStore.getState().setAmbientSettings({ route: 'orbit', speed: 3, colours: ['#abcdef'] });
  const bob = plain(f.usePebbleStore.getState().ambientSettings);
  await f.switchPebbleUser('ambient-custom-alice');
  assert.deepEqual(plain(f.usePebbleStore.getState().ambientSettings), alice);
  assert.equal(f.usePebbleStore.getState().ambientBackground, true);
  await f.switchPebbleUser('ambient-custom-bob');
  assert.deepEqual(plain(f.usePebbleStore.getState().ambientSettings), bob);
  assert.equal(f.usePebbleStore.getState().ambientBackground, false);
});

test('invalid persisted customization is normalized during hydration', () => {
  const f = fixture(savedPreferences({
    ambientBackground: true,
    ambientSettings: { route: 'unsupported', frost: 500, speed: -2, count: 100, colours: ['#ABCDEF', 'red', '#123456ff'] },
  }));
  assert.deepEqual(plain(f.usePebbleStore.getState().ambientSettings), {
    route: 'default', frost: 100, speed: .25, count: 6,
    colours: ['#abcdef', null, null, null, null, null],
  });
  assert.equal(f.usePebbleStore.getState().ambientBackground, true);
});

test('Restore defaults resets the appearance without changing the enabled state', () => {
  const f = fixture();
  for (const enabled of [true, false]) {
    f.usePebbleStore.getState().setAmbientBackground(enabled);
    f.usePebbleStore.getState().setAmbientSettings({ route: 'sweep', frost: 10, speed: 3, count: 6, colours: ['#123456'] });
    f.usePebbleStore.getState().resetAmbientSettings();
    assert.deepEqual(plain(f.usePebbleStore.getState().ambientSettings), originalLook);
    assert.equal(f.usePebbleStore.getState().ambientBackground, enabled);
    const reloaded = fixture(f.values);
    assert.deepEqual(plain(reloaded.usePebbleStore.getState().ambientSettings), originalLook);
    assert.equal(reloaded.usePebbleStore.getState().ambientBackground, enabled);
  }
});
