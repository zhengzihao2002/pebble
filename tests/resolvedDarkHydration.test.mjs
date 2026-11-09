import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import vm from 'node:vm';

const source = buildSync({ entryPoints: ['src/lib/useResolvedDark.ts'], bundle: true, write: false,
  platform: 'node', format: 'cjs', external: ['react', '@/store/usePebbleStore'] }).outputFiles[0].text;

test('hydration snapshots match SSR markup while live readers still report saved and system dark mode', () => {
  for (const appearance of ['light', 'dark', 'system']) {
    const readers = [], compiled = { exports: {} };
    vm.runInNewContext(source, { module: compiled, exports: compiled.exports,
      window: { matchMedia: () => ({ matches: true }) },
      document: { documentElement: { classList: { contains: () => true } } },
      require: name => name === 'react' ? { useSyncExternalStore: (_subscribe, read, server) => {
        readers.push({ read, server }); return server();
      } } : { usePebbleStore: { getState: () => ({ appearance }) } },
    });
    assert.equal(compiled.exports.useResolvedDark(), false);
    assert(readers.every(reader => reader.server() === false));
    assert.equal(readers[0].read(), appearance !== 'light');
    assert.equal(readers[1].read(), true);
  }
});
