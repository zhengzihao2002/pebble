import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import vm from 'node:vm';
function moduleAt(path) {
  const compiled = { exports: {} };
  const source = buildSync({ entryPoints: [path], bundle: true, write: false, platform: 'node', format: 'cjs' }).outputFiles[0].text;
  vm.runInNewContext(source, { module: compiled, exports: compiled.exports, Intl, Date });
  return compiled.exports;
}
const { regularAccounts, nonGhostRecords, ghostAccountIds } = moduleAt('src/lib/accounts/ghost.ts');
const { computeCurrentBalances, computeRecentTransactions } = moduleAt('src/lib/stats.ts');
const accounts = [
  { id: 'bank', kind: 'bank' },
  { id: 'cash', kind: 'cash', status: 'hibernated', isGhost: false },
  { id: 'ghost-bank', kind: 'bank', isGhost: true },
  { id: 'ghost-cash', kind: 'cash', isGhost: true },
  { id: 'ghost-credit', kind: 'credit', isGhost: true },
];
const row = (id, accountId, amount, date = '2026-11-17') => ({ id, accountId, amount, date, description: id, paymentMethod: accountId });
const incomes = [
  { ...row('20261117_1', 'bank', 1000), type: 'income', category: 'Standard Income', netAmount: 1000, grossAmount: 1200 },
  { ...row('20261117_2', 'ghost-bank', 999999), type: 'income', category: 'Standard Income', netAmount: 999999, grossAmount: 1200000 },
];
const expenses = [
  { ...row('20261117_3', 'cash', -25), type: 'expense', category: 'Food' },
  { ...row('20261117_4', 'ghost-credit', -400), type: 'expense', category: 'Food' },
];
const adjustments = [
  { ...row('20261117_5', 'bank', -100), type: 'adjustment', transferGroupId: 'transfer' },
  { ...row('20261117_6', 'ghost-cash', 100), type: 'adjustment', transferGroupId: 'transfer' },
];

test('ghost scope is explicit, kind-independent, and fails closed for unknown accounts', () => {
  assert.deepEqual([...ghostAccountIds(accounts)], ['ghost-bank', 'ghost-cash', 'ghost-credit']);
  assert.deepEqual(Array.from(regularAccounts(accounts), account => account.id), ['bank', 'cash']);
  const visible = nonGhostRecords([...incomes, ...expenses, ...adjustments, row('unknown', 'missing', 1e9)], accounts);
  assert.deepEqual(Array.from(visible, record => record.accountId), ['bank', 'cash', 'bank']);
  assert.equal(nonGhostRecords(incomes, []).length, 0);
});

test('raw ghost balances remain available individually but never join combined balance', () => {
  const balances = computeCurrentBalances([...incomes, ...expenses], accounts, adjustments);
  assert.equal(balances.total, 875);
  assert.equal(balances.byAccount.bank, 900);
  assert.equal(balances.byAccount.cash, -25, 'Ordinary hibernated accounts still count');
  assert.equal(balances.byAccount['ghost-bank'], 999999);
  assert.equal(balances.byAccount['ghost-cash'], 100);
  assert.equal(balances.byAccount['ghost-credit'], -400);
});

test('a transfer across the ghost boundary changes the real balance once without fabricated spending', () => {
  const balances = computeCurrentBalances(incomes, accounts, adjustments);
  assert.equal(balances.total, 900);
  assert.equal(expenses.length, 2, 'Transfers remain adjustments, never expense or income');
  const ledger = computeRecentTransactions(expenses, incomes, accounts, adjustments);
  assert.equal(ledger.length, 6, 'Explicit raw ledger retains independently inspectable ghost entries');
  assert.equal(ledger[0].totalBalanceAfter, 875);
  const ghostTransfer = ledger.find(entry => entry.transId === '20261117_6');
  assert.equal(ghostTransfer.balancesAfter['ghost-cash'], 100);
  assert.equal(ghostTransfer.totalBalanceAfter, 875);
  const ghostIncome = ledger.find(entry => entry.transId === '20261117_2');
  assert.equal(ghostIncome.totalBalanceAfter, 1000);
});

test('turning ghost mode off restores exactly that account to the totals', () => {
  const restored = accounts.map(account => ({ ...account, isGhost: false }));
  const balances = computeCurrentBalances([...incomes, ...expenses], restored, adjustments);
  assert.equal(balances.total, 1000574);
});
