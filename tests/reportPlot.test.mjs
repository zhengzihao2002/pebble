import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import vm from 'node:vm';
const source = buildSync({ entryPoints: ['src/components/reports/reportPlot.ts'], bundle: true, write: false, platform: 'node', format: 'cjs' }).outputFiles[0].text;
const compiled = { exports: {} }; vm.runInNewContext(source, { module: compiled, exports: compiled.exports });
const { reportScale, reportNetPath } = compiled.exports;
for (const values of [[], [0], [120, 450, 300], [-400, -50], [-53000, 39000, -4400], [.01, .03]]) {
  test(`chart scale includes zero, all amounts, and evenly spaced ticks for ${values}`, () => {
    const { y, ticks } = reportScale(values);
    assert.ok(ticks.includes(0));
    assert.ok(ticks.length >= 2 && ticks.length <= 7);
    for (const v of values) assert.ok(y(v) >= -1e-8 && y(v) <= 100 + 1e-8);
    assert.equal(y(ticks[0]), 100); assert.equal(y(ticks.at(-1)), 0);
    const step = ticks[1] - ticks[0];
    for (let i = 1; i < ticks.length; i++) assert.ok(Math.abs((ticks[i] - ticks[i - 1]) - step) < 1e-8);
  });
}
test('Net path uses centered buckets and breaks at future/missing values', () => {
  const path = reportNetPath([10, null, -10, 0], value => 50 - value);
  assert.equal(path, 'M125,400  M625,600 L875,500');
  assert.equal(reportNetPath([], value => value), '');
});
