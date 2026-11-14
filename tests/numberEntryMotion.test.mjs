import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import vm from 'node:vm';
const source = buildSync({ entryPoints: ['src/lib/numberEntryMotion.ts'], bundle: true, write: false, platform: 'node', format: 'cjs' }).outputFiles[0].text;
const settle = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
  const listeners = new Map(), frames = new Map(), intersections = [], mutations = [], nodes = [];
  let sequence = 0;
  const document = { hidden: false, documentElement: {}, addEventListener: (key, fn) => listeners.set(key, fn), removeEventListener: key => listeners.delete(key) };
  const window = { location: { pathname: '/dashboard' }, addEventListener: (key, fn) => listeners.set(key, fn), removeEventListener: key => listeners.delete(key) };
  const content = { dataset: { pbPageVisible: 'false' }, contains: node => nodes.includes(node) };
  const compiled = { exports: {} };
  vm.runInNewContext(source, { module: compiled, exports: compiled.exports, document, window,
    requestAnimationFrame: fn => { frames.set(++sequence, fn); return sequence; }, cancelAnimationFrame: id => frames.delete(id),
    IntersectionObserver: class {
      constructor(callback) { this.callback = callback; this.observed = new Set(); intersections.push(this); }
      observe(node) { this.observed.add(node); } unobserve(node) { this.observed.delete(node); } disconnect() { this.disconnected = true; }
    },
    MutationObserver: class { constructor(callback) { this.callback = callback; mutations.push(this); } observe() {} disconnect() { this.disconnected = true; } },
  });
  const node = ({ digits = true, animations = true } = {}) => {
    const calls = { start: 0, finish: 0, replay: 0 };
    const element = { dataset: {}, isConnected: true, digits, entry: true, sidebar: false,
      hasAttribute: () => element.entry,
      querySelector: () => element.digits ? {} : null,
      closest: selector => selector === '[data-pb-sidebar-phase]' ? (element.sidebar ? {} : null) : content,
      getAnimations: () => element.animations,
    };
    const reset = () => {
      let resolve, reject;
      element.animations = animations ? [{ animationName: 'pb-money-next-up', finished: new Promise((yes, no) => { resolve = yes; reject = no; }) }] : [];
      element.finish = () => resolve?.(); element.cancel = () => reject?.(new Error('Cancelled'));
    };
    reset(); nodes.push(element);
    const stop = compiled.exports.observeNumberEntry(element, {
      onStart: () => { calls.start++; },
      onFinish: () => { calls.finish++; element.entry = false; },
      onReplay: () => { calls.replay++; element.entry = true; reset(); },
    });
    return { element, calls, stop };
  };
  const flush = () => { for (const [key, fn] of [...frames]) { frames.delete(key); fn(); } };
  const visible = (element, isIntersecting = true) => intersections[0].callback([{ target: element, isIntersecting }]);
  const page = () => { content.dataset.pbPageVisible = 'true'; listeners.get('pebble:page-visible')?.({ detail: { content } }); };
  return { ...compiled.exports, node, flush, visible, page, window, document, content, nodes, listeners, frames, intersections, mutations };
}

test('numbers wait for viewport exposure and the actual data handoff, then finish once', async () => {
  const f = fixture(), n = f.node(); f.visible(n.element); f.flush();
  assert.equal(n.calls.start, 0, 'Skeleton/opacity-hidden data must not consume the entrance');
  f.page(); f.flush(); assert.equal(n.calls.start, 1); assert.equal(n.element.dataset.pbRollVisible, 'true');
  n.element.finish(); await settle(); assert.equal(n.calls.finish, 1);
  assert(!f.intersections[0].observed.has(n.element), 'Completed numbers no longer observe scrolling');
  f.visible(n.element, false); f.visible(n.element); f.page(); f.flush();
  assert.equal(n.calls.start, 1, 'Same-page handoff and scrolling cannot replay completed numbers');
  n.stop(); assert.equal(f.listeners.size, 0); assert(f.intersections[0].disconnected);
});

test('one monitor serves many amounts, offscreen amounts remain pending, and late values can enter', async () => {
  const f = fixture(), first = f.node(), late = f.node({ digits: false }); f.page();
  f.visible(first.element); f.visible(late.element); f.flush();
  assert.equal(f.intersections.length, 1); assert.equal(f.mutations.length, 1);
  assert.equal(first.calls.start, 1); assert.equal(late.calls.start, 0);
  late.element.digits = true; f.refreshNumberEntry(late.element); f.flush(); assert.equal(late.calls.start, 1);
  const below = f.node(); f.flush(); assert.equal(below.calls.start, 0);
  f.visible(below.element); f.flush(); assert.equal(below.calls.start, 1);
  first.element.finish(); late.element.finish(); below.element.finish(); await settle();
  first.stop(); late.stop(); below.stop(); assert.equal(f.listeners.size, 0);
});

test('sidebar masking defers pending amounts and never replays numbers already shown', async () => {
  const f = fixture(), old = f.node(), pending = f.node(); f.page();
  f.visible(old.element); f.flush(); old.element.finish(); await settle();
  pending.element.sidebar = true; f.visible(pending.element); f.flush(); assert.equal(pending.calls.start, 0);
  pending.element.sidebar = false; f.mutations[0].callback(); f.flush(); assert.equal(pending.calls.start, 1);
  assert.equal(old.calls.start, 1); assert.equal(old.calls.replay, 0);
  pending.element.finish(); await settle(); old.stop(); pending.stop();
});

test('retained amounts enter again for another pathname, with stale completion isolated', async () => {
  const f = fixture(), n = f.node(); f.page(); f.visible(n.element); f.flush();
  const finishOld = n.element.finish;
  f.window.location.pathname = '/reports'; f.page(); assert.equal(n.calls.replay, 1);
  finishOld(); await settle(); assert.equal(n.calls.finish, 0, 'An interrupted old entry cannot complete its replacement');
  f.visible(n.element); f.flush(); n.element.finish(); await settle(); assert.equal(n.calls.start, 2); assert.equal(n.calls.finish, 1);
  f.page(); f.flush(); assert.equal(n.calls.replay, 1); n.stop();
});

test('hidden documents defer entry, static/reduced-motion CSS completes immediately, and unmount is safe', async () => {
  const f = fixture(), staticAmount = f.node({ animations: false }); f.document.hidden = true; f.page(); f.visible(staticAmount.element); f.flush();
  assert.equal(staticAmount.calls.start, 0);
  f.document.hidden = false; f.listeners.get('visibilitychange')(); f.flush(); await settle();
  assert.equal(staticAmount.calls.finish, 1); staticAmount.stop();
  const g = fixture(), n = g.node(); g.page(); g.visible(n.element); g.flush(); n.stop(); n.element.finish(); await settle();
  assert.equal(n.calls.finish, 0, 'No state callback after the number unmounts');
});
