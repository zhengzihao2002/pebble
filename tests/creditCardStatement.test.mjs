import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { buildSync } from 'esbuild';

const source = buildSync({
  entryPoints: ['src/components/transactions/statementMath.ts'],
  bundle: true, write: false, platform: 'node', format: 'cjs',
}).outputFiles[0].text;
const compiled = { exports: {} };
vm.runInNewContext(source, { module: compiled, exports: compiled.exports });
const { cardStatementEntries, cardPayoffMarkers, groupByDay, monthFigures } = compiled.exports;

const payoff = {
  id: '20261115160712345-p', cardId: 'credit', cardName: 'Credit',
  date: '2026-11-15', remainingBalance: 25,
};

function expense(id, date, accountId, amount, creditCardPayoff) {
  return {
    transId: id,
    record: { id, type: 'expense', date, accountId, amount, creditCardPayoff },
    balancesAfter: { credit: -25 },
    totalBalanceAfter: -95,
  };
}

test('a paid purchase is shown once per account view, without becoming a second posting', () => {
  const newerCharge = expense('new', '2026-11-18', 'credit', -25);
  const paid = expense('same-db-id', '2026-11-06', 'checking', -45, payoff);
  const paidFromGhost = expense('hidden', '2026-11-01', 'ghost', -7, { ...payoff, id: 'earlier' });
  const entries = [newerCharge, paid, paidFromGhost];
  const ghostIds = new Set(['ghost']);
  const cardView = cardStatementEntries(entries, 'credit', ghostIds, false);
  const ordinaryEntries = entries.filter(({ record }) => !ghostIds.has(record.accountId));
  assert.deepEqual(Array.from(cardView), [newerCharge, paid]);
  const payerView = monthFigures(ordinaryEntries, 2026, 10, 0, 'checking');
  assert.deepEqual(Array.from(payerView.entries), [paid]);
  assert.equal(payerView.withdrawals, 45);
  assert.equal(monthFigures(ordinaryEntries, 2026, 10, 0, 'credit').withdrawals, 25);
  assert.equal(monthFigures(ordinaryEntries, 2026, 10, 0).withdrawals, 70);
  assert.deepEqual(Array.from(cardStatementEntries(entries, 'credit', ghostIds, true)), entries);
});

test('one display marker groups every purchase in a payoff and follows its own date', () => {
  const paid = expense('paid-in-october', '2026-10-02', 'checking', -45, payoff);
  const alsoPaid = expense('paid-in-november', '2026-11-06', 'checking', -25, payoff);
  const markers = cardPayoffMarkers([paid, alsoPaid], 'credit', '2026-11-');
  assert.deepEqual(Array.from(markers), [payoff]);
  assert.equal(cardPayoffMarkers([paid, alsoPaid], 'credit', '2026-10-').length, 0);
  assert.equal(cardPayoffMarkers([paid, alsoPaid], 'other-card', '2026-11-').length, 0);

  const groups = groupByDay([alsoPaid], entry => entry.balancesAfter.credit, 'credit', markers);
  assert.deepEqual(Array.from(groups, group => group.date), ['2026-11-15', '2026-11-06']);
  assert.equal(groups[0].items[0].kind, 'payoff');
  assert.equal(groups[0].items[0].payoff.remainingBalance, 25);
  assert.equal(groups[1].items[0].entry, alsoPaid);
  assert(groups.every(group => group.net === 0 && group.endBalance === null && !group.hasFlows));
});
