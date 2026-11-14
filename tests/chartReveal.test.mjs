import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import vm from 'node:vm';
const source = buildSync({ entryPoints: ['src/lib/chartReveal.ts'], bundle: true, write: false, platform: 'node', format: 'cjs' }).outputFiles[0].text;

function fixture({ reduced = false } = {}) {
  const frames = new Map(), observers = [], intersections = [], listeners = new Map(); let frameId = 0;
  const events = key => ({ addEventListener: (type, fn) => listeners.set(`${key}:${type}`, fn), removeEventListener: type => listeners.delete(`${key}:${type}`) });
  class Element {
    constructor(className = '') { this.className = className; this.children = []; this.parentElement = null; this.attributes = new Set(); this.hidden = false; this.isConnected = true; this.namespaceURI = 'http://www.w3.org/1999/xhtml'; this.animations = []; this.visibility = 'visible'; }
    matches(selector) {
      return selector.split(',').some(s => { s = s.trim(); if (s.startsWith('.')) return this.className.split(' ').includes(s.slice(1)); if (s === '[data-pb-chart-load]') return this.attributes.has('data-pb-chart-load'); if (s === '[hidden]') return this.hidden; if (s === '[aria-busy="true"]') return this.busy; return false; });
    }
    closest(selector) { for (let el = this; el; el = el.parentElement) if (el.matches(selector)) return el; return null; }
    querySelectorAll(selector) { return this.children.flatMap(el => [...(el.matches(selector) ? [el] : []), ...el.querySelectorAll(selector)]); }
    append(el) { el.parentElement = this; this.children.push(el); }
    contains(el) { for (; el; el = el.parentElement) if (el === this) return true; return false; }
    hasAttribute(key) { return this.attributes.has(key); }
    getBoundingClientRect() { return { width: 320, height: 200 }; }
    getAnimations() { return this.animations; }
    animate(keyframes, options) {
      const element = this;
      const animation = { keyframes, options, id: '', pause() { this.paused = true; },
        cancel() { element.animations = element.animations.filter(a => a !== animation); },
        finish() { this.onfinish?.(); } };
      this.animations.push(animation); return animation;
    }
  }
  const root = new Element('pebble-root'), main = new Element('pebble-main'), content = new Element('pb-navigation-content'), chart = new Element('pb-chart-fade');
  root.append(main); main.append(content); content.append(chart);
  const media = { matches: reduced, ...events('motion') }, document = { hidden: false, ...events('document') };
  const compiled = { exports: {} };
  vm.runInNewContext(source, { module: compiled, exports: compiled.exports, Element,
    window: { matchMedia: () => media }, document,
    getComputedStyle: element => ({ opacity: '1', visibility: element.visibility, display: 'block', translate: 'none' }),
    requestAnimationFrame: fn => { frames.set(++frameId, fn); return frameId; }, cancelAnimationFrame: id => frames.delete(id),
    MutationObserver: class { constructor(callback) { this.callback = callback; observers.push(this); } observe() {} disconnect() { this.disconnected = true; } },
    IntersectionObserver: class { constructor(callback, options) { this.callback = callback; this.options = options; this.observed = new Set(); intersections.push(this); } observe(el) { this.observed.add(el); } unobserve(el) { this.observed.delete(el); } disconnect() { this.disconnected = true; this.observed.clear(); } },
  });
  const controller = compiled.exports.createPageChartReveal(content);
  const flush = () => { for (const [id, fn] of [...frames]) { frames.delete(id); fn(); } };
  const see = element => { intersections[0].callback([{ target: element, isIntersecting: true }]); flush(); };
  const mutate = (target, addedNodes = []) => { observers[0].callback([{ type: addedNodes.length ? 'childList' : 'attributes', target, addedNodes }]); flush(); };
  return { controller, root, main, content, chart, media, document, Element, observers, intersections, listeners, flush, see, mutate,
    entries: el => el.animations.filter(a => a.id === 'pb-chart-page-entry') };
}

test('charts wait for actual page visibility and first intersection, then animate only once', () => {
  const f = fixture();
  assert.equal(f.chart.animations[0].id, 'pb-chart-page-hold');
  f.see(f.chart); assert.equal(f.entries(f.chart).length, 0, 'An intersecting hidden-loading chart must wait');
  f.controller.reveal(); f.flush(); assert.equal(f.entries(f.chart).length, 1);
  assert.equal(f.entries(f.chart)[0].keyframes[0].opacity, 0);
  assert.equal(f.entries(f.chart)[0].keyframes[1].opacity, 1);
  f.entries(f.chart)[0].finish(); assert.equal(f.chart.animations.length, 0);
  f.controller.reveal(); f.mutate(f.chart); f.see(f.chart);
  assert.equal(f.entries(f.chart).length, 0, 'Ordinary updates, hover and resize cannot replay completed charts');
  f.controller.dispose(); assert(f.observers[0].disconnected); assert(f.intersections[0].disconnected); assert.equal(f.listeners.size, 0);
});

test('late charts and hidden sections get one entry; nested privacy wrappers do not duplicate animation', () => {
  const f = fixture(); f.controller.reveal(); f.see(f.chart); f.entries(f.chart)[0].finish();
  const inner = new f.Element('pb-chart-fill'); f.chart.append(inner); f.mutate(f.chart, [inner]);
  assert.equal(inner.animations.length, 0);
  const section = new f.Element(); section.hidden = true; f.content.append(section);
  const chart = new f.Element('pb-chart-fade'); section.append(chart); f.mutate(section, [chart]); f.see(chart);
  assert.equal(f.entries(chart).length, 0);
  section.hidden = false; f.mutate(section); f.see(chart);
  assert.equal(f.entries(chart).length, 1);
  f.controller.dispose();
});

test('new charts wait through sidebar motion without replaying an already loaded chart', () => {
  const f = fixture(); f.controller.reveal(); f.see(f.chart); f.entries(f.chart)[0].finish();
  f.main.attributes.add('data-pb-sidebar-phase');
  const chart = new f.Element('pb-chart-fade'); f.content.append(chart); f.mutate(f.content, [chart]); f.see(chart);
  assert.equal(f.entries(chart).length, 0);
  f.main.attributes.delete('data-pb-sidebar-phase'); f.mutate(f.main);
  assert.equal(f.entries(chart).length, 1); assert.equal(f.entries(f.chart).length, 0);
  f.controller.dispose();
});

test('reduced motion leaves final data visible and cancels pending chart masks', () => {
  const reduced = fixture({ reduced: true }); reduced.controller.reveal(); reduced.see(reduced.chart);
  assert.equal(reduced.chart.animations.length, 0); reduced.controller.dispose();
  const f = fixture(); f.media.matches = true; f.listeners.get('motion:change')();
  assert.equal(f.chart.animations.length, 0); assert.equal(f.intersections[0].observed.size, 0);
  f.controller.dispose();
});

test('busy wrappers are discovered when they become ready, and SVG rotation is not overwritten', () => {
  const f = fixture(); f.controller.reveal();
  const chart = new f.Element('pb-chart-fade'); chart.busy = true; chart.namespaceURI = 'http://www.w3.org/2000/svg';
  f.content.append(chart); f.mutate(f.content, [chart]); assert.equal(chart.animations.length, 0);
  chart.busy = false; f.mutate(chart); f.see(chart);
  const entry = f.entries(chart)[0]; assert(entry);
  assert.equal(entry.keyframes[0].translate, '0 4px'); assert(!('transform' in entry.keyframes[0]));
  f.controller.dispose();
});


test('native goals timelines, calendar heatmaps and allocation bars share the same entry lifecycle', () => {
  const f = fixture(); f.controller.reveal();
  for (const name of ['pb-goals-tl-plot', 'pb-ins-year-inner', 'pb-plan-barwrap', 'pb-ana-meter', 'pb-txn-mix-strip']) {
    const chart = new f.Element(name); f.content.append(chart); f.mutate(f.content, [chart]); f.see(chart);
    assert.equal(f.entries(chart).length, 1, name);
  }
  f.controller.dispose();
});
