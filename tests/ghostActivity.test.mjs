import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import vm from 'node:vm';
const source = buildSync({ entryPoints: ['src/components/transactions/ghostActivity.ts'], bundle: true, write: false, platform: 'node', format: 'cjs' }).outputFiles[0].text;
const compiled = { exports: {} };
vm.runInNewContext(source, { module: compiled, exports: compiled.exports });
const { filterGhostActivity } = compiled.exports;
const expense = { id: 'expense', type: 'expense', date: '2026-11-17', accountId: 'ghost-bank', amount: -1250.25, category: 'Travel', description: 'Quiet trip', paymentMethod: 'Side account', tag: 'Holiday' };
const income = { id: 'income', type: 'income', date: '2026-11-12', accountId: 'ghost-cash', amount: 80, grossAmount: 80, netAmount: 80, category: 'Side Cash', description: 'Cash received', paymentMethod: 'Hidden cash' };
const adjustment = { id: 'adjustment', type: 'adjustment', date: '2026-11-10', accountId: 'ghost-bank', amount: 100, description: 'Correction', paymentMethod: 'Side account', transferGroupId: null };
const older = { ...expense, id: 'old', date: '2026-10-17' };
const entries = [expense, income, adjustment, older].map(record => ({ record }));
const options = { monthPrefix: '2026-11-', accountId: null, query: '', type: 'all', accountNames: new Map([['ghost-bank', 'Side account'], ['ghost-cash', 'Hidden cash']]), categoryName: category => category === 'Travel' ? '旅行' : category };
const ids = rows => Array.from(rows, row => row.record.id);

test('ghost history scopes month, account and kind without mutating source records', () => {
  assert.deepEqual(ids(filterGhostActivity(entries, options)), ['expense', 'income', 'adjustment']);
  assert.deepEqual(ids(filterGhostActivity(entries, { ...options, accountId: 'ghost-cash' })), ['income']);
  assert.deepEqual(ids(filterGhostActivity(entries, { ...options, type: 'expense' })), ['expense']);
  assert.deepEqual(ids(filterGhostActivity(entries, { ...options, type: 'income' })), ['income']);
  assert.equal(entries.length, 4);
  assert.equal(entries[0].record.amount, -1250.25);
});

test('ghost history searches account names, localized categories, tags and formatted amounts', () => {
  for (const query of ['side account', '旅行', 'holiday', '$1,250.25']) {
    const found = ids(filterGhostActivity(entries, { ...options, query }));
    assert(found.includes('expense'), query);
  }
  assert.deepEqual(ids(filterGhostActivity(entries, { ...options, query: 'hidden cash' })), ['income']);
  assert.deepEqual(ids(filterGhostActivity(entries, { ...options, query: 'missing' })), []);
});
