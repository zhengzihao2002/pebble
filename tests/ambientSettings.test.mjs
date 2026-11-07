import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import vm from 'node:vm';

const source = buildSync({
  entryPoints: ['src/lib/ambientSettings.ts'], bundle: true, write: false,
  platform: 'node', format: 'cjs',
}).outputFiles[0].text;
const compiled = { exports: {} };
vm.runInNewContext(source, { module: compiled, exports: compiled.exports });
const { AMBIENT_ROUTES, AMBIENT_MAX_BALLS, DEFAULT_AMBIENT_SETTINGS, normalizeAmbientSettings } = compiled.exports;
const plain = value => JSON.parse(JSON.stringify(value));
const originalLook = {
  route: 'default', frost: 50, speed: 1, count: 3,
  colours: [null, null, null, null, null, null],
};

test('missing settings preserve the existing background as Default', () => {
  assert.deepEqual(plain(DEFAULT_AMBIENT_SETTINGS), originalLook);
  for (const saved of [undefined, null, false, 1, 'orbit', [], {}]) {
    assert.deepEqual(plain(normalizeAmbientSettings(saved)), originalLook);
  }
  assert.equal(AMBIENT_MAX_BALLS, 6);
});

test('each supported route survives normalization and unknown routes fall back', () => {
  assert.equal(new Set(AMBIENT_ROUTES).size, AMBIENT_ROUTES.length);
  for (const route of AMBIENT_ROUTES) assert.equal(normalizeAmbientSettings({ route }).route, route);
  for (const route of ['random-route', 'Default', '<script>', null, 3]) {
    assert.equal(normalizeAmbientSettings({ route }).route, 'default');
  }
});

test('saved numerical controls are bounded without accepting invalid values', () => {
  assert.deepEqual(plain(normalizeAmbientSettings({ frost: -25, speed: 20, count: 100 })), {
    ...originalLook, frost: 0, speed: 3, count: 6,
  });
  assert.deepEqual(plain(normalizeAmbientSettings({ frost: 125, speed: .01, count: -4 })), {
    ...originalLook, frost: 100, speed: .25, count: 1,
  });
  const precise = normalizeAmbientSettings({ frost: 37.5, speed: 1.75, count: 4.6 });
  assert.equal(precise.frost, 37.5);
  assert.equal(precise.speed, 1.75);
  assert.equal(precise.count, 5);
  for (const bad of [NaN, Infinity, -Infinity, '2', null, true]) {
    const result = normalizeAmbientSettings({ frost: bad, speed: bad, count: bad });
    assert.equal(result.frost, 50);
    assert.equal(result.speed, 1);
    assert.equal(result.count, 3);
  }
});

test('custom colours accept only complete hex values and preserve theme slots', () => {
  assert.deepEqual(plain(normalizeAmbientSettings({ colours: ['#ABCDEF', null, '#123456'] }).colours),
    ['#abcdef', null, '#123456', null, null, null]);
  assert.deepEqual(plain(normalizeAmbientSettings({ colours: ['red', '#abc', '#123456ff', ' #123456', 'var(--pine)', '#gggggg'] }).colours),
    originalLook.colours);
  assert.deepEqual(plain(normalizeAmbientSettings({ colours: '#123456' }).colours), originalLook.colours);
  assert.equal(normalizeAmbientSettings({ colours: Array(20).fill('#123456') }).colours.length, AMBIENT_MAX_BALLS);
});

test('normalization cannot mutate saved input or share editable default arrays', () => {
  const input = Object.freeze({ route: 'weave', colours: Object.freeze(['#ABCDEF', null]) });
  const first = normalizeAmbientSettings(input);
  const second = normalizeAmbientSettings(input);
  assert.notEqual(first, second);
  assert.notEqual(first.colours, second.colours);
  first.colours[0] = '#ffffff';
  first.colours[1] = '#000000';
  assert.equal(input.colours[0], '#ABCDEF');
  assert.equal(second.colours[0], '#abcdef');
  assert.equal(second.colours[1], null);
  const fresh = normalizeAmbientSettings(undefined);
  fresh.colours[0] = '#123456';
  assert.equal(DEFAULT_AMBIENT_SETTINGS.colours[0], null);
  assert.equal(normalizeAmbientSettings(undefined).colours[0], null);
});
