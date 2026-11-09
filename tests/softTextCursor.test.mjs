import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSync } from 'esbuild';
import vm from 'node:vm';

const source = buildSync({
  entryPoints: ['src/lib/visualPreferences.ts'], bundle: true, write: false,
  platform: 'node', format: 'cjs',
}).outputFiles[0].text;

function fixture(size, enabled = true) {
  const styles = new Map(), attributes = new Map();
  const root = { style: {
    getPropertyValue: key => styles.get(key) ?? '',
    setProperty: (key, value) => styles.set(key, value), removeProperty: key => styles.delete(key),
  }, getAttribute: key => attributes.get(key) ?? null,
  setAttribute: (key, value) => attributes.set(key, value), removeAttribute: key => attributes.delete(key) };
  const compiled = { exports: {} };
  vm.runInNewContext(source, { module: compiled, exports: compiled.exports });
  const tools = compiled.exports.visualPreferenceTools;
  tools.apply(root, { softCursor: enabled, cursorSize: size });
  return { styles, attributes, cleanup: () => tools.apply(root, {}) };
}

test('inline cursors are ready without a first-use request and stay centered in both themes at every size', () => {
  for (const size of [24, 32, 48, 40]) {
    const f = fixture(size);
    assert(f.attributes.has('data-pb-soft-cursor'));
    for (const tone of ['light', 'dark']) {
      for (const kind of ['text', 'text-pressed']) {
        const cursor = f.styles.get(`--pb-${kind}-${tone}`);
        const [, encoded, x, y] = cursor.match(/^url\("data:image\/svg\+xml,([^"]+)"\) (\d+) (\d+), text$/);
        const svg = decodeURIComponent(encoded);
        const [, width, height] = svg.match(/width="(\d+)" height="(\d+)"/);
        assert(Math.abs(Number(x) - Number(width) / 2) <= .5);
        assert(Math.abs(Number(y) - Number(height) / 2) <= .5);
        const suffix = Number(width) === 32 ? '' : `-${width}`;
        const file = `public/cursors/soft-text-${tone}${kind === 'text' ? '-long' : ''}${suffix}.svg`;
        assert.equal(svg, readFileSync(file, 'utf8').trim(), 'inline images must match the exported artwork');
        assert(svg.includes('stroke-linecap="round"'));
      }
      assert(f.styles.get(`--pb-arrow-${tone}`).startsWith('url("data:image/svg+xml,'));
      assert(f.styles.get(`--pb-arrow-${tone}`).endsWith(', auto'));
    }
    f.cleanup();
    assert.equal(f.styles.size, 0);
    assert.equal(f.attributes.size, 0);
  }
});

test('the cursor setting remains opt-in', () => {
  const f = fixture(32, false);
  assert.equal(f.attributes.has('data-pb-soft-cursor'), false);
  assert.equal(f.styles.size, 0);
});
