import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import vm from 'node:vm';

const source = buildSync({ entryPoints: ['src/lib/cardGlow.ts'], bundle: true, write: false,
  platform: 'node', format: 'cjs' }).outputFiles[0].text;
const CARDS = '.card,[data-slot="card"],.pb-hero,.pb-accounts-tile,.pb-accounts-cc,.add-goal-tile,.stat-tab';

function fixture({ width = 1200, localAtWide = false, anchors = false, intersections = false, contentWidth = null } = {}) {
  let root, scans = 0, nextFrame = 0;
  const frames = new Map(), resizes = [], mutations = [], visibility = [], reads = new Map();
  const eventTarget = () => {
    const listeners = new Map();
    return {
      addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
      removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
      emit(type) { for (const fn of [...listeners.get(type) ?? []]) fn(); },
      get listenerCount() { return [...listeners.values()].reduce((count, set) => count + set.size, 0); },
    };
  };
  class Element {
    constructor(tag = 'div') {
      this.tagName = tag; this.children = []; this.parentElement = null; this.attrs = new Map(); this.dataset = {};
      this.rect = { left: 0, top: 0, width: 300, height: 200 }; this.clientWidth = 300; this.clientHeight = 200;
      this.scrollTop = this.scrollLeft = this.scrollHeight = 0;
      const properties = new Map();
      this.style = { getPropertyValue: key => properties.get(key) ?? '',
        setProperty: (key, value) => properties.set(key, value), removeProperty: key => properties.delete(key) };
      Object.assign(this, eventTarget());
    }
    get className() { return this.attrs.get('class') ?? ''; }
    set className(value) { this.attrs.set('class', value); }
    matches(selector) {
      return selector.split(',').some(part => {
        part = part.trim();
        if (part.startsWith('.')) return this.className.split(/\s+/).includes(part.slice(1));
        const attribute = part.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
        return attribute ? this.attrs.has(attribute[1]) && (attribute[2] === undefined || this.attrs.get(attribute[1]) === attribute[2]) : this.tagName === part;
      });
    }
    closest(selector) { for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node; return null; }
    querySelectorAll(selector) {
      if (this === root && selector === CARDS) scans++;
      return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
    }
    querySelector(selector) { for (const child of this.children) { if (child.matches(selector)) return child; const found = child.querySelector(selector); if (found) return found; } return null; }
    append(...nodes) { for (const node of nodes) { node.remove(); node.parentElement = this; this.children.push(node); } }
    remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); this.parentElement = null; }
    setAttribute(key, value) { this.attrs.set(key, value); }
    getAttribute(key) { return this.attrs.get(key) ?? null; }
    getBoundingClientRect() { reads.set(this, (reads.get(this) ?? 0) + 1); return { ...this.rect }; }
    getAnimations() { return []; }
  }
  class HTMLElement extends Element {}
  class SVGElement extends Element {}
  root = new HTMLElement(); root.className = 'pebble-root'; root.clientWidth = width;
  const content = contentWidth === null ? null : new HTMLElement();
  if (content) { content.className = 'pebble-main-content'; content.clientWidth = contentWidth; content.rect.width = contentWidth; root.append(content); }
  const report = new HTMLElement(); report.className = 'pb-rep'; (content ?? root).append(report);
  const card = new HTMLElement(); card.className = 'card'; report.append(card);
  const layer = new HTMLElement(); layer.className = 'pb-card-glows'; root.append(layer);
  const document = Object.assign(eventTarget(), {
    hidden: false, createElement: tag => new HTMLElement(tag), createElementNS: (_, tag) => new SVGElement(tag),
  });
  const window = eventTarget();
  const compiled = { exports: {} };
  vm.runInNewContext(source, {
    module: compiled, exports: compiled.exports, document, window, Element, HTMLElement,
    getComputedStyle(element) { return { opacity: '1', visibility: 'visible', display: 'block', position: 'static', overflowY: 'visible',
      borderTopLeftRadius: '20px', borderTopRightRadius: '20px', borderBottomRightRadius: '20px', borderBottomLeftRadius: '20px',
      getPropertyValue: name => name === '--pb-card-glow-local' ? (localAtWide && (content?.clientWidth ?? root.clientWidth) >= 1040 ? '1' : '0') : '' }; },
    requestAnimationFrame(fn) { frames.set(++nextFrame, fn); return nextFrame; }, cancelAnimationFrame(id) { frames.delete(id); },
    IntersectionObserver: intersections ? class {
      constructor(callback, options) { this.callback = callback; this.options = options; this.observed = new Set(); visibility.push(this); }
      observe(element) { this.observed.add(element); } unobserve(element) { this.observed.delete(element); } disconnect() { this.disconnected = true; }
    } : undefined,
    ResizeObserver: class {
      constructor(callback) { this.callback = callback; this.observed = new Set(); resizes.push(this); }
      observe(element) { this.observed.add(element); } unobserve(element) { this.observed.delete(element); } disconnect() { this.disconnected = true; }
    },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; mutations.push(this); } observe() {} disconnect() { this.disconnected = true; }
    },
  });
  const cleanup = compiled.exports.mountCardGlows(layer, 'test', anchors);
  const flush = () => { for (const [id, fn] of [...frames]) { frames.delete(id); fn(); } };
  const mutate = record => { mutations[0].callback([record]); flush(); };
  const attribute = target => mutate({ type: 'attributes', target, addedNodes: [], removedNodes: [] });
  const resize = target => resizes[0].callback([{ target, contentRect: { width: target.clientWidth } }]);
  return { root, content, report, card, layer, document, window, HTMLElement, SVGElement, cleanup, flush, mutate, attribute, resize, scans: () => scans, rectReads: element => reads.get(element) ?? 0, resizes, mutations, visibility };
}

test('chart SVG redraws and size-only updates reuse discovery while updating real halo geometry', () => {
  const f = fixture();
  assert.equal(f.scans(), 1);
  const frame = f.layer.children[0], svg = frame.children[0];
  assert.equal(svg.getAttribute('viewBox'), '0 0 300 200');
  const chart = new f.SVGElement('svg'), path = new f.SVGElement('path'); chart.append(path); f.card.append(chart);
  const originReads = f.rectReads(f.root);
  f.card.rect.left = 20; f.attribute(path);
  assert.ok(f.rectReads(f.root) > originReads, 'Fallback glows still measure their scroll-relative origin when content moves');
  assert.equal(frame.style.left, '20px');
  const nextPath = new f.SVGElement('path'); chart.append(nextPath);
  f.mutate({ type: 'childList', target: chart, addedNodes: [nextPath], removedNodes: [] });
  assert.equal(f.scans(), 1, 'SVG child/attribute changes cannot change HTML-card eligibility');
  f.card.rect = { left: 40, top: 90, width: 480, height: 260 };
  f.resize(f.card);
  assert.equal(f.scans(), 1, 'Height/width measurements of existing targets do not rediscover every card');
  assert.equal(svg.getAttribute('viewBox'), '0 0 480 260');
  assert.equal(frame.style.left, '40px'); assert.equal(frame.style.top, '90px');
  f.card.rect.height = 320; f.root.rect.height = 900; f.resize(f.root);
  assert.equal(f.scans(), 1, 'A root height change must not read eligibility again');
  assert.equal(svg.getAttribute('viewBox'), '0 0 480 320');
  f.cleanup();
});

test('card insertion and removal invalidate discovery and release removed geometry', () => {
  const f = fixture(), card = new f.HTMLElement(); card.className = 'card'; f.report.append(card);
  f.mutate({ type: 'childList', target: f.report, addedNodes: [card], removedNodes: [] });
  assert.equal(f.scans(), 2); assert.equal(f.layer.children.length, 2);
  assert.ok(f.resizes[0].observed.has(card));
  card.remove();
  f.mutate({ type: 'childList', target: f.report, addedNodes: [], removedNodes: [card] });
  assert.equal(f.scans(), 3); assert.equal(f.layer.children.length, 1);
  assert.equal(f.resizes[0].observed.has(card), false);
  f.cleanup();
});

test('removing a registered card class and changing ancestor eligibility both invalidate discovery', () => {
  const f = fixture();
  f.card.className = 'ordinary'; f.attribute(f.card);
  assert.equal(f.scans(), 2, 'Removing a card class must invalidate its previously registered target');
  assert.equal(f.layer.children.length, 0, 'No orphan halo remains for a former card');
  f.card.className = 'card'; f.attribute(f.card);
  assert.equal(f.layer.children.length, 1);
  f.report.setAttribute('aria-busy', 'true'); f.attribute(f.report);
  assert.equal(f.layer.children.length, 0, 'An excluded ancestor must hide all descendant card glows');
  f.report.attrs.delete('aria-busy'); f.attribute(f.report);
  assert.equal(f.layer.children.length, 1);
  f.cleanup();
});

test('width breakpoints and explicit viewport resize refresh local versus shared halos', () => {
  const f = fixture({ width: 900, localAtWide: true });
  assert.equal(f.layer.children.length, 1);
  f.root.clientWidth = 1200; f.resize(f.root);
  assert.equal(f.scans(), 2); assert.equal(f.layer.children.length, 0, 'Wide Reports uses its local halo');
  f.root.clientWidth = 900; f.resize(f.root);
  assert.equal(f.scans(), 3); assert.equal(f.layer.children.length, 1, 'Returning to narrow restores its shared halo');
  f.window.emit('resize'); f.flush();
  assert.equal(f.scans(), 4, 'Explicit resize can change container-dependent eligibility without a new root height');
  f.cleanup();
  assert.ok(f.resizes.every(observer => observer.disconnected));
  assert.ok(f.mutations.every(observer => observer.disconnected));
  assert.equal(f.window.listenerCount + f.document.listenerCount + f.root.listenerCount, 0);
});


test('native-anchor glows ignore internal SVG redraws without extra geometry reads', () => {
  const f = fixture({ anchors: true });
  const reads = f.rectReads(f.card);
  assert.equal(f.rectReads(f.root), 0, 'Native anchors never need a JavaScript scroll origin');
  const chart = new f.SVGElement('svg'), path = new f.SVGElement('path'); chart.append(path); f.card.append(chart);
  f.attribute(path);
  f.mutate({ type: 'childList', target: chart, addedNodes: [path], removedNodes: [] });
  assert.equal(f.scans(), 1);
  assert.equal(f.rectReads(f.card), reads, 'Internal chart redraws cannot change halo size or anchor position');
  f.card.rect.width = 420; f.resize(f.card);
  assert.equal(f.layer.children[0].children[0].getAttribute('viewBox'), '0 0 420 200', 'Real target resizes still update SVG geometry');
  assert.equal(f.rectReads(f.root), 0);
  f.cleanup();
});

test('an entirely local roster does not read geometry on root height or chart updates', () => {
  const f = fixture({ localAtWide: true });
  assert.equal(f.layer.children.length, 0);
  assert.equal(f.rectReads(f.root), 0);
  const chart = new f.SVGElement('svg'); f.card.append(chart);
  f.attribute(chart); f.root.rect.height = 1000; f.resize(f.root);
  assert.equal(f.rectReads(f.root), 0, 'No shared halo needs a root origin when the roster is empty');
  assert.equal(f.scans(), 1);
  f.cleanup();
});


test('offscreen glow filters stop measuring and catch up before cards enter the visible scroll area', () => {
  const f = fixture({ anchors: true, intersections: true });
  const observer = f.visibility[0], frame = f.layer.children[0], svg = frame.children[0];
  assert.equal(observer.options.root, f.root);
  assert.equal(observer.options.rootMargin, '88px', 'Prewarm the full halo beyond the viewport edge');
  assert(observer.observed.has(f.card));
  observer.callback([{ target: f.card, isIntersecting: false }]); f.flush();
  assert.equal(frame.style.display, 'none');
  assert(!f.resizes[0].observed.has(f.card));
  const reads = f.rectReads(f.card);
  f.card.rect.width = 550; f.resize(f.root);
  assert.equal(f.rectReads(f.card), reads, 'Hidden Gaussian geometry does not redraw during sidebar resizing');
  assert.equal(svg.getAttribute('viewBox'), '0 0 300 200');
  observer.callback([{ target: f.card, isIntersecting: true }]); f.flush();
  assert.equal(frame.style.display, '');
  assert.equal(svg.getAttribute('viewBox'), '0 0 550 200');
  assert(f.resizes[0].observed.has(f.card));
  f.cleanup();
  assert(observer.disconnected);
});


test('sidebar-only width changes switch Reports halo mode once per container boundary', () => {
  const f = fixture({ width: 1500, localAtWide: true, contentWidth: 900 });
  assert.equal(f.layer.children.length, 1);
  assert(f.resizes[0].observed.has(f.content));
  f.content.clientWidth = 1000; f.resize(f.content);
  assert.equal(f.scans(), 1, 'Intermediate sidebar frames do not rediscover the card roster');
  f.content.clientWidth = 1100; f.resize(f.content);
  assert.equal(f.scans(), 2); assert.equal(f.layer.children.length, 0, 'Use the native Reports halo without duplicating the shared glow');
  f.content.clientWidth = 1120; f.resize(f.content);
  assert.equal(f.scans(), 2);
  f.content.clientWidth = 900; f.resize(f.content);
  assert.equal(f.layer.children.length, 1, 'Restore shared glows when the main column narrows');
  assert.equal(f.root.clientWidth, 1500, 'The browser viewport never changed');
  f.cleanup();
});
