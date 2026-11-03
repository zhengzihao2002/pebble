import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import vm from 'node:vm';

const source = buildSync({ entryPoints: ['src/components/settings/useScrollAnchor.ts'], bundle: true, write: false, external: ['react'], platform: 'node', format: 'cjs' }).outputFiles[0].text;

function fixture() {
  let layoutEffect, refIndex = 0, sequence = 0;
  const refs = [], effects = [], listeners = new Map(), frames = new Map(), timers = new Map();
  const compiled = { exports: {} };
  const root = {
    scrollTop: 0,
    getBoundingClientRect: () => ({ top: 0 }),
    querySelectorAll: () => rows,
    scrollTo({ top }) { this.scrollTop = top; },
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name, fn) => { if (listeners.get(name) === fn) listeners.delete(name); },
  };
  const row = (offset) => ({ offset, isConnected: true, getBoundingClientRect() { return { top: this.offset - root.scrollTop, bottom: this.offset - root.scrollTop + 100, height: 100 }; } });
  const rows = [row(100), row(1100)];
  let resize;
  vm.runInNewContext(source, {
    module: compiled, exports: compiled.exports,
    require: () => ({
      useCallback: fn => fn,
      useRef: value => { const index = refIndex++; return refs[index] ??= { current: value }; },
      useEffect: fn => effects.push(fn),
      useLayoutEffect: fn => { layoutEffect = fn; },
    }),
    document: { querySelector: selector => selector === '.pebble-root' ? root : {} },
    getComputedStyle: () => ({ getPropertyValue: () => '80px' }),
    performance: { now: () => 0 },
    window: { setTimeout: fn => { timers.set(++sequence, fn); return sequence; }, clearTimeout: id => timers.delete(id) },
    requestAnimationFrame: fn => { frames.set(++sequence, fn); return sequence; },
    cancelAnimationFrame: id => frames.delete(id),
    ResizeObserver: class { constructor(fn) { resize = fn; } observe() {} disconnect() { resize = undefined; } },
  });
  const keepPlace = compiled.exports.useScrollAnchor('zh', { anchors: '.row', content: '.content' });
  effects.forEach(fn => fn());
  const beginChange = () => { keepPlace(); rows.forEach(r => { r.offset += 20; }); layoutEffect(); };
  return { root, rows, keepPlace, commit: () => layoutEffect(), beginChange, listeners, frames, timers, resize: () => resize?.() };
}

test('a language reflow preserves the row offset and corrects late layout changes', () => {
  const f = fixture();
  f.beginChange();
  assert.equal(f.rows[0].getBoundingClientRect().top, 100);
  f.rows.forEach(r => { r.offset += 50; });
  f.resize();
  assert.equal(f.rows[0].getBoundingClientRect().top, 100);
});

test('a new change after a section jump cannot reuse the old Money anchor', () => {
  const f = fixture();
  f.beginChange();
  f.root.scrollTop += 1000;
  f.beginChange();
  assert.equal(f.rows[1].getBoundingClientRect().top, 100);
  assert.equal(f.root.scrollTop, 1040);
});

for (const event of ['pointerdown', 'keydown', 'wheel', 'touchmove']) {
  test(`${event} releases the previous correction before a navigation interaction`, () => {
    const f = fixture();
    f.beginChange();
    f.listeners.get(event)({ target: {} });
    f.root.scrollTop = 1000;
    f.rows[0].offset += 40;
    f.resize();
    assert.equal(f.root.scrollTop, 1000);
    assert.equal(f.frames.size, 0);
    assert.equal(f.timers.size, 0);
    assert.equal(f.listeners.size, 0);
  });
}
