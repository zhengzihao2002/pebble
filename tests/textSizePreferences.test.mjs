import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { buildSync } from 'esbuild';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const source = buildSync({
  stdin: { contents: `
    export * from './src/store/usePebbleStore';
    export * from './src/store/storageKeys';
    export * from './src/lib/textSize';
    export * from './src/lib/themeChoice';
    export * from './src/lib/fontChoice';
  `, resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
}).outputFiles[0].text;

function fixture(textSize) {
  const values = new Map([['pebble-ui', JSON.stringify({ state: { textSize }, version: 2 })]]);
  const localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
  const compiled = { exports: {} };
  vm.runInNewContext(source, { module: compiled, exports: compiled.exports, require, console, window: { localStorage } });
  return { ...compiled.exports, values, localStorage };
}

test('persisted small sizes migrate to 100%, and setters enforce the same bounds', () => {
  for (const [saved, expected] of [[85, 100], [99, 100], [100, 100], [115, 115], [200, 150], ['85', 100], [null, 100]]) {
    const f = fixture(saved);
    assert.equal(f.usePebbleStore.getState().textSize, expected);
    for (const [value, size] of [[50, 100], [99, 100], [130, 130], [999, 150], [NaN, 100]]) {
      f.usePebbleStore.getState().setTextSize(value);
      assert.equal(f.usePebbleStore.getState().textSize, size);
      assert.equal(JSON.parse(f.values.get('pebble-ui')).state.textSize, size);
    }
  }
});

test('the actual first-paint script clamps legacy saved sizes before rendering', () => {
  const layout = readFileSync('src/app/layout.tsx', 'utf8');
  const template = layout.match(/__html: (`[^`]+`)/)[1];
  for (const [saved, expected] of [[85, '16px'], [100, '16px'], [115, '18.4px'], [200, '24px']]) {
    const f = fixture(saved);
    const root = { style: {}, classList: { add() {} }, setAttribute() {} };
    const script = vm.runInNewContext(template, f);
    vm.runInNewContext(script, {
      localStorage: f.localStorage, sessionStorage: { getItem: () => null },
      location: { pathname: '/settings' }, matchMedia: () => ({ matches: false }),
      document: { documentElement: root },
    });
    assert.equal(root.style.fontSize, expected);
  }
});

test('switching users restores their size independently and clamps old small preferences', async () => {
  const f = fixture(85);
  await f.switchPebbleUser('size-alice');
  f.usePebbleStore.getState().setTextSize(130);
  f.values.set('pebble-ui:size-bob', JSON.stringify({ state: { textSize: 80 }, version: 2 }));
  await f.switchPebbleUser('size-bob');
  assert.equal(f.usePebbleStore.getState().textSize, 100);
  await f.switchPebbleUser('size-alice');
  assert.equal(f.usePebbleStore.getState().textSize, 130);
});
