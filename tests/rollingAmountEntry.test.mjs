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
  const html = renderToStaticMarkup(createElement(RollingAmount, { value: '−$1,234.56', fractionClassName: 'cents' }));
  assert.match(html, /data-pb-roll-entry=""/);
  assert.match(html, /class="pb-rolling-accessible">−\$1,234\.56</);
  assert.match(html, /class="pb-rolling-visual" aria-hidden="true"/);
  assert.match(html, /class="cents"/);
  assert.equal((html.match(/class="pb-rolling-cell/g) ?? []).length, 6);
  assert.equal([...html.matchAll(/class="pb-rolling-old"[^>]*>(\d)</g)].map(match => match[1]).join(''), '123456', 'The paused old slots show the final value, never an incorrect zero balance');
});

test('zero balances, percentages and counts all get entry digits; placeholders remain plain', () => {
  for (const [value, digits] of [['$0.00', 3], ['58.62%', 4], ['12', 2], ['—', 0]]) {
    const html = renderToStaticMarkup(createElement(RollingAmount, { value }));
    assert.equal((html.match(/class="pb-rolling-cell/g) ?? []).length, digits);
  }
});
