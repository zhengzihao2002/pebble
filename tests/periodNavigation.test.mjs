import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import vm from 'node:vm';

const source = buildSync({ entryPoints: ['src/lib/periodNavigation.ts'], bundle: true, write: false, platform: 'node', format: 'cjs' }).outputFiles[0].text;
const compiled = { exports: {} };
vm.runInNewContext(source, { module: compiled, exports: compiled.exports });
const { stepPeriodKey } = compiled.exports;

test('queued arrow presses advance from the latest period and clamp at both ends', () => {
  for (const keys of [['2026-10', '2026-9', '2026-8', '2026-7'], ['2027-Q4', '2027-Q3', '2027-Q2', '2027-Q1'], ['2029', '2028', '2027', '2026']]) {
    const periods = keys.map(key => ({ key }));
    let selected = keys[0];
    for (let index = 0; index < 8; index++) selected = stepPeriodKey(periods, selected, 1);
    assert.equal(selected, keys.at(-1));
    for (let index = 0; index < 8; index++) selected = stepPeriodKey(periods, selected, -1);
    assert.equal(selected, keys[0]);
    assert.equal(stepPeriodKey(periods, null, 1), keys[1]);
    assert.equal(stepPeriodKey(periods, 'stale-preference', -1), keys[0]);
  }
  assert.equal(stepPeriodKey([], null, 1), null);
});
