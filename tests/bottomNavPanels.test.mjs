import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import vm from 'node:vm';
const source = buildSync({ entryPoints: ['src/components/layout/useBottomNavPanels.ts'], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react'] }).outputFiles[0].text;
function fixture() {
  let state, effect, previous, cleanup;
  let finish;
  const finished = new Promise(resolve => { finish = resolve; });
  const panel = { getAnimations: () => [{ finished }] };
  const ref = { current: panel };
  const compiled = { exports: {} };
  vm.runInNewContext(source, { module: compiled, exports: compiled.exports, require: () => ({
    useState: initial => { state ??= initial; return [state, fn => { state = fn(state); }]; },
    useCallback: fn => fn,
    useEffect: (fn, deps) => { if (!previous || deps.some((v, i) => v !== previous[i])) { cleanup?.(); previous = deps; effect = fn; } },
  }) });
  return { finish, render() { const value = compiled.exports.useBottomNavPanels(ref, ref); if (effect) { cleanup = effect(); effect = null; } return value; } };
}
test('closing fades the tint immediately while the sheet is still animating', async () => {
  const f = fixture(); let nav = f.render();
  nav.toggle('more'); nav = f.render(); assert.equal(nav.dimmed, true);
  nav.close(); nav = f.render();
  assert.equal(nav.dimmed, false, 'Backdrop does not wait for the slide-out');
  assert.equal(nav.engaged, true, 'Keep the closing sheet protected from taps');
  f.finish(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.render().engaged, false);
});
test('switching between More and Add keeps the tint and serializes the sheets', async () => {
  const f = fixture(); let nav = f.render();
  nav.toggle('more'); nav = f.render();
  nav.toggle('add'); nav = f.render();
  assert.equal(nav.dimmed, true); assert.equal(nav.open, false); assert.equal(nav.addOpen, false);
  f.finish(); await new Promise(resolve => setImmediate(resolve));
  nav = f.render(); assert.equal(nav.addOpen, true); assert.equal(nav.dimmed, true);
  nav.close(); assert.equal(f.render().dimmed, false);
});
