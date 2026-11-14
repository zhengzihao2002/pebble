import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import vm from 'node:vm';

const source = buildSync({ entryPoints: ['src/lib/format.ts'], bundle: true, write: false,
  platform: 'node', format: 'cjs' }).outputFiles[0].text;

test('compact dates reuse Intl formatters and still follow locale and the current year', () => {
  let year = 2026, constructions = 0;
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [year, 6, 15])); }
  }
  const compiled = { exports: {} };
  vm.runInNewContext(source, { module: compiled, exports: compiled.exports, Date: Clock,
    Intl: { ...Intl, DateTimeFormat: function (...args) { constructions++; return new Intl.DateTimeFormat(...args); } } });
  const { formatDate } = compiled.exports;
  const expected = (tag, withYear) => new Intl.DateTimeFormat(tag, {
    month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}),
  }).format(new Date(2026, 10, 14));
  for (let i = 0; i < 100; i++) {
    assert.equal(formatDate('2026-11-14', 'en'), expected('en-US', false));
    assert.equal(formatDate('2026-11-14', 'zh'), expected('zh-CN', false));
  }
  assert.equal(constructions, 2, 'Axis resize must not construct formatters for every tick');
  year = 2027;
  assert.equal(formatDate('2026-11-14', 'en'), expected('en-US', true));
  assert.equal(formatDate('2026-11-14', 'zh'), expected('zh-CN', true));
  assert.equal(constructions, 4, 'Year rollover switches variants without a stale captured current year');
  year = 2026;
  assert.equal(formatDate('2026-11-14'), expected('en-US', false));
  assert.equal(constructions, 4);
  assert.equal(formatDate('invalid', 'en'), 'Invalid Date');
  assert.equal(formatDate('invalid', 'zh'), 'Invalid Date');
});
