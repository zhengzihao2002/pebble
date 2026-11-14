import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import vm from 'node:vm';
const source = buildSync({ entryPoints: ['src/lib/sidebarMotion.ts'], bundle: true, write: false, platform: 'node', format: 'cjs' }).outputFiles[0].text;
const microtasks = () => new Promise(resolve => setImmediate(resolve));
function fixture({ reduced = false, inert = false, retained = null } = {}) {
  let time = 0, sequence = 0, collapsed = false;
  const frames = new Map(), writes = [], listeners = new Map();
  const events = name => ({ addEventListener: (type, fn) => listeners.set(`${name}:${type}`, fn), removeEventListener: type => listeners.delete(`${name}:${type}`) });
  class Element {
    constructor(width = 800) {
      this.rect = { width, height: 200 }; this.dataset = {}; this.attributes = new Set(); this.children = []; this.animations = [];
      this.parentElement = { closest: () => null };
      const values = new Map();
      this.style = { getPropertyValue: key => values.get(key) ?? '', getPropertyPriority: () => '',
        setProperty: (key, value) => values.set(key, value), removeProperty: key => values.delete(key) };
    }
    getBoundingClientRect() { return { width: parseFloat(this.style.getPropertyValue('width')) || this.rect.width, height: 200 }; }
    getAnimations() { return this.animations; }
    closest() { return null; }
    hasAttribute(key) { return this.attributes.has(key); }
    setAttribute(key) { this.attributes.add(key); }
    removeAttribute(key) { this.attributes.delete(key); }
    animate(keyframes, options) {
      let resolve, reject;
      const element = this;
      const animation = { playState: 'running', id: '', keyframes, options, effect: { getKeyframes: () => keyframes },
        finished: new Promise((yes, no) => { resolve = yes; reject = no; }),
        finish() { animation.playState = 'finished'; resolve(); },
        cancel() { element.animations = element.animations.filter(item => item !== animation); reject(new Error('Cancelled')); } };
      this.animations.push(animation); return animation;
    }
  }
  const main = new Element(), card = new Element(), body = new Element(), plot = new Element(), sidebar = new Element(256);
  const shell = { querySelector: () => main }; sidebar.closest = () => shell; card.children = [body];
  const plots = [plot];
  if (retained) {
    const hiddenPlot = new Element(300);
    hiddenPlot.getBoundingClientRect = () => ({ width: retained === 'zero' ? 0 : 300, height: retained === 'zero' ? 0 : 200 });
    hiddenPlot.closest = selector => retained === 'hidden' && selector === '[hidden]' ? {} : null;
    hiddenPlot.querySelector = () => ({ getAttribute: () => '300' });
    plots.push(hiddenPlot);
  }
  main.querySelectorAll = selector => selector.includes('.card,') ? [card] : plots;
  let svgWidth = 800; plot.style.setProperty('width', '100%');
  plot.getBoundingClientRect = () => ({ width: plot.style.getPropertyValue('width').endsWith('px') ? parseFloat(plot.style.getPropertyValue('width')) : main.rect.width, height: 200 });
  plot.querySelector = () => ({ getAttribute: () => String(svgWidth) });
  const media = { matches: reduced, ...events('motion') };
  const document = { hidden: false, ...events('document') };
  const window = { ...events('window'), matchMedia: query => query.includes('reduced-motion') ? media : { matches: true } };
  if (inert) main.setAttribute('inert');
  const compiled = { exports: {} };
  vm.runInNewContext(source, { module: compiled, exports: compiled.exports, window, document,
    performance: { now: () => time }, getComputedStyle: element => ({ opacity: String(element.animations.at(-1)?.keyframes.at(-1).opacity ?? 1) }),
    requestAnimationFrame: fn => { frames.set(++sequence, fn); return sequence; }, cancelAnimationFrame: id => frames.delete(id) });
  const native = () => { sidebar.animations = [{ playState: 'running', effect: { getKeyframes: () => [{ width: '256px' }] }, finish() { sidebar.animations = []; } }]; };
  const motion = compiled.exports.createSidebarMotion(sidebar, () => collapsed, value => {
    writes.push(value); collapsed = value; sidebar.rect.width = value ? 76 : 256; main.rect.width = card.rect.width = value ? 980 : 800; native();
  });
  const step = (count = 1) => { for (let i = 0; i < count; i++) { time += 16; for (const [id, fn] of [...frames]) { frames.delete(id); fn(time); } } };
  const fade = async () => { for (const animation of [...body.animations]) animation.finish(); await microtasks(); };
  return { motion, main, body, plot, sidebar, media, document, listeners, writes, frames, step, fade,
    phase: () => main.dataset.pbSidebarPhase, collapsed: () => collapsed,
    settleShell: () => { sidebar.animations = []; }, settleChart: () => { svgWidth = main.rect.width; } };
}

test('data exits before width changes, cards resize, plots catch up while hidden, then data returns', async () => {
  const f = fixture();
  f.motion.toggle(); assert.equal(f.phase(), 'exit'); assert.deepEqual(f.writes, []);
  await f.fade(); assert.deepEqual(f.writes, [true]); assert.equal(f.phase(), 'resize');
  assert.equal(f.main.rect.width, 980, 'The real card layout grows');
  assert.equal(f.plot.style.getPropertyValue('width'), '800px', 'Only hidden chart internals stay fixed');
  f.step(10); assert.equal(f.phase(), 'resize', 'Never reveal while the sidebar still moves');
  f.settleShell(); f.step(4);
  assert.equal(f.plot.style.getPropertyValue('width'), '100%');
  assert.equal(f.phase(), 'resize', 'Wait for chart observers after releasing their final width');
  f.settleChart(); f.step(3); assert.equal(f.phase(), 'reveal');
  await f.fade(); assert.equal(f.phase(), undefined); assert(!f.main.hasAttribute('inert')); assert.equal(f.frames.size, 0);
  f.motion.dispose(); assert.equal(f.listeners.size, 0);
});

test('a second click during exit reverses the fade without collapsing or applying a stale callback', async () => {
  const f = fixture(); f.motion.toggle(); f.motion.toggle();
  assert.equal(f.phase(), 'reveal'); await f.fade();
  assert.deepEqual(f.writes, []); assert.equal(f.collapsed(), false); assert.equal(f.phase(), undefined);
  f.motion.dispose();
});

test('rapid width reversal keeps contents hidden and only reveals the latest destination', async () => {
  const f = fixture(); f.motion.toggle(); await f.fade(); f.step();
  const stale = [...f.frames.values()][0];
  f.motion.toggle(); assert.deepEqual(f.writes, [true, false]); stale();
  assert.equal(f.phase(), 'resize'); f.step(4); assert.equal(f.phase(), 'resize');
  f.settleShell(); f.settleChart(); f.step(8); assert.equal(f.phase(), 'reveal');
  await f.fade(); assert.equal(f.collapsed(), false); assert.equal(f.phase(), undefined);
  assert.equal(f.plot.style.getPropertyValue('width'), '100%'); f.motion.dispose();
});

test('reduced motion skips masking, and hiding the page finishes and saves pending intent', async () => {
  const reduced = fixture({ reduced: true }); reduced.motion.toggle();
  assert.deepEqual(reduced.writes, [true]); assert.equal(reduced.phase(), undefined); reduced.motion.dispose();
  const f = fixture(); f.motion.toggle(); f.document.hidden = true;
  f.listeners.get('document:visibilitychange')(); await microtasks();
  assert.deepEqual(f.writes, [true]); assert.equal(f.phase(), undefined); assert(!f.main.hasAttribute('inert')); f.motion.dispose();
});

test('cleanup restores plots and visibility without removing a preexisting inert state', async () => {
  const f = fixture({ inert: true }); f.motion.toggle(); await f.fade(); f.motion.dispose();
  assert.equal(f.phase(), undefined); assert.equal(f.plot.style.getPropertyValue('width'), '100%');
  assert(f.main.hasAttribute('inert')); assert.equal(f.frames.size, 0); assert.equal(f.listeners.size, 0);
  const idle = fixture({ inert: true }); idle.motion.dispose(); assert(idle.main.hasAttribute('inert'));
});


test('retained hidden or zero-size chart panels do not delay the visible page reveal', async () => {
  for (const retained of ['zero', 'hidden']) {
    const f = fixture({ retained });
    f.motion.toggle(); await f.fade(); f.settleShell();
    f.step(4); f.settleChart(); f.step(4);
    assert.equal(f.phase(), 'reveal', `${retained} retained plot must not hold the page until timeout`);
    await f.fade(); assert.equal(f.phase(), undefined);
    f.motion.dispose();
  }
});

test('timeout finishes the shell and still fades data back instead of abruptly exposing it', async () => {
  const f = fixture();
  f.motion.toggle(); await f.fade();
  // Keep a width animation running past the safety deadline.
  f.step(114);
  assert.equal(f.phase(), 'resize', 'Timeout recovery must not clear the hidden state in one frame');
  assert.equal(f.sidebar.animations.length, 0, 'The remaining shell animation finishes before reveal');
  assert.equal(f.plot.style.getPropertyValue('width'), '100%', 'Final chart measurements are released while hidden');
  f.settleChart(); f.step(3);
  assert.equal(f.phase(), 'reveal');
  assert(f.body.animations.some(animation => animation.id === 'pb-sidebar-content-reveal'));
  assert(f.main.hasAttribute('inert'), 'Interaction resumes only after the reveal fade finishes');
  await f.fade(); assert.equal(f.phase(), undefined); assert(!f.main.hasAttribute('inert'));
  f.motion.dispose();
});
