import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import vm from 'node:vm';

const source = buildSync({
  entryPoints: ['src/components/reports/useReportInspectorLayout.ts'], bundle: true,
  write: false, platform: 'node', format: 'cjs',
  external: ['react', 'react-dom', '@/lib/cardResize', './summaryLayoutMotion'],
}).outputFiles[0].text;

const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
const flush = () => new Promise(resolve => setImmediate(resolve));

function fixture({ wide = true, reduced = false, resizePreference = null, summary = false, reflow = true, summaryMasks = false } = {}) {
  const trace = [];
  const events = () => {
    const handlers = new Map();
    return {
      addEventListener(name, fn) { if (!handlers.has(name)) handlers.set(name, new Set()); handlers.get(name).add(fn); },
      removeEventListener(name, fn) { handlers.get(name)?.delete(fn); },
      emit(name) { for (const fn of [...(handlers.get(name) ?? [])]) fn(); },
      get listenerCount() { return [...handlers.values()].reduce((n, group) => n + group.size, 0); },
    };
  };
  class Element {
    constructor(name, classes = [], parent = null) {
      this.name = name; this.classes = classes; this.parentElement = parent;
      this.children = []; parent?.children.push(this);
      this.attrs = new Map(); this.isConnected = true;
      this.style = { setProperty: (key, value) => this.attrs.set(`style:${key}`, value) };
      this.rect = rect(0, 0, 1, 1); this.active = null; this.animations = [];
    }
    focus() { this.focused = true; }
    dispatchEvent(event) { this.events ??= []; this.events.push(event.type); return true; }
    closest(selector) { return this.classes.includes(selector.slice(1)) ? this : this.parentElement?.closest(selector) ?? null; }
    querySelectorAll(selector) {
      const found = [];
      for (const child of this.children) {
        if (child.classes.includes(selector.slice(1))) found.push(child);
        found.push(...child.querySelectorAll(selector));
      }
      return found;
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
    getAttribute(name) { return this.attrs.get(name) ?? null; }
    setAttribute(name, value) { this.attrs.set(name, value); }
    removeAttribute(name) { this.attrs.delete(name); }
    getBoundingClientRect() { trace.push(`read:${this.name}`); return this.active?.visualRect ?? this.rect; }
    animate(frames, options) {
      trace.push(`animate:${this.name}`);
      let resolve, reject;
      const animation = {
        frames, options, cancelled: false, visualRect: null,
        finished: new Promise((yes, no) => { resolve = yes; reject = no; }),
        cancel: () => {
          trace.push(`cancel:${this.name}`); animation.cancelled = true;
          if (this.active === animation) this.active = null;
          reject(new Error('cancelled'));
        },
        finish: () => { animation.finishedFlag = true; resolve(); },
      };
      this.active = animation; this.animations.push(animation);
      return animation;
    }
  }
  const page = new Element('page');
  const grid = new Element('grid', ['pb-rep-grid'], page);
  const main = new Element('main', ['pb-rep-main'], grid);
  const side = new Element('side', ['pb-rep-side-col'], grid);
  const inspector = new Element('inspector', ['card', 'pb-rep-filters'], side);
  const inspectorContent = new Element('inspector content', ['pb-rep-filter-content'], inspector);
  inspectorContent.rect = rect(0, 0, 326, 530);
  const hero = new Element('hero', ['card'], main);
  const nested = new Element('nested tile', ['card'], hero);
  const supports = summary ? Array.from({ length: 4 }, (_, i) => new Element(`support ${i}`, ['summary-support'], hero)) : [];
  const rail = new Element('rail', ['pb-rep-rail'], side);
  const results = new Element('results wrapper', ['pb-rep-results'], main);
  const firstPeriod = new Element('first period', ['card'], results);
  const secondPeriod = new Element('second period', ['card'], results);
  if (resizePreference !== null) main.setAttribute('data-pb-resize', resizePreference);
  const cards = [hero, firstPeriod, secondPeriod];
  const surfaces = [...cards, inspector];
  const layout = opened => {
    inspector.rect = rect(opened ? 912 : 1196, 100, opened ? 328 : 44, opened ? 532 : 152);
    hero.rect = rect(20, 100, opened ? 600 : 900, opened ? 500 : 300);
    firstPeriod.rect = rect(20, opened ? 620 : 420, opened ? 600 : 900, 100);
    secondPeriod.rect = rect(20, opened ? 740 : 540, opened ? 600 : 900, 140);
  };
  layout(false);
  const media = Object.assign(events(), { matches: reduced });
  const window = Object.assign(events(), { matchMedia: () => media });
  const document = Object.assign(events(), { hidden: false, timeline: { currentTime: 1234 } });
  const refs = [], effects = [];
  let refIndex, effectIndex, effectQueue;
  const react = {
    useRef(value) { const i = refIndex++; refs[i] ??= { current: value }; return refs[i]; },
    useLayoutEffect(callback, deps) {
      const i = effectIndex++, prior = effects[i];
      if (!prior || deps.some((value, index) => !Object.is(value, prior.deps[index]))) {
        effectQueue.push(() => { prior?.cleanup?.(); effects[i] = { deps: [...deps], cleanup: callback() }; });
      }
    },
  };
  const settled = [];
  const summaryApi = {
    captureSummary: () => summary ? { hero, columns: true, anchors: [], support: supports.map(element => ({ element,
      opacity: element.active?.visualOpacity ?? (element.active ? element.active.frames[element.active.finishedFlag ? element.active.frames.length - 1 : 0].opacity : 1),
    })) } : null,
    summaryWillReflow: () => reflow,
    fadeSummaryOut: captured => captured.support.map(({ element, opacity }) => element.animate([{ opacity }, { opacity: 0 }], { duration: 70, fill: 'both' })),
    animateSummary: () => summaryMasks ? supports.map(element => element.animate([{ opacity: 0 }, { opacity: 0 }], { duration: 360, fill: 'both' })) : [], // Geometry math is covered separately.
  };
  const compiled = { exports: {} };
  vm.runInNewContext(source, {
    module: compiled, exports: compiled.exports, window, document, Event: class { constructor(type) { this.type = type; } },
    getComputedStyle: () => ({ display: wide ? 'grid' : 'flex', getPropertyValue: () => 'cubic-bezier(.4,0,.2,1)' }),
    require: name => {
      if (name === 'react') return react;
      if (name === './summaryLayoutMotion') return summaryApi;
      if (name === 'react-dom') return { flushSync: update => { trace.push('flush:start'); update(); trace.push('flush:end'); } };
      return { settleCardResizes: scope => settled.push(scope) };
    },
  });
  const pageRef = { current: page };
  const render = (opened, ready = true) => {
    refIndex = 0; effectIndex = 0; effectQueue = [];
    const run = compiled.exports.useReportInspectorLayout(pageRef, opened, ready);
    for (const effect of effectQueue) effect();
    return run;
  };
  const stop = () => { for (const effect of effects) effect.cleanup?.(); };
  return { page, grid, main, hero, nested, firstPeriod, secondPeriod, inspector, cards, surfaces, supports, rail, contentSurfaces: [...supports, rail, inspectorContent], layout, media, window, document, render, trace, settled, stop };
}

test('hero and each period card move together, without separately animating nested tiles', async () => {
  const f = fixture();
  const run = f.render(false);
  assert.ok(f.cards.every(card => card.animations.length === 0), 'Mounting does not animate a saved layout');
  run(() => {
    assert.equal(f.main.getAttribute('data-pb-resize'), 'off', 'One owner controls the transition before the commit');
    assert.equal(f.grid.getAttribute('data-pb-inspector-motion'), '');
    assert.deepEqual(f.settled, [f.main], 'A previous generic resize is settled before the layout commit');
    f.layout(true); f.render(true);
  });
  assert.ok(f.trace.lastIndexOf('animate:inspector') < f.trace.lastIndexOf('flush:end'), 'The new geometry and every motion are committed atomically');
  assert.ok(f.trace.lastIndexOf('read:second period') < f.trace.indexOf('animate:hero'), 'Batch final geometry reads before any animation writes');
  for (const card of f.cards) {
    assert.equal(card.animations.length, 1);
    assert.equal(card.active.options.duration, 360);
    assert.equal(card.active.options.delay, 0);
    assert.equal(card.active.options.easing, 'cubic-bezier(.4,0,.2,1)');
    assert.equal(card.active.id, 'pb-report-inspector-layout');
  }
  assert.equal(f.hero.active.frames[0].transform, 'translate(0px, 0px) scale(1.5, 0.6)');
  assert.equal(f.firstPeriod.active.frames[0].transform, 'translate(0px, -200px) scale(1.5, 1)');
  assert.equal(f.secondPeriod.active.frames[0].transform, 'translate(0px, -200px) scale(1.5, 1)');
  assert.equal(f.nested.animations.length, 0, 'A tile already follows its containing hero');
  assert.equal(f.inspector.active.id, 'pb-report-inspector-surface');
  assert.match(f.inspector.active.frames[0].transform, /scale\(0\.134/);
  assert.equal(f.inspector.active.frames.at(-1).transform, 'translate(0px, 0px) scale(1, 1)');
  assert.equal(f.inspector.active.options.duration, f.hero.active.options.duration);
  assert.equal(f.inspector.active.options.delay, f.hero.active.options.delay);
  assert.equal(f.inspector.active.startTime, 1234);
  assert.ok(f.cards.every(card => card.active.startTime === f.inspector.active.startTime), 'Reversals share an explicit timeline origin');
  assert.equal(f.inspector.active.options.easing, f.hero.active.options.easing);
  for (const card of [...f.surfaces, ...f.contentSurfaces]) card.active?.finish();
  await flush();
  assert.equal(f.main.getAttribute('data-pb-resize'), null);
  assert.equal(f.grid.getAttribute('data-pb-inspector-motion'), null);
  assert.ok(f.cards.every(card => card.active === null), 'Final geometry becomes intrinsic again');
  f.stop();
});

test('closing and rapid reversals start from visible rectangles before old animations are cancelled', async () => {
  const f = fixture({ resizePreference: 'custom' });
  let run = f.render(false); run(() => { f.layout(true); run = f.render(true); });
  const firstMotion = f.hero.active;
  firstMotion.visualRect = rect(20, 100, 750, 400);
  f.inspector.active.visualRect = rect(1054, 100, 186, 342);
  f.firstPeriod.active.visualRect = rect(20, 520, 750, 100);
  f.secondPeriod.active.visualRect = rect(20, 640, 750, 140);
  f.trace.length = 0;
  run(() => { f.layout(false); f.render(false); });
  assert.ok(f.trace.indexOf('read:hero') < f.trace.indexOf('cancel:hero'));
  assert.ok(f.trace.indexOf('read:inspector') < f.trace.indexOf('cancel:inspector'));
  assert.equal(firstMotion.cancelled, true);
  assert.equal(f.hero.active.frames[0].transform, `translate(0px, 0px) scale(${750 / 900}, ${400 / 300})`);
  assert.equal(f.firstPeriod.active.frames[0].transform, `translate(0px, 100px) scale(${750 / 900}, 1)`);
  assert.equal(f.hero.active.options.delay, 0, 'An interrupted motion reverses immediately without a closing pause');
  assert.equal(f.hero.active.options.duration, 360);
  assert.match(f.inspector.active.frames[0].transform, /scale\(/);
  assert.equal(f.inspector.active.frames[0].offset, 0);
  assert.equal(f.inspector.active.options.delay, f.hero.active.options.delay);
  assert.equal(f.inspector.active.startTime, 1234);
  assert.ok(f.cards.every(card => card.active.startTime === f.inspector.active.startTime), 'Reversals share an explicit timeline origin');
  const latest = f.hero.active;
  await flush();
  assert.equal(f.hero.active, latest, 'Rejected promises from old motion cannot cancel the replacement');
  for (const card of [...f.surfaces, ...f.contentSurfaces]) card.active?.finish();
  await flush();
  assert.equal(f.main.getAttribute('data-pb-resize'), 'custom', 'Restore a pre-existing resize preference');
  f.stop();
});

for (const mode of [{ wide: false }, { reduced: true }]) {
  test(`mobile/reduced-motion skips the desktop effect: ${JSON.stringify(mode)}`, () => {
    const f = fixture(mode);
    const run = f.render(false); run(() => { f.layout(true); f.render(true); });
    assert.ok(f.cards.every(card => card.animations.length === 0));
    assert.equal(f.main.getAttribute('data-pb-resize'), null);
    assert.equal(f.grid.getAttribute('data-pb-inspector-motion'), null);
    assert.equal(f.settled.length, 0);
    f.stop();
  });
}

for (const reason of ['resize', 'pagehide', 'hidden', 'reduced', 'unmount']) {
  test(`${reason} settles active motion and removes its transient state`, async () => {
    const f = fixture();
    const run = f.render(false); run(() => { f.layout(true); f.render(true); });
    const animations = f.surfaces.map(card => card.active);
    if (reason === 'unmount') f.stop();
    else if (reason === 'hidden') { f.document.hidden = true; f.document.emit('visibilitychange'); }
    else if (reason === 'reduced') { f.media.matches = true; f.media.emit('change'); }
    else f.window.emit(reason);
    await flush();
    assert.ok(animations.every(animation => animation.cancelled));
    assert.equal(f.main.getAttribute('data-pb-resize'), null);
    assert.equal(f.grid.getAttribute('data-pb-inspector-motion'), null);
    if (reason !== 'unmount') f.stop();
    assert.equal(f.window.listenerCount + f.document.listenerCount + f.media.listenerCount, 0);
  });
}

test('a hidden document settles a prepared change without starting animations', () => {
  const f = fixture();
  const run = f.render(false);
  run(() => { f.document.hidden = true; f.layout(true); f.render(true); });
  assert.ok(f.cards.every(card => card.animations.length === 0));
  assert.equal(f.main.getAttribute('data-pb-resize'), null);
  assert.equal(f.grid.getAttribute('data-pb-inspector-motion'), null);
  f.stop();
});

test('an unchanged expanded value still commits the callback and releases capture state', () => {
  const f = fixture();
  const run = f.render(false);
  let committed = false;
  run(() => { committed = true; f.render(false); });
  assert.equal(committed, true);
  assert.equal(f.main.getAttribute('data-pb-resize'), null);
  assert.equal(f.grid.getAttribute('data-pb-inspector-motion'), null);
  assert.ok(f.surfaces.every(card => card.animations.length === 0));
  f.stop();
});

test('a column switch waits for the old supporting content to fade before committing the new layout', async () => {
  const f = fixture({ summary: true });
  const run = f.render(false);
  let commits = 0;
  run(() => { commits++; f.layout(true); f.render(true); });
  assert.equal(commits, 0, 'Do not expose destination layout while old supporting content is visible');
  assert.equal(f.grid.getAttribute('data-pb-summary-exit'), '');
  assert.equal(f.main.getAttribute('data-pb-resize'), null, 'Card geometry remains intrinsic during the brief content exit');
  assert.ok(f.surfaces.every(card => card.animations.length === 0));
  const exitAnimations = f.contentSurfaces.map(element => element.active).filter(Boolean);
  assert.ok(exitAnimations.every(animation => animation.options.duration === 70 && animation.frames.at(-1).opacity === 0));
  // One finished region is insufficient: the chart must also finish its exit.
  exitAnimations[0].finish(); await flush();
  assert.equal(commits, 0);
  exitAnimations.slice(1).forEach(animation => animation.finish()); await flush();
  assert.equal(commits, 1);
  assert.equal(f.grid.getAttribute('data-pb-summary-exit'), null);
  assert.equal(f.grid.getAttribute('data-pb-inspector-motion'), '');
  assert.ok(exitAnimations.every(animation => animation.cancelled), 'Owned exit layers are removed during the atomic layout handoff');
  assert.ok(f.cards.every(card => card.active?.id === 'pb-report-inspector-layout'));
  f.stop(); await flush();
});

test('a second toggle during the content exit cancels its queued commit and restores the visible opacity', async () => {
  const f = fixture({ summary: true });
  const run = f.render(false);
  let commits = 0;
  run(() => { commits++; f.layout(true); f.render(true); });
  const exitAnimations = f.contentSurfaces.map(element => element.active).filter(Boolean);
  exitAnimations.forEach(animation => { animation.visualOpacity = .45; });
  run(() => { commits++; });
  await flush();
  assert.equal(commits, 0, 'Neither the first action nor the cancellation may change the layout');
  assert.equal(f.grid.getAttribute('data-pb-summary-exit'), null);
  assert.equal(f.grid.getAttribute('data-pb-inspector-motion'), null);
  assert.equal(f.rail.focused, true, 'Return focus to the still-visible filter control');
  assert.ok(exitAnimations.every(animation => animation.cancelled));
  for (const element of f.supports) {
    assert.equal(element.active.options.duration, 90);
    assert.equal(element.active.frames[0].opacity, .45, 'Restore from the currently visible opacity');
    assert.equal(element.active.frames.at(-1).opacity, 1);
    element.active.finish();
  }
  for (const element of f.contentSurfaces) element.active?.finish();
  await flush();
  assert.equal(commits, 0, 'Late settlement of the old promises cannot revive the cancelled action');
  assert.ok(f.supports.every(element => element.active === null));
  f.stop();
});

test('an explicit open action replaces a queued close instead of being mistaken for a toggle cancellation', async () => {
  const f = fixture({ summary: true });
  f.layout(true);
  const run = f.render(true);
  let closeCalls = 0, openCalls = 0, findOpened = false;
  run(() => { closeCalls++; f.layout(false); f.render(false); });
  run(() => { openCalls++; findOpened = true; f.layout(true); f.render(true); }, 'open');
  assert.equal(openCalls, 0, 'Keep the latest explicit intent queued behind the already-running content exit');
  for (const element of f.contentSurfaces) element.active?.finish();
  await flush();
  assert.equal(closeCalls, 0);
  assert.equal(openCalls, 1);
  assert.equal(findOpened, true, 'The Find shortcut callback must not be dropped');
  assert.equal(f.grid.getAttribute('data-pb-summary-exit'), null);
  assert.equal(f.grid.getAttribute('data-pb-inspector-motion'), null, 'Same-state explicit actions must release prepared layout state');
  f.stop(); await flush();
});

for (const reason of ['resize', 'pagehide', 'hidden', 'reduced', 'unmount']) {
  test(`${reason} cancels a queued summary exit without committing a stale action`, async () => {
    const f = fixture({ summary: true });
    const run = f.render(false);
    let commits = 0;
    run(() => { commits++; f.layout(true); f.render(true); });
    const exitAnimations = f.contentSurfaces.map(element => element.active).filter(Boolean);
    if (reason === 'unmount') f.stop();
    else if (reason === 'hidden') { f.document.hidden = true; f.document.emit('visibilitychange'); }
    else if (reason === 'reduced') { f.media.matches = true; f.media.emit('change'); }
    else f.window.emit(reason);
    await flush();
    assert.ok(exitAnimations.every(animation => animation.cancelled));
    assert.equal(commits, 0);
    assert.equal(f.grid.getAttribute('data-pb-summary-exit'), null);
    assert.equal(f.grid.getAttribute('data-pb-inspector-motion'), null);
    assert.equal(f.main.getAttribute('data-pb-resize'), null);
    // Even a late resolved completion must not replay a discarded intent.
    exitAnimations.forEach(animation => animation.finish()); await flush();
    assert.equal(commits, 0);
    if (reason !== 'unmount') f.stop();
    assert.equal(f.window.listenerCount + f.document.listenerCount + f.media.listenerCount, 0);
  });
}

test('same-column summaries also hide supporting text before a width change', async () => {
  const f = fixture({ summary: true, reflow: false });
  const run = f.render(false);
  let commits = 0;
  run(() => { commits++; f.layout(true); f.render(true); });
  assert.equal(commits, 0);
  for (const element of f.contentSurfaces) element.active?.finish();
  await flush();
  assert.equal(commits, 1);
  assert.equal(f.grid.getAttribute('data-pb-summary-exit'), null);
  f.stop();
});

for (const mode of [{ wide: false }, { reduced: true }]) {
  test(`a potentially reflowing summary still skips staging for ${JSON.stringify(mode)}`, () => {
    const f = fixture({ summary: true, ...mode });
    const run = f.render(false);
    let commits = 0;
    run(() => { commits++; f.layout(true); f.render(true); });
    assert.equal(commits, 1);
    assert.equal(f.grid.getAttribute('data-pb-summary-exit'), null);
    assert.ok(f.supports.every(element => !element.animations.length));
    assert.ok(f.surfaces.every(element => !element.animations.length));
    f.stop();
  });
}


test('summary reveal and inspector readiness start together after every geometry animation finishes', async () => {
  const f = fixture({ summary: true, summaryMasks: true });
  const run = f.render(false);
  run(() => { f.layout(true); f.render(true); });
  f.contentSurfaces.forEach(element => element.active?.finish()); await flush();
  assert.equal(f.grid.getAttribute('data-pb-inspector-motion'), '');
  const readyCount = () => (f.inspector.events ?? []).filter(name => name === 'pb-report-inspector-settled').length;
  const before = readyCount();
  [...f.cards, ...f.contentSurfaces].forEach(element => element.active?.finish()); await flush();
  assert.equal(readyCount(), before, 'Wait for the filter geometry as well as the cards');
  f.inspector.active.finish(); await flush();
  assert.equal(readyCount(), before + 1, 'Release filter content in the same handoff as summary reveal');
  for (const element of f.supports) {
    assert.equal(element.active.options.duration, 80);
    assert.equal(element.active.options.delay ?? 0, 0, 'No stagger between chart and figures');
    assert.equal(element.active.frames[0].opacity, 0);
    assert.equal(element.active.frames.at(-1).opacity, 1);
    element.active.finish();
  }
  const filterContent = f.inspector.querySelector('.pb-rep-filter-content');
  assert.equal(filterContent.active.options.duration, 80);
  assert.equal(filterContent.active.startTime, f.supports[0].active.startTime);
  filterContent.active.finish();
  await flush(); f.stop();
});
