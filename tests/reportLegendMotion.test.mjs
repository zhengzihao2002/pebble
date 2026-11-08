import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import vm from 'node:vm';
const source = buildSync({ entryPoints: ['src/components/reports/legendMotion.ts'], bundle: true, write: false, platform: 'node', format: 'cjs' }).outputFiles[0].text;
function fixture() {
  const listeners = new Map();
  const events = { addEventListener: (n, f) => listeners.set(n, f), removeEventListener: n => listeners.delete(n) };
  const media = { ...events, matches: false }, document = { ...events, hidden: false };
  const animations = [];
  const item = { offsetLeft: 200, offsetTop: 0, translate: [0, 0], animate(frames) {
    const animation = { frames, cancel() { this.cancelled = true; }, finished: new Promise(() => {}) };
    animations.push(animation); return animation;
  } };
  const side = { opacity: 1, children: [] };
  const legend = { children: [item], closest: () => side };
  let resize, disconnected = 0;
  const compiled = { exports: {} };
  vm.runInNewContext(source, { module: compiled, exports: compiled.exports, document,
    window: { matchMedia: () => media }, cancelAnimationFrame() {}, requestAnimationFrame: f => { f(); return 1; },
    ResizeObserver: class { constructor(f) { resize = f; } observe() {} disconnect() { disconnected++; } },
    MutationObserver: class { observe() {} disconnect() { disconnected++; } },
    getComputedStyle: e => ({ opacity: e.opacity, transform: `matrix(1,0,0,1,${item.translate.join(',')})` }),
    DOMMatrixReadOnly: class { constructor() { [this.m41, this.m42] = item.translate; } },
  });
  const cleanup = compiled.exports.observeLegendMotion(legend);
  return { side, item, legend, animations, resize: () => resize(), cleanup, media, document, disconnected: () => disconnected };
}
test('legend row wraps translate from the previous position without fading or scaling', () => {
  const f = fixture();
  assert.equal(f.animations.length, 0);
  f.item.offsetLeft = 0; f.item.offsetTop = 28; f.resize();
  assert.equal(f.animations[0].frames[0].transform, 'translate(200px, -28px)');
  assert.equal(f.animations[0].frames[1].transform, 'translate(0px, 0px)');
  f.resize(); assert.equal(f.animations.length, 1, 'Unchanged layout never starts another animation');
  f.cleanup(); assert.ok(f.animations[0].cancelled); assert.equal(f.disconnected(), 2);
});
test('a reversal continues from the visible in-flight translation', () => {
  const f = fixture();
  f.item.offsetLeft = 0; f.item.offsetTop = 28; f.resize();
  f.item.translate = [80, -12]; f.item.offsetLeft = 200; f.item.offsetTop = 0; f.resize();
  assert.ok(f.animations[0].cancelled);
  assert.equal(f.animations[1].frames[0].transform, 'translate(-120px, 16px)');
  f.cleanup();
});
for (const reason of ['reduced', 'hidden']) test(`${reason} cancels movement and updates layout without animating`, () => {
  const f = fixture();
  f.item.offsetTop = 28; f.resize();
  if (reason === 'reduced') f.media.matches = true; else f.document.hidden = true;
  f.item.offsetTop = 0; f.resize();
  assert.equal(f.animations.length, 1); assert.ok(f.animations[0].cancelled);
  f.cleanup();
});

test('the timeline below a wrapping legend also translates instead of jumping', () => {
  const f = fixture();
  const chart = { ...f.item, offsetLeft: 0, offsetTop: 50 };
  f.side.children.push(chart); f.resize();
  f.item.offsetLeft = 0; f.item.offsetTop = 28; chart.offsetTop = 78; f.resize();
  assert.equal(f.animations[1].frames[0].transform, 'translate(0px, -28px)');
  f.cleanup();
});
