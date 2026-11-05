import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import vm from 'node:vm';

const source = buildSync({
  entryPoints: ['src/components/layout/useTypographyPreferences.ts'], bundle: true, write: false,
  platform: 'node', format: 'cjs', external: ['react', '@/store/usePebbleStore'],
}).outputFiles[0].text;

function fixture() {
  let effect, listener;
  let state = { textSize: 95, fontChoice: 'rounded', cjkFontChoice: 'kai' };
  const writes = [];
  const attributes = new Map([['data-pebble-font', 'rounded'], ['data-pebble-cjk', 'kai']]);
  const root = {
    style: new Proxy({ fontSize: '15.2px' }, { set(object, key, value) { writes.push([key, value]); object[key] = value; return true; } }),
    getAttribute: key => attributes.get(key) ?? null,
    setAttribute: (key, value) => { writes.push([key, value]); attributes.set(key, value); },
    removeAttribute: key => { writes.push([key, null]); attributes.delete(key); },
  };
  const compiled = { exports: {} };
  vm.runInNewContext(source, {
    module: compiled, exports: compiled.exports, document: { documentElement: root },
    require: name => name === 'react' ? { useLayoutEffect: fn => { effect = fn; } } : {
      // The render-time SSR snapshot is intentionally different from getState.
      usePebbleStore: Object.assign(() => ({ textSize: 100, fontChoice: 'default', cjkFontChoice: 'sans' }), {
        getState: () => state,
        subscribe: fn => { listener = fn; return () => { listener = null; }; },
      }),
    },
  });
  compiled.exports.useTypographyPreferences();
  const cleanup = effect();
  return { root, writes, attributes, cleanup, update: patch => { state = { ...state, ...patch }; listener?.(); } };
}

test('hydration preserves the smaller size and fonts already applied before paint', () => {
  const f = fixture();
  assert.deepEqual(f.writes, [], 'SSR defaults must never overwrite the saved typography');
  assert.equal(f.root.style.fontSize, '15.2px');
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
