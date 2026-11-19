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
    getBoundingClientRect() { return { top: 0, height: this.offsetHeight }; }
    closest() { return this.excluded ? this : null; }
    getClientRects() { return [1]; }
    contains(node) { return node === this; }
    matches() { return true; }
    querySelectorAll() { return []; }
    getAnimations() { return this.active ? [this.active] : []; }
    animate(frames, options) {
      const card = this;
      const animation = {
        frames, options, visibleHeight: parseFloat(frames[0].height), playState: 'running',
        cancel() { card.active = null; animation.playState = 'idle'; animation.oncancel?.(); },
        finish() { card.active = null; animation.playState = 'finished'; animation.onfinish?.(); },
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

test('ordinary resize measures paired cards before applying either animation', () => {
  const f = fixture();
  const peer = new f.Element(); f.cards.push(peer);
  f.mutation.callback([{ target: f.root, addedNodes: [peer] }]);
  f.card.naturalHeight = 240;
  Object.defineProperty(peer, 'offsetHeight', { get: () => f.card.offsetHeight });
  f.resize.callback([{ target: f.card }, { target: peer }]);
  assert.equal(f.card.active.frames[1].height, '240px');
  assert.equal(peer.active.frames[1].height, '240px');
  f.stop();
});

test('replacing a statement month cancels its resize and adopts the new height', () => {
  const f = fixture();
  const statement = new f.Element();
  statement.querySelectorAll = selector => selector.includes('period-body') ? [] : [f.card];
  statement.getAttribute = () => null;
  const monthChanged = { type: 'attributes', attributeName: 'data-pb-resize-reset', target: statement, addedNodes: [] };

  f.card.naturalHeight = 300;
  f.mutation.callback([monthChanged]);
  f.resize.emit(f.card);
  assert.equal(f.card.animations.length, 0);

  f.card.naturalHeight = 350;
  f.resize.emit(f.card);
  assert.equal(f.card.active.frames[0].height, '300px');

  f.card.naturalHeight = 160;
  f.mutation.callback([monthChanged]);
  f.resize.emit(f.card);
  assert.equal(f.card.active, null);
  assert.equal(f.card.offsetHeight, 160);
  assert.equal(f.card.classes.size, 0);
  assert.equal(f.card.animations.length, 1);
  f.stop();
});

test('a user-selected month owns its animation and a quick reversal starts at the painted height', () => {
  const f = fixture();
  const statement = new f.Element();
  const body = new f.Element();
  statement.querySelectorAll = selector => selector.includes('period-body') ? [body] : [f.card];
  statement.getAttribute = () => '1';
  const monthChanged = { type: 'attributes', attributeName: 'data-pb-resize-reset', target: statement, addedNodes: [] };

  f.capturePeriodCardHeights(statement, 400);
  f.card.naturalHeight = 300;
  f.mutation.callback([monthChanged]);
  const first = f.card.active;
  assert.equal(first.frames[0].height, '100px');
  assert.equal(first.frames[1].height, '300px');
  assert.equal(body.active.frames[1].opacity, 1);
  assert.equal(body.active.frames[0].translate, '0 12px');

  first.visibleHeight = 180;
  f.mutation.callback([{ target: f.card, addedNodes: [] }]);
  assert.equal(f.card.active, first);

  f.capturePeriodCardHeights(statement, 400);
  f.card.naturalHeight = 120;
  f.mutation.callback([monthChanged]);
  assert.equal(f.card.active.frames[0].height, '180px');
  assert.equal(f.card.active.frames[1].height, '120px');
  // A browser can drop the finished effect before delivering its callback.
  f.card.active.playState = 'finished';
  f.card.active.visibleHeight = undefined;
  f.capturePeriodCardHeights(statement, 400);
  f.card.naturalHeight = 260;
  f.mutation.callback([monthChanged]);
  assert.equal(f.card.active.frames[0].height, '120px');
  f.card.active.finish();
  assert.equal(f.card.offsetHeight, 260);
  f.stop();
});

test('a month switch animates the visible part of the edge across the viewport boundary', () => {
  const f = fixture();
  const statement = new f.Element();
  const body = new f.Element();
  statement.querySelectorAll = selector => selector.includes('period-body') ? [body] : [f.card];
  statement.getAttribute = () => '-1';
  const monthChanged = { type: 'attributes', attributeName: 'data-pb-resize-reset', target: statement, addedNodes: [] };

  f.capturePeriodCardHeights(statement, 200);
  f.card.naturalHeight = 350;
  f.mutation.callback([monthChanged]);
  assert.equal(f.card.active.frames[0].height, '100px');
  assert.equal(f.card.active.frames[1].height, '224px');
  assert.equal(body.active.frames[0].translate, '0 -12px');
  assert.equal(body.active.frames[1].opacity, 1);
  f.card.active.finish();
  assert.equal(f.card.offsetHeight, 350);

  f.capturePeriodCardHeights(statement, 200);
  f.card.naturalHeight = 100;
  f.mutation.callback([monthChanged]);
  assert.equal(f.card.active.frames[0].height, '224px');
  assert.equal(f.card.active.frames[1].height, '100px');
  f.card.active.finish();
  assert.equal(f.card.offsetHeight, 100);
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
  f.events.get('pebble:after-language-change')();
  assert.equal(f.card.active.frames[0].height, '100px');
  assert.equal(f.card.active.frames[1].height, '180px');
  f.card.active.visibleHeight = 145;
  f.events.get('pebble:before-language-change')();
  f.card.offsetWidth = 300; f.card.naturalHeight = 100;
  f.mutation.callback([{ target: f.card, addedNodes: [] }]);
  f.events.get('pebble:after-language-change')();
  assert.equal(f.card.active.frames[0].height, '145px', 'A rapid language reversal starts at the visible size');
  f.card.active.finish(); f.stop();
});

for (const reason of ['reduced', 'hidden']) test(`language resize respects ${reason} state`, () => {
  const f = fixture();
  if (reason === 'reduced') f.media.matches = true; else f.document.hidden = true;
  f.events.get('pebble:before-language-change')();
  f.card.offsetWidth = 340; f.card.naturalHeight = 180;
  f.mutation.callback([{ target: f.card, addedNodes: [] }]); f.resize.emit(f.card);
  f.events.get('pebble:after-language-change')();
  assert.equal(f.card.active, null); f.stop();
});

test('language changes measure paired stretched cards before either animation starts', () => {
  const f = fixture();
  const peer = new f.Element(); f.cards.push(peer);
  f.mutation.callback([{ target: f.root, addedNodes: [peer] }]);
  for (const [card, other] of [[f.card, peer], [peer, f.card]]) {
    Object.defineProperty(card, 'offsetHeight', { get() {
      return card.active?.visibleHeight ?? Math.max(card.naturalHeight, other.active?.visibleHeight ?? other.naturalHeight);
    } });
    card.naturalHeight = 300;
  }
  f.events.get('pebble:before-language-change')();
  f.card.naturalHeight = 100; peer.naturalHeight = 80;
  f.mutation.callback([{ target: f.card, addedNodes: [] }, { target: peer, addedNodes: [] }]);
  f.events.get('pebble:after-language-change')();
  assert.equal(f.card.active.frames[0].height, '300px');
  assert.equal(peer.active.frames[0].height, '300px');
  assert.equal(f.card.active.frames[1].height, '100px');
  assert.equal(peer.active.frames[1].height, '100px', 'A sibling animation must not contaminate the natural endpoint');
  f.card.active.visibleHeight = 100; peer.active.visibleHeight = 100;
  f.card.active.finish(); peer.active.finish();
  f.resize.emit(f.card); f.resize.emit(peer);
  assert.equal(f.card.animations.length, 1);
  assert.equal(peer.animations.length, 1);
  assert.equal(f.card.active, null); assert.equal(peer.active, null);
  f.stop();
});

test('language transitions include nested cards without adding ordinary resize feedback', () => {
  const f = fixture();
  f.events.get('pebble:before-language-change')();
  f.card.naturalHeight = 240; f.nested.naturalHeight = 180;
  f.mutation.callback([{ target: f.card, addedNodes: [] }]);
  f.events.get('pebble:after-language-change')();
  assert.equal(f.card.active.options.duration, 420);
  assert.equal(f.nested.active.options.duration, 420);
  assert.equal(f.card.active.options.easing, 'cubic-bezier(.4,0,.2,1)');
  f.card.active.finish(); f.nested.active.finish();
  assert.equal(f.nested.active, null);
  assert.equal(f.resize.observed.has(f.nested), false);
  f.stop();
});

test('incidental content updates do not restart a language transition', () => {
  const f = fixture();
  f.events.get('pebble:before-language-change')();
  f.card.naturalHeight = 180;
  f.mutation.callback([{ target: f.card, addedNodes: [] }]);
  f.events.get('pebble:after-language-change')();
  const transition = f.card.active;
  transition.visibleHeight = 130;
  f.mutation.callback([{ target: f.card, addedNodes: [] }]);
  assert.equal(f.card.active, transition);
  assert.equal(f.card.animations.length, 1);
  transition.finish();
  assert.equal(f.card.offsetHeight, 180);
  f.stop();
});

test('early shell mutations cannot consume the language snapshot before translated cards commit', () => {
  const f = fixture();
  f.events.get('pebble:before-language-change')();
  f.mutation.callback([{ target: f.root, addedNodes: [] }]);
  f.resize.emit(f.card);
  assert.equal(f.card.active, null);
  f.card.naturalHeight = 220;
  f.mutation.callback([{ target: f.card, addedNodes: [] }]);
  assert.equal(f.card.active, null, 'Wait for the translated React commit, not an arbitrary mutation');
  f.events.get('pebble:after-language-change')();
  assert.equal(f.card.active.frames[0].height, '100px');
  assert.equal(f.card.active.frames[1].height, '220px');
  assert.equal(f.card.active.options.duration, 420);
  f.card.active.finish(); f.stop();
});
