import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import vm from 'node:vm';

const source = buildSync({
  entryPoints: ['src/lib/ambientMotion.ts'], bundle: true, write: false,
  platform: 'node', format: 'cjs',
}).outputFiles[0].text;
const compiled = { exports: {} };
vm.runInNewContext(source, { module: compiled, exports: compiled.exports });
const { AMBIENT_MOTION, sampleAmbientMotion } = compiled.exports;

test('each route reaches both edges of each independent axis smoothly', () => {
  for (const orb of AMBIENT_MOTION) {
    for (const axis of ['x', 'y']) {
      const period = orb[`${axis}Period`], delay = orb[`${axis}Delay`];
      assert.ok(sampleAmbientMotion(orb, delay)[axis] < .00001);
      assert.ok(sampleAmbientMotion(orb, delay + period / 4)[axis] > .49999);
      assert.ok(sampleAmbientMotion(orb, delay + period / 4)[axis] < .50001);
      assert.ok(sampleAmbientMotion(orb, delay + period / 2)[axis] > .99999);
      assert.ok(sampleAmbientMotion(orb, delay + period)[axis] < .00001);
      const before = sampleAmbientMotion(orb, delay + period / 2 - .001)[axis];
      const after = sampleAmbientMotion(orb, delay + period / 2 + .001)[axis];
      assert.ok(Math.abs(before - after) < .00001, 'turnaround must be continuous');
    }
  }
});

test('the scene retains its staggered starting composition', () => {
  const starts = [[.09, .66], [.88, .13], [.42, .74]];
  AMBIENT_MOTION.slice(0, 3).forEach((orb, index) => {
    const p = sampleAmbientMotion(orb, 0);
    assert.ok(Math.abs(p.x - starts[index][0]) < .0001);
    assert.ok(Math.abs(p.y - starts[index][1]) < .0001);
    assert.notEqual(orb.xPeriod, orb.yPeriod);
  });
});

test('route choices have distinct paths and stay continuous within the screen', () => {
  const routes = ['default', 'orbit', 'weave', 'sweep'];
  const signatures = routes.map(route => Array.from({ length: 12 }, (_, i) => {
    const p = sampleAmbientMotion(AMBIENT_MOTION[0], i * 5, route);
    return `${p.x.toFixed(3)},${p.y.toFixed(3)}`;
  }).join('|'));
  assert.equal(new Set(signatures).size, routes.length, 'Every route must look different');
  for (const route of routes) for (const orb of AMBIENT_MOTION) {
    for (let time = 0; time < 200; time += .5) {
      const p = sampleAmbientMotion(orb, time, route);
      const next = sampleAmbientMotion(orb, time + .001, route);
      assert.ok(p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1);
      assert.ok(Math.hypot(p.x - next.x, p.y - next.y) < .002, `${route} must not jump`);
    }
  }
});

test('all time samples stay inside the viewport and retain bounded colour shifts', () => {
  for (const orb of AMBIENT_MOTION) {
    for (let seconds = -120; seconds <= 240; seconds += .5) {
      const p = sampleAmbientMotion(orb, seconds);
      assert.ok(p.x >= 0 && p.x <= 1);
      assert.ok(p.y >= 0 && p.y <= 1);
      assert.ok(p.hue >= -42 && p.hue <= 42);
    }
    const start = sampleAmbientMotion(orb, orb.colourDelay).hue;
    const midpoint = sampleAmbientMotion(orb, orb.colourDelay + orb.colourPeriod / 2).hue;
    assert.ok(start < -41.999);
    assert.ok(midpoint > 41.999);
  }
});
