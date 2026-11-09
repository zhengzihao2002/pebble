import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import vm from 'node:vm';

const source = buildSync({
  entryPoints: ['src/components/layout/useTypographyPreferences.ts'], bundle: true, write: false,
  platform: 'node', format: 'cjs', external: ['react', '@/store/usePebbleStore'],
}).outputFiles[0].text;

function fixture(onAuth = false) {
  let effect, listener, repair;
  let state = { textSize: 115, fontChoice: 'rounded', cjkFontChoice: 'kai' };
  const writes = [];
  const attributes = new Map([['data-pebble-font', 'rounded'], ['data-pebble-cjk', 'kai']]);
  const root = {
    style: new Proxy({ fontSize: '18.4px' }, { set(object, key, value) { writes.push([key, value]); object[key] = value; return true; } }),
    getAttribute: key => attributes.get(key) ?? null,
    setAttribute: (key, value) => { writes.push([key, value]); attributes.set(key, value); },
    removeAttribute: key => { writes.push([key, null]); attributes.delete(key); },
  };
  const compiled = { exports: {} };
  vm.runInNewContext(source, {
    module: compiled, exports: compiled.exports, document: { documentElement: root },
    MutationObserver: class {
      constructor(callback) { repair = callback; }
      observe(target, options) {
        assert.equal(target, root);
        assert.deepEqual(Array.from(options.attributeFilter), ['style', 'data-pebble-font', 'data-pebble-cjk']);
      }
      disconnect() { repair = null; }
    },
    require: name => name === 'react' ? { useLayoutEffect: fn => { effect = fn; } } : {
      // The render-time SSR snapshot is intentionally different from getState.
      usePebbleStore: Object.assign(() => ({ textSize: 100, fontChoice: 'default', cjkFontChoice: 'sans' }), {
        getState: () => state,
        subscribe: fn => { listener = fn; return () => { listener = null; }; },
      }),
    },
  });
  compiled.exports.useTypographyPreferences(onAuth);
  const cleanup = effect();
  return { root, writes, attributes, cleanup, repair: () => repair?.(), update: patch => { state = { ...state, ...patch }; listener?.(); } };
}

test('hydration preserves the larger size and fonts already applied before paint', () => {
  const f = fixture();
  assert.deepEqual(f.writes, [], 'SSR defaults must never overwrite the saved typography');
  assert.equal(f.root.style.fontSize, '18.4px');
  assert.equal(f.attributes.get('data-pebble-font'), 'rounded');
  assert.equal(f.attributes.get('data-pebble-cjk'), 'kai');
  f.cleanup();
});

test('actual preference changes and user switches still apply, without rewriting unrelated updates', () => {
  const f = fixture();
  f.update({ textSize: 110, fontChoice: 'serif', cjkFontChoice: 'serif' });
  assert.equal(f.root.style.fontSize, '17.6px');
  assert.equal(f.attributes.get('data-pebble-font'), 'serif');
  const count = f.writes.length;
  f.update({ locale: 'zh' });
  assert.equal(f.writes.length, count);
  f.update({ textSize: 100, fontChoice: 'default', cjkFontChoice: 'sans' });
  assert.equal(f.root.style.fontSize, '16px');
  assert.equal(f.attributes.size, 0);
  f.cleanup();
  f.update({ textSize: 80 });
  assert.equal(f.root.style.fontSize, '16px');
});

test('legacy small sizes and direct state updates cannot shrink text below 100%', () => {
  const f = fixture();
  f.update({ textSize: 85 });
  assert.equal(f.root.style.fontSize, '16px');
  f.update({ textSize: NaN });
  assert.equal(f.root.style.fontSize, '16px');
  f.cleanup();
});

test('later root rewrites restore Large typography without a store update or animation frame', () => {
  for (const fontChoice of ['rounded', 'system']) {
    const f = fixture();
    f.update({ fontChoice });
    f.root.style.fontSize = '16px';
    f.attributes.clear();
    f.repair();
    assert.equal(f.root.style.fontSize, '18.4px');
    assert.equal(f.attributes.get('data-pebble-font'), fontChoice);
    assert.equal(f.attributes.get('data-pebble-cjk'), 'kai');
    const count = f.writes.length;
    f.repair();
    assert.equal(f.writes.length, count, 'own repair must not cause a mutation loop');
    f.cleanup();
    f.root.style.fontSize = '16px';
    f.repair();
    assert.equal(f.root.style.fontSize, '16px', 'unmounted owner must stop repairing');
  }
});

test('repair reads the latest size and font instead of capturing startup preferences', () => {
  const f = fixture();
  f.update({ textSize: 130, fontChoice: 'system' });
  f.root.style.fontSize = '';
  f.repair();
  assert.equal(f.root.style.fontSize, '20.8px');
  f.root.style.colorScheme = 'dark';
  const count = f.writes.length;
  f.repair();
  assert.equal(f.writes.length, count, 'unrelated inline styles must not be rewritten');
  f.cleanup();
});

test('auth pages keep their default typography even with saved Large text', () => {
  const f = fixture(true);
  assert.equal(f.root.style.fontSize, '16px');
  assert.equal(f.attributes.size, 0);
  f.update({ textSize: 130, fontChoice: 'rounded' });
  assert.equal(f.root.style.fontSize, '16px');
  f.cleanup();
});
