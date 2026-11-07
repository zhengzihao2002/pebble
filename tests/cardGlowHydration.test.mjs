import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import vm from 'node:vm';

const source = buildSync({
  entryPoints: ['src/components/layout/CardGlow.tsx'], bundle: true, write: false,
  platform: 'node', format: 'cjs',
  external: ['react', 'react/jsx-runtime', '@/store/usePebbleStore', '@/lib/cardGlow'],
}).outputFiles[0].text;

function fixture(saved) {
  let effect, mounted = 0, cleaned = 0;
  const compiled = { exports: {} };
  vm.runInNewContext(source, {
    module: compiled, exports: compiled.exports,
    require: name => {
      if (name === 'react') return {
        useId: () => ':test:', useRef: () => ({ current: {} }), useLayoutEffect: fn => { effect = fn; },
      };
      if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }) };
      if (name === '@/store/usePebbleStore') return {
        // Hydration starts with the server's ON default even when saved OFF.
        usePebbleStore: Object.assign(() => true, { getState: () => ({ cardGlow: saved }) }),
      };
      return { mountCardGlows: () => { mounted++; return () => { cleaned++; }; } };
    },
  });
  compiled.exports.CardGlow();
  const cleanup = effect();
  return { mounted: () => mounted, cleaned: () => cleaned, cleanup };
}

test('saved OFF never paints a glow during the initial default hydration snapshot', () => {
  assert.equal(fixture(false).mounted(), 0);
});

test('saved ON mounts the effect and supplies cleanup', () => {
  const f = fixture(true);
  assert.equal(f.mounted(), 1);
  f.cleanup();
  assert.equal(f.cleaned(), 1);
});
