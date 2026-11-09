import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import vm from 'node:vm';

// Minification must not introduce closure dependencies into the serialized factory.
const source = buildSync({
  entryPoints: ['src/lib/preinitPreferences.ts'], bundle: true, write: false,
  platform: 'node', format: 'cjs', minify: true,
}).outputFiles[0].text;
const compiled = { exports: {} };
vm.runInNewContext(source, { module: compiled, exports: compiled.exports });
const script = compiled.exports.PREINIT_PREFERENCES_SCRIPT;
function style() {
  const values = new Map();
  return { values, fontSize: '', getPropertyValue: key => values.get(key) ?? '',
    setProperty: (key, value) => values.set(key, value), removeProperty: key => values.delete(key) };
}
function boot(prefs, { auth = false, dark = false, still = false, unavailable = false } = {}) {
  const attributes = new Map(), rootStyle = style(), sceneStyle = style();
  const classes = new Set();
  const sheet = { cssRules: [], insertRule() { this.cssRules.push({ style: sceneStyle }); } };
  const root = { style: rootStyle, classList: { add: value => classes.add(value) },
    getAttribute: key => attributes.get(key) ?? null,
    setAttribute: (key, value) => attributes.set(key, value), removeAttribute: key => attributes.delete(key) };
  const document = { documentElement: root, getElementById: () => ({ sheet }) };
  root.ownerDocument = document;
  const localStorage = { getItem(key) {
    if (unavailable) throw new Error('Storage blocked');
    if (key === 'pebble-ui:last-user') return 'alice';
    if (key === 'pebble-ui:alice') return JSON.stringify({ state: prefs, version: 2 });
    return null;
  } };
  vm.runInNewContext(script, { document, localStorage, sessionStorage: { getItem: () => null },
    location: { pathname: auth ? '/auth/sign-in' : '/settings' },
    matchMedia: query => ({ matches: query.includes('reduced-motion') ? still : dark }) });
  return { attributes, rootStyle, sceneStyle, classes };
}

test('saved cursor and initial background are available in parsed HTML without React or image requests', () => {
  const f = boot({ softCursor: true, cursorSize: 48, ambientBackground: true, appearance: 'dark' });
  assert(f.attributes.has('data-pb-soft-cursor'));
  assert(f.attributes.has('data-pb-ambient'));
  assert(f.classes.has('pebble-dark'));
  assert(f.rootStyle.values.get('--pb-text-pressed-dark').startsWith('url("data:image/svg+xml,'));
  assert(f.rootStyle.values.get('--pb-text-pressed-dark').endsWith('24 27, text'));
  assert.equal((f.sceneStyle.values.get('background-image').match(/radial-gradient/g) ?? []).length, 3);
});

test('the first frame respects custom routes, count, frost, colours and reduced motion', () => {
  const f = boot({ ambientBackground: true, ambientSettings: {
    route: 'orbit', count: 6, frost: 0, colours: ['#aabbcc', null, '#112233', '#445566', null, '#778899'],
  } }, { still: true });
  const image = f.sceneStyle.values.get('background-image');
  assert.equal((image.match(/radial-gradient/g) ?? []).length, 6);
  assert(image.includes('min(100cqw, 100cqh) * 0.72'));
  assert.equal(f.sceneStyle.values.get('--pb-ambient-start-colour-0'), '#aabbcc');
  assert.equal(f.sceneStyle.values.get('--pb-ambient-start-colour-1'), 'color-mix(in oklch, var(--pine) 68%, var(--gold))');
  const other = boot({ ambientBackground: true, ambientSettings: { route: 'weave', count: 1, frost: 100 } });
  assert.notEqual(image, other.sceneStyle.values.get('background-image'));
  assert.equal((other.sceneStyle.values.get('background-image').match(/radial-gradient/g) ?? []).length, 1);
});

test('invalid settings stay bounded and cannot inject CSS into the first frame', () => {
  const f = boot({ ambientBackground: true, ambientSettings: {
    route: '__proto__', count: 1000, frost: -100, colours: ['red); background: url(https://example.com)'],
  } });
  const image = f.sceneStyle.values.get('background-image');
  assert.equal((image.match(/radial-gradient/g) ?? []).length, 6);
  assert(![...f.sceneStyle.values.values()].some(value => value.includes('example.com')));
});

test('OFF, unavailable storage and auth pages retain ordinary cursors and backgrounds', () => {
  for (const f of [boot({}), boot({ softCursor: false, ambientBackground: false }),
    boot({ softCursor: true, ambientBackground: true }, { auth: true }), boot({}, { unavailable: true })]) {
    assert(!f.attributes.has('data-pb-soft-cursor'));
    assert(!f.attributes.has('data-pb-ambient'));
    assert.equal(f.rootStyle.values.size, 0);
    assert.equal(f.sceneStyle.values.size, 0);
  }
});
