import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import vm from 'node:vm';

const source = buildSync({ entryPoints: ['src/components/importCsv/useImportRowReveal.ts'], bundle: true,
  write: false, external: ['react'], platform: 'node', format: 'cjs' }).outputFiles[0].text;

function fixture({ reduced = false, count = 2 } = {}) {
  let effect, mutation, clock = 0, onMedia;
  const compiledModule = { exports: {} }, observers = [];
  const media = { matches: reduced, addEventListener: (_, fn) => { onMedia = fn; }, removeEventListener() {} };
  const makeRow = (index, opacity = 1) => {
    const attributes = new Set(), animations = [], events = [];
    return { index, top: index * 80, attributes, animations, events,
      style: { getPropertyValue: () => String(opacity) },
      hasAttribute: name => attributes.has(name), setAttribute: name => attributes.add(name),
      getBoundingClientRect() { return { top: this.top }; }, matches: () => false,
      dispatchEvent: event => events.push(event.type),
      animate(keyframes, options) {
        let resolve, reject;
        const animation = { keyframes, options, startsAt: clock + options.delay, cancelled: false,
          finished: new Promise((yes, no) => { resolve = yes; reject = no; }),
          finish: () => resolve(), cancel() { this.cancelled = true; reject(new Error('cancelled')); } };
        animations.push(animation); return animation;
      },
    };
  };
  const elements = Array.from({ length: count }, (_, index) => makeRow(index));
  const rootAttributes = new Set(), listeners = new Map();
  const root = { contains: element => elements.includes(element), querySelectorAll: () => elements,
    hasAttribute: name => rootAttributes.has(name), toggleAttribute(name, on) { if (on) rootAttributes.add(name); else rootAttributes.delete(name); },
    removeAttribute: name => rootAttributes.delete(name), dispatchEvent(event) { listeners.get(event.type)?.(); },
    addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener: name => listeners.delete(name) };
  vm.runInNewContext(source, { module: compiledModule, exports: compiledModule.exports, Event,
    require: () => ({ useLayoutEffect: fn => { effect = fn; } }),
    performance: { now: () => clock }, window: { matchMedia: () => media },
    IntersectionObserver: class {
      constructor(callback) { observers.push(this); this.callback = callback; }
      observe() {} unobserve() {} disconnect() {}
      emit(entries) { this.callback(entries.map(([target, isIntersecting]) => ({ target, isIntersecting }))); }
    },
    MutationObserver: class { constructor(callback) { mutation = callback; } observe() {} disconnect() {} },
  });
  compiledModule.exports.useImportRowReveal({ current: root });
  const cleanup = effect();
  return { elements, root, io: observers[0], makeRow, cleanup, event: compiledModule.exports.IMPORT_ROW_REVEALED,
    now: value => { clock = value; }, discover: () => mutation(),
    reduce: () => { media.matches = true; onMedia(); } };
}

test('rows fade one at a time and signal typing only after their fade finishes', async () => {
  const f = fixture();
  f.io.emit(f.elements.map(row => [row, true]));
  assert.equal(f.root.hasAttribute('data-import-reveal-busy'), true);
  const [first, second] = f.elements;
  assert.equal(first.animations[0].startsAt, 0);
  assert.equal(second.animations[0].startsAt, first.animations[0].options.duration);
  assert.deepEqual(first.events, []);
  assert.equal(second.hasAttribute('data-import-revealed'), false);
  f.now(360); first.animations[0].finish(); await Promise.resolve();
  assert.deepEqual(first.events, [f.event]);
  assert.equal(first.hasAttribute('data-import-revealed'), true);
  assert.deepEqual(second.events, []);
  f.now(720); second.animations[0].finish(); await Promise.resolve();
  assert.equal(f.root.hasAttribute('data-import-reveal-busy'), false);
  f.cleanup();
});

test('a later DOM batch joins the existing sequence without a gap', async () => {
  const f = fixture({ count: 8 });
  f.io.emit(f.elements.map(row => [row, true]));
  f.now(360); f.elements[0].animations[0].finish(); await Promise.resolve();
  f.now(450);
  const later = [f.makeRow(8), f.makeRow(9)];
  f.elements.push(...later); f.discover(); f.io.emit(later.map(row => [row, true]));
  const eighth = f.elements[7].animations.at(-1), ninth = later[0].animations.at(-1);
  assert.equal(ninth.startsAt, eighth.startsAt + eighth.options.duration);
  assert.equal(later[1].animations.at(-1).startsAt, ninth.startsAt + ninth.options.duration);
  f.cleanup();
});

test('scrolling past queued rows promotes the newly visible rows immediately', () => {
  const f = fixture({ count: 5 });
  f.io.emit(f.elements.slice(0, 4).map(row => [row, true]));
  f.now(100); f.elements[3].top = 0; f.elements[4].top = 80;
  f.io.emit([...f.elements.slice(0, 3).map(row => [row, false]), [f.elements[4], true]]);
  assert.equal(f.elements[3].animations.at(-1).startsAt, 100);
  assert.equal(f.elements[4].animations.at(-1).startsAt, 460);
  assert.equal(f.elements[1].animations[0].cancelled, true);
  assert.equal(f.elements[1].hasAttribute('data-import-revealed'), false);
  f.cleanup();
});

test('reduced motion reveals rows immediately, including when enabled during a fade', () => {
  const immediate = fixture({ reduced: true });
  assert(immediate.elements.every(row => row.hasAttribute('data-import-revealed') && row.animations.length === 0));
  immediate.cleanup();
  const f = fixture(); f.io.emit(f.elements.map(row => [row, true])); f.reduce();
  assert(f.elements.every(row => row.hasAttribute('data-import-revealed')));
  assert(f.elements.every(row => row.events.length === 1 && row.animations[0].cancelled));
  f.cleanup();
});

test('closing cancels queued work and cannot send a late typing signal', async () => {
  const f = fixture(); f.io.emit(f.elements.map(row => [row, true])); f.cleanup();
  f.elements.forEach(row => row.animations.forEach(animation => animation.finish()));
  await Promise.resolve();
  assert(f.elements.every(row => row.events.length === 0));
});

test('finishing the initial viewport leaves offscreen and later-mounted rows readable', async () => {
  const f = fixture({ count: 3 });
  f.io.emit([[f.elements[0], true]]);
  f.now(360); f.elements[0].animations[0].finish(); await Promise.resolve();
  assert(f.elements.every(row => row.hasAttribute('data-import-revealed')));
  const later = f.makeRow(3); f.elements.push(later); f.discover();
  assert.equal(later.hasAttribute('data-import-revealed'), true);
  assert.equal(later.animations.length, 0);
  f.cleanup();
});

test('scrolling during the intro reveals queued rows immediately instead of hiding the list', () => {
  const f = fixture(); f.io.emit(f.elements.map(row => [row, true]));
  f.root.dispatchEvent(new Event('scroll'));
  assert(f.elements.every(row => row.hasAttribute('data-import-revealed')));
  assert.equal(f.root.hasAttribute('data-import-reveal-busy'), false);
  f.cleanup();
});
