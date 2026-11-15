import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { buildSync } from 'esbuild';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const { renderToStaticMarkup } = require('react-dom/server');
const { createElement } = require('react');
const source = buildSync({ entryPoints: ['src/components/shared/RollingAmount.tsx'], bundle: true, write: false,
  platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic' }).outputFiles[0].text;
const compiled = { exports: {} }; vm.runInNewContext(source, { module: compiled, exports: compiled.exports, require });
const { RollingAmount } = compiled.exports;

test('server HTML retains the exact current amount and readable final glyphs before JavaScript entry', () => {
  const html = renderToStaticMarkup(createElement(RollingAmount, { headline: true, value: '−$1,234.56', fractionClassName: 'cents' }));
  assert.match(html, /data-pb-roll-entry=""/);
  assert.match(html, /class="pb-rolling-accessible">−\$1,234\.56</);
  assert.match(html, /class="pb-rolling-visual" aria-hidden="true"/);
  assert.match(html, /class="cents"/);
  assert.equal((html.match(/class="pb-rolling-cell/g) ?? []).length, 6);
  assert.equal([...html.matchAll(/class="pb-rolling-entry-base"[^>]*>(\d)</g)].map(match => match[1]).join(''), '123456');
  for (const match of html.matchAll(/class="pb-rolling-track"[^>]*>([\s\S]*?)<\/span>/g)) {
    const digits = match[1].split('\n');
    assert.equal(digits.length, 11, 'Entry makes a full digit cycle instead of a one-step wiggle');
    assert.equal(digits[0], digits.at(-1), 'The paused strip and settled strip both show the real digit');
    assert.equal(new Set(digits).size, 10);
  }
});

test('explicit headline amounts animate, while supporting figures are static by default', () => {
  for (const [value, digits] of [['$0.00', 3], ['—', 0]]) {
    const html = renderToStaticMarkup(createElement(RollingAmount, { value, headline: true }));
    assert.equal((html.match(/class="pb-rolling-cell/g) ?? []).length, digits);
  }
});

test('supporting amounts, percentages, counts and dates have no rolling markup', () => {
  for (const value of ['$1,234.56', '58.62%', '12', '2026-11-14']) {
    const html = renderToStaticMarkup(createElement(RollingAmount, { value }));
    assert(!html.includes('pb-rolling'), 'Static figures must not mount digit tracks or observers');
    assert(html.includes(value));
  }
  const percent = renderToStaticMarkup(createElement(RollingAmount, { value: '58.62%', headline: true }));
  assert(!percent.includes('pb-rolling'), 'Percentages remain static even in a headline');
  const cents = renderToStaticMarkup(createElement(RollingAmount, { value: '$1,234.56', fractionClassName: 'cents' }));
  assert.match(cents, /class="cents">.56/);
});
