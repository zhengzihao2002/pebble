/** Pure synthetic tests: never import a DB client or contact Neon. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildSync } = require('esbuild');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pebble-scheduled-text-'));
const out = path.join(dir, 'text.cjs');
buildSync({ stdin: { contents: "export * from './src/lib/recurring/textShortcuts'; export * from './src/lib/recurring/chargeNext'; export * from './src/lib/transactionDescription';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', outfile: out });
const { expandScheduledText: expand, scheduledTextValues, planChargeNext, composeDescription, parseDescription } = require(out);
process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }));

test('title and multiline description resolve while the original schedule stays a template', () => {
  const template = composeDescription('Rent {MONTH} {YEAR}', 'Period {YYYY}-{MM}\nProcessed {DATE}; day {DD}');
  const actual = parseDescription(expand(template, '2026-11-06'));
  assert.deepEqual(actual, { title: 'Rent November 2026', description: 'Period 2026-11\nProcessed 2026-11-06; day 06' });
  assert.match(template, /\{MONTH\}/);
  assert.equal(expand(template, '2027-01-01').split('\n')[0], 'Rent January 2027');
});
test('aliases, case, single/double braces, unknown text, repeated tokens and Chinese composition', () => {
  assert.equal(expand('{month} {{ MONTH }} {MMM} {MMMM} {MONTH_SHORT} {MM} {MONTH_NUMBER} {YEAR} {YYYY} {YY} {DAY} {DD} {DATE}', '2028-02-29'), 'February February Feb February Feb 02 02 2028 2028 28 29 29 2028-02-29');
  assert.equal(expand('{YEAR}年{MM}月工资\n{UNKNOWN} {MONTHLY} $1 \\ keep', '2026-11-06'), '2026年11月工资\n{UNKNOWN} {MONTHLY} $1 \\ keep');
  assert.equal(expand('Unchanged text', '2026-11-06'), 'Unchanged text');
  for (const date of ['2026-02-29', '2026-13-01', '2026-00-01', '2026-04-31', 'not a date']) assert.throws(() => expand('{MONTH}', date));
});
test('catch-up dates resolve independently, and an early payment uses transaction date rather than future occurrence', () => {
  for (const date of ['2025-12-31', '2026-01-31', '2026-02-28']) assert.equal(expand('{DATE}', date), date);
  const plan = planChargeNext({ status: 'active', frequency: 'monthly', startDate: '2026-12-01', endMode: 'never', endCount: null, endDate: null, materializedThrough: null }, '2026-11-06');
  assert.equal(plan.occurrenceDate, '2026-12-01');
  assert.equal(expand('{MONTH}', plan.transactionDate), 'November');
  assert.equal(Object.keys(scheduledTextValues('2026-11-06')).length, 12);
});
