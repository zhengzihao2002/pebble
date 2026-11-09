import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSync } from 'esbuild';
import vm from 'node:vm';

const source = buildSync({
  entryPoints: ['src/components/layout/SoftCursor.tsx'], bundle: true, write: false,
  platform: 'node', format: 'cjs', external: ['react', '@/store/usePebbleStore'],
}).outputFiles[0].text;

function fixture(size, enabled = true) {
  let effect;
  const styles = new Map(), classes = new Set();
  const root = { style: { setProperty: (key, value) => styles.set(key, value), removeProperty: key => styles.delete(key) },
    classList: { toggle: (key, value) => value ? classes.add(key) : classes.delete(key), remove: key => classes.delete(key) } };
  const compiled = { exports: {} };
  vm.runInNewContext(source, {
    module: compiled, exports: compiled.exports, document: { querySelector: () => root },
    require: name => name === 'react' ? { useLayoutEffect: fn => { effect = fn; } }
      : { usePebbleStore: select => select({ softCursor: enabled, cursorSize: size }) },
  });
  compiled.exports.SoftCursor();
  return { styles, classes, cleanup: effect() };
}

test('text cursors stay centered on the click point at every size and in both themes', () => {
  for (const size of [24, 32, 48, 40]) {
    const f = fixture(size);
    assert(f.classes.has('pb-soft-cursor'));
    for (const tone of ['light', 'dark']) {
      const cursor = f.styles.get(`--pb-text-${tone}`);
      const [, file, x, y] = cursor.match(/^url\('([^']+)'\) (\d+) (\d+), text$/);
      const svg = readFileSync(`public${file}`, 'utf8');
      const [, width, height] = svg.match(/width="(\d+)" height="(\d+)"/);
      assert(Math.abs(Number(x) - Number(width) / 2) <= .5);
      assert(Math.abs(Number(y) - Number(height) / 2) <= .5);
      assert(svg.includes('stroke-linecap="round"'));
      assert(f.styles.get(`--pb-arrow-${tone}`).endsWith(', auto'));
    }
    assert.notEqual(readFileSync('public/cursors/soft-text-light.svg', 'utf8'), readFileSync('public/cursors/soft-text-dark.svg', 'utf8'));
    f.cleanup();
    assert.equal(f.styles.size, 0);
    assert.equal(f.classes.size, 0);
  }
});

test('the cursor setting remains opt-in', () => {
  const f = fixture(32, false);
  assert.equal(f.classes.has('pb-soft-cursor'), false);
  f.cleanup();
});
