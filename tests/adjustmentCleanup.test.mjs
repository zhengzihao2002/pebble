import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';

const code = buildSync({
  entryPoints: ['src/lib/adjustmentCleanup.ts'], bundle: true, platform: 'node', format: 'cjs', write: false,
}).outputFiles[0].text;
const loaded = { exports: {} };
new Function('module', 'exports', code)(loaded, loaded.exports);
const { cleanupCutoff, adjustmentCleanupGroup, findAdjustmentCleanupGroups } = loaded.exports;

const row = (id, date, amount, accountId = 'checking', transferGroupId = null) =>
  ({ id, date, amount, accountId, description: id, transferGroupId });
const today = '2026-11-17';
const cutoff = cleanupCutoff(today);

test('suggestions use older standalone adjustments and preserve each account net in cents', () => {
  const source = [
    row('old', '2026-02-01', 500.01),
    row('old2', '2026-07-01', -100.02),
    row('cutoff', cutoff, 40),
    row('recent', today, 100),
    row('transfer', '2026-06-01', -40, 'checking', 'pair'),
    row('cash1', '2026-02-01', 38.63, 'cash'),
    row('cash2', '2026-07-01', -38.63, 'cash'),
    row('unknown', '2026-01-01', 42, 'deleted'),
  ];
  const groups = findAdjustmentCleanupGroups(source, cutoff, new Set(['checking', 'cash']));
  assert.equal(cutoff, '2026-08-17');
  assert.equal(cleanupCutoff('2026-05-31'), '2026-02-28');
  const checking = groups.find(group => group.accountId === 'checking');
  const cash = groups.find(group => group.accountId === 'cash');
  assert.deepEqual(checking.rows.map(item => item.id), ['old', 'old2']);
  assert.equal(checking.total, 399.99);
  assert.equal(checking.date, '2026-07-01');
  assert.equal(cash.total, 0);
  assert.deepEqual(cash.rows.map(item => item.id), ['cash1', 'cash2']);
});

test('manual selection can include today and keeps the latest selected date', () => {
  const group = adjustmentCleanupGroup('checking', [row('recent', today, 100), row('old', '2026-01-01', 500)]);
  assert.equal(group.total, 600);
  assert.equal(group.id, 'recent');
  assert.equal(group.date, today);
  assert.equal(adjustmentCleanupGroup('checking', [row('one', today, 100)]), undefined);
});
