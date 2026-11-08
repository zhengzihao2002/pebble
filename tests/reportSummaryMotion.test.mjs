import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import vm from 'node:vm';

const source = buildSync({ entryPoints: ['src/components/reports/summaryLayoutMotion.ts'], bundle: true,
  write: false, platform: 'node', format: 'cjs' }).outputFiles[0].text;
const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
const mix = (a, b, p) => a + (b - a) * p;
const close = (a, b, label) => assert.ok(Math.abs(a - b) < 1e-7, `${label}: ${a} vs ${b}`);

function fixture() {
  class Element {
    constructor(cls, parent = null) {
      this.cls = cls; this.parentElement = parent; this.children = []; parent?.children.push(this);
      this.rect = rect(0, 0, 1, 1); this.opacity = 1; this.animations = [];
      this.classList = { contains: cls => this.cls === cls };
      this.style = {};
    }
    querySelectorAll(selector) {
      const classes = selector.split(',').map(s => s.trim().slice(1));
      return this.children.flatMap(child => [...(classes.includes(child.cls) ? [child] : []), ...child.querySelectorAll(selector)]);
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
    getBoundingClientRect() { return this.rect; }
    get offsetWidth() { return this.rect.width; }
    animate(frames, options) { const a = { frames, options }; this.animations.push(a); return a; }
  }
  const page = new Element('page'), hero = new Element('pb-rep-hero', page), main = new Element('pb-rep-hero-main', hero), side = new Element('pb-rep-hero-side', hero);
  const anchors = ['pb-rep-eyebrow', 'pb-rep-figure-label', 'pb-rep-figure'].map(cls => new Element(cls, main));
  const support = ['pb-rep-subline', 'pb-rep-flow', 'pb-rep-stats'].map(cls => new Element(cls, main)).concat(side);
  const root = new Element('html'), grid = new Element('grid'); grid.open = false; grid.classList.contains = cls => cls === 'has-inspector' && grid.open;
  root.font = 16;
  const style = element => ({ opacity: String(element.opacity), fontSize: `${root.font}px`, paddingLeft: '24px', paddingRight: '24px', borderLeftWidth: '1px', borderRightWidth: '1px', columnGap: '32px',
    getPropertyValue: property => ({ '--pb-rep-expanded-w': '20.5rem', '--pb-rep-collapsed-w': '2.75rem', '--pb-rep-hero-column-min': '26rem' })[property] ?? '' });
  const compiled = { exports: {} };
  vm.runInNewContext(source, { module: compiled, exports: compiled.exports, document: { documentElement: root }, getComputedStyle: style });
  const layout = (columns, box = rect(40, 198, columns ? 1116 : 832, columns ? 371 : 686)) => {
    hero.rect = box; main.rect = rect(box.left + 25, box.top + 23, columns ? 517 : box.width - 50, 300);
    side.rect = rect(columns ? box.left + 607 : box.left + 25, columns ? main.rect.top : box.top + 360, columns ? 484 : box.width - 50, 300);
    anchors.forEach((element, i) => { element.rect = rect(main.rect.left, main.rect.top + i * 35, i === 2 ? 350 : 240, i === 2 ? 78 : 18); });
  };
  layout(true);
  return { ...compiled.exports, page, hero, main, side, anchors, support, grid, root, layout };
}

for (const opening of [true, false]) test(`headline world-space geometry stays continuous through all 33 frames (${opening ? 'opening' : 'closing'})`, () => {
  const f = fixture(); f.layout(opening);
  const capture = f.captureSummary(f.page), before = { ...f.hero.rect };
  const oldAnchors = f.anchors.map(e => ({ ...e.rect }));
  // Include translation as well as asymmetric scaling, so the assertion
  // detects incorrect coordinate space or transform order.
  f.layout(opening ? false : true, rect(55, 211, opening ? 832 : 1116, opening ? 686 : 371));
  const after = { ...f.hero.rect }, newAnchors = f.anchors.map(e => ({ ...e.rect }));
  f.animateSummary(capture, before, after, 360, 60, 'ease-in-out');
  f.anchors.forEach((element, index) => {
    const animation = element.animations.at(-1);
    assert.equal(animation.frames.length, 33);
    assert.equal(animation.options.delay, 60);
    for (const frame of animation.frames) {
      const p = frame.offset;
      const parts = frame.transform.match(/translate\(([^p]+)px, ([^p]+)px\) scale\(([^,]+), ([^)]+)\)/);
      assert.ok(parts, 'Every frame has an explicit translation and scale');
      const [tx, ty, sx, sy] = parts.slice(1).map(Number);
      const parentX = mix(before.left, after.left, p), parentY = mix(before.top, after.top, p);
      const parentSx = mix(before.width, after.width, p) / after.width;
      const parentSy = mix(before.height, after.height, p) / after.height;
      const end = newAnchors[index], start = oldAnchors[index];
      close(parentX + parentSx * (end.left - after.left + tx), mix(start.left, end.left, p), 'world left');
      close(parentY + parentSy * (end.top - after.top + ty), mix(start.top, end.top, p), 'world top');
      close(parentSx * end.width * sx, mix(start.width, end.width, p), 'world width');
      close(parentSy * end.height * sy, mix(start.height, end.height, p), 'world height');
    }
  });
});

test('same-layout resizing protects text from parent scaling', () => {
  const f = fixture(), capture = f.captureSummary(f.page), before = { ...f.hero.rect };
  f.layout(true, rect(40, 198, 1300, 371));
  const motions = f.animateSummary(capture, before, f.hero.rect, 360, 0, 'ease');
  assert.ok(motions.length > 0);
  assert.ok(f.anchors.every(e => e.animations.length === 1));
  assert.ok(f.support.every(e => e.animations.at(-1).frames.at(-1).opacity === 0));
});

test('all supporting regions stay masked until the shared geometry completes', () => {
  const f = fixture(), capture = f.captureSummary(f.page), before = { ...f.hero.rect };
  f.layout(false);
  f.animateSummary(capture, before, f.hero.rect, 360, 60, 'ease');
  for (const element of f.support) {
    const a = element.animations.at(-1);
    assert.equal(a.frames[0].opacity, 0, 'Destination layout must not flash on the first frame');
    assert.equal(a.frames.at(-1).opacity, 0);
    assert.equal(a.options.fill, 'both', 'Hold zero opacity before reveal begins');
    assert.equal(a.options.delay, 60, 'The same mask clock covers all supporting content');
    assert.ok(a.options.delay + a.options.duration <= 60 + 360, 'Finish before the shared layout settles');
  }
  assert.equal(f.side.animations.at(-1).options.delay, f.support[0].animations.at(-1).options.delay, 'The chart and supporting numbers share a clock');
});

test('a partially hidden interrupted summary restores even when layout columns no longer change', () => {
  const f = fixture(); f.support.forEach(e => { e.opacity = .4; });
  const capture = f.captureSummary(f.page), box = { ...f.hero.rect };
  const out = f.fadeSummaryOut(capture);
  assert.ok(out.every(a => a.frames[0].opacity === .4 && a.frames.at(-1).opacity === 0));
  assert.ok(f.animateSummary(capture, box, box, 360, 0, 'ease').length > 0, 'Do not strand partially hidden regions after interruption');
});

test('column-change prediction respects the real card padding, borders, gap and font scale', () => {
  const f = fixture();
  assert.equal(f.summaryWillReflow(f.captureSummary(f.page), f.grid), true, '1116 to832 crosses the 2-column boundary');
  f.layout(true, rect(40, 198, 1500, 371));
  assert.equal(f.summaryWillReflow(f.captureSummary(f.page), f.grid), false, 'Both wide layouts stay side by side');
  for (const rem of [16, 24]) {
    f.root.font = rem;
    const boundary = 2 * 26 * rem + 32 + 50;
    const track = (20.5 - 2.75) * rem;
    f.layout(true, rect(40, 198, boundary + track + 1, 371));
    assert.equal(f.summaryWillReflow(f.captureSummary(f.page), f.grid), false, 'Target remains just above boundary');
    f.layout(true, rect(40, 198, boundary + track - 1, 371));
    assert.equal(f.summaryWillReflow(f.captureSummary(f.page), f.grid), true, 'Target falls just below boundary');
    f.grid.open = true; f.layout(false, rect(40, 198, boundary - track + 1, 686));
    assert.equal(f.summaryWillReflow(f.captureSummary(f.page), f.grid), true, 'Expanding available report width crosses back to columns');
    f.grid.open = false;
  }
});
