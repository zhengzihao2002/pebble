import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import vm from 'node:vm';

const source = buildSync({
  entryPoints: ['src/lib/cardResize.ts'], bundle: true, write: false,
  platform: 'node', format: 'cjs',
}).outputFiles[0].text;

function fixture() {
  let resize, mutation;
  const events = new Map();
  const media = { matches: false, addEventListener() {}, removeEventListener() {} };
  class Element {
    constructor({ excluded = false, nested = false } = {}) {
      this.naturalHeight = 100; this.offsetWidth = 300; this.isConnected = true;
      this.excluded = excluded; this.nested = nested; this.active = null;
      this.classes = new Set(); this.animations = [];
      this.parentElement = { closest: () => this.nested ? {} : null };
      this.classList = { add: value => this.classes.add(value), remove: value => this.classes.delete(value) };
    }
    get offsetHeight() { return this.active?.visibleHeight ?? this.naturalHeight; }
    closest() { return this.excluded ? this : null; }
    getClientRects() { return [1]; }
    contains(node) { return node === this; }
    matches() { return true; }
    querySelectorAll() { return []; }
    getAnimations() { return this.active ? [this.active] : []; }
    animate(frames, options) {
      const card = this;
      const animation = {
        frames, options, visibleHeight: parseFloat(frames[0].height),
        cancel() { card.active = null; animation.oncancel?.(); },
        finish() { card.active = null; animation.onfinish?.(); },
      };
      this.active = animation; this.animations.push(animation);
      return animation;
    }
  }
  const card = new Element(), dialog = new Element({ excluded: true }), nested = new Element({ nested: true });
  const cards = [card, dialog, nested];
  const root = {
    animate() {},
    querySelectorAll: selector => selector === '.pb-card-resizing' ? cards.filter(c => c.classes.has('pb-card-resizing')) : cards,
  };
  class Resize {
    observed = new Set();
    constructor(callback) { this.callback = callback; resize = this; }
    observe(el) { this.observed.add(el); }
    unobserve(el) { this.observed.delete(el); }
    disconnect() { this.observed.clear(); }
    emit(el) { if (this.observed.has(el)) this.callback([{ target: el }]); }
  }
  class Mutation {
    constructor(callback) { this.callback = callback; mutation = this; }
    observe() {}
    disconnect() { this.disconnected = true; }
  }
  const addEventListener = (name, fn) => events.set(name, fn);
  const removeEventListener = name => events.delete(name);
  const document = { hidden: false, addEventListener, removeEventListener };
  const compiled = { exports: {} };
  vm.runInNewContext(source, {
    module: compiled, exports: compiled.exports, HTMLElement: Element,
    ResizeObserver: Resize, MutationObserver: Mutation, document,
    window: { matchMedia: () => media, addEventListener, removeEventListener },
  });
  const stop = compiled.exports.observeCardResizes(root);
  return { ...compiled.exports, root, card, dialog, nested, resize, mutation, media, document, events, stop, Element, cards };
}

test('height changes animate once, leave the final height intrinsic and avoid observer feedback', () => {
  const f = fixture();
  f.resize.emit(f.card);
  assert.equal(f.card.animations.length, 0, 'No size animation on first mount');
  f.card.naturalHeight = 280; f.resize.emit(f.card);
  assert.equal(f.card.active.frames[0].height, '100px');
  assert.equal(f.card.active.frames[1].height, '280px');
  assert.equal(f.resize.observed.has(f.card), false, 'Animated height cannot feed back into its observer');
  f.card.active.finish();
  assert.equal(f.card.offsetHeight, 280);
  assert.equal(f.card.classes.size, 0);
  assert.equal(f.resize.observed.has(f.card), true);
  assert.equal(f.resize.observed.has(f.dialog), false);
  assert.equal(f.resize.observed.has(f.nested), false);
  f.stop();
});

test('rapid content updates continue from the visible height and can reverse direction', () => {
  const f = fixture();
  f.card.naturalHeight = 300; f.resize.emit(f.card);
  f.card.active.visibleHeight = 180;
  f.card.naturalHeight = 120;
  f.mutation.callback([{ target: f.card, addedNodes: [] }]);
  assert.equal(f.card.active.frames[0].height, '180px');
  assert.equal(f.card.active.frames[1].height, '120px');
  f.card.active.finish();
  assert.equal(f.card.offsetHeight, 120);
  assert.equal(f.card.classes.size, 0);
  f.stop();
});

test('settling exposes final geometry for caching; reduced motion and viewport changes do not animate', () => {
  const f = fixture();
  f.card.naturalHeight = 250; f.resize.emit(f.card);
  f.card.active.visibleHeight = 150;
  f.settleCardResizes(f.root);
  assert.equal(f.card.offsetHeight, 250);
  assert.equal(f.card.classes.size, 0);
  f.media.matches = true;
  f.card.naturalHeight = 400; f.resize.emit(f.card);
  assert.equal(f.card.active, null);
  f.media.matches = false;
  f.card.offsetWidth = 500; f.card.naturalHeight = 300; f.resize.emit(f.card);
  assert.equal(f.card.active, null);
  f.stop();
  assert.equal(f.events.size, 0);
  assert.equal(f.resize.observed.size, 0);
  assert.equal(f.mutation.disconnected, true);
});

test('new cards register without an entrance resize and disconnected cards are released', () => {
  const f = fixture();
  const added = new f.Element(); f.cards.push(added);
  f.mutation.callback([{ target: f.root, addedNodes: [added] }]);
  assert.equal(added.animations.length, 0);
  added.naturalHeight = 200; f.resize.emit(added);
  assert.equal(added.active.frames[1].height, '200px');
  added.isConnected = false;
  f.mutation.callback([{ target: f.root, addedNodes: [] }]);
  assert.equal(f.resize.observed.has(added), false);
  f.stop();
});

test('a card excluded during loading starts observing when its busy state clears', () => {
  const f = fixture();
  const loading = new f.Element({ excluded: true }); f.cards.push(loading);
  f.mutation.callback([{ type: 'childList', target: f.root, addedNodes: [loading] }]);
  assert.equal(f.resize.observed.has(loading), false);
  loading.excluded = false;
  f.mutation.callback([{ type: 'attributes', target: loading, addedNodes: [] }]);
  assert.equal(f.resize.observed.has(loading), true);
  assert.equal(loading.animations.length, 0);
  loading.naturalHeight = 260; f.resize.emit(loading);
  assert.equal(loading.active.frames[1].height, '260px');
  f.stop();
});

test('language changes animate from captured heights even when translated layout changes width', () => {
  const f = fixture();
  f.events.get('pebble:before-language-change')();
  f.card.offsetWidth = 340; f.card.naturalHeight = 180;
  f.mutation.callback([{ target: f.card, addedNodes: [] }]);
  assert.equal(f.card.active.frames[0].height, '100px');
  assert.equal(f.card.active.frames[1].height, '180px');
  f.card.active.visibleHeight = 145;
  f.events.get('pebble:before-language-change')();
  f.card.offsetWidth = 300; f.card.naturalHeight = 100;
  f.mutation.callback([{ target: f.card, addedNodes: [] }]);
  assert.equal(f.card.active.frames[0].height, '145px', 'A rapid language reversal starts at the visible size');
  f.card.active.finish(); f.stop();
});

for (const reason of ['reduced', 'hidden']) test(`language resize respects ${reason} state`, () => {
  const f = fixture();
  if (reason === 'reduced') f.media.matches = true; else f.document.hidden = true;
  f.events.get('pebble:before-language-change')();
  f.card.offsetWidth = 340; f.card.naturalHeight = 180;
  f.mutation.callback([{ target: f.card, addedNodes: [] }]); f.resize.emit(f.card);
  assert.equal(f.card.active, null); f.stop();
});
