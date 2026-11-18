import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { buildSync } from 'esbuild';

const source = buildSync({
  stdin: {
    contents: `
      export * from './src/components/transactions/statementMath';
      export { transactionDisplayAccountId } from './src/lib/creditCards';
    `,
    resolveDir: process.cwd(),
  },
  bundle: true, write: false, platform: 'node', format: 'cjs',
}).outputFiles[0].text;
const compiled = { exports: {} };
vm.runInNewContext(source, { module: compiled, exports: compiled.exports });
const { transactionDisplayAccountId, statementPayoffs, groupByDay, monthFigures, statementFlows, summarizeMonths, daySeries } = compiled.exports;

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

test('a paid purchase stays in the credit view while the funding balance is charged once', () => {
  const newerCharge = expense('new', '2026-11-18', 'credit', -25);
  const paid = expense('same-db-id', '2026-11-06', 'checking', -45, payoff);
  const paidFromGhost = expense('hidden', '2026-11-01', 'ghost', -7, { ...payoff, id: 'earlier' });
  const entries = [newerCharge, paid, paidFromGhost];
  const ghostIds = new Set(['ghost']);
  const ordinaryEntries = entries.filter(({ record }) => !ghostIds.has(record.accountId));
  const forAccount = (records, id) => records.filter(({ record }) => transactionDisplayAccountId(record) === id);
  const cardView = forAccount(ordinaryEntries, 'credit');
  assert.deepEqual(Array.from(cardView), [newerCharge, paid]);
  assert.deepEqual(Array.from(forAccount(entries, 'checking')), []);
  assert.deepEqual(Array.from(forAccount(entries, 'ghost')), []);
  const payerView = monthFigures(ordinaryEntries, 2026, 10, 0, 'checking');
  assert.deepEqual(Array.from(payerView.entries), [paid]);
  assert.equal(payerView.withdrawals, 45);
  assert.equal(monthFigures(ordinaryEntries, 2026, 10, 0, 'credit').withdrawals, 25);
  assert.equal(monthFigures(ordinaryEntries, 2026, 10, 0).withdrawals, 70);
  assert.equal(statementFlows(cardView).withdrawals, 70);
  const [chip] = summarizeMonths(ordinaryEntries, [{ year: 2026, month: 10 }], 0, 'credit');
  assert.equal(chip.withdrawals, 70);
  assert.equal(chip.count, 2);
  assert.equal(chip.closing, -25);
  assert.deepEqual(Array.from(forAccount(entries, 'credit')), entries);
});

test('one display marker per payoff follows the date and amount for each side', () => {
  const paid = expense('paid-in-october', '2026-10-02', 'checking', -45.26, payoff);
  const alsoPaid = expense('paid-in-november', '2026-11-06', 'checking', -25.35, payoff);
  const moved = expense('paid-then-moved', '2026-11-11', 'other-bank', -10.14, payoff);
  const entries = [paid, alsoPaid, moved];
  const markers = statementPayoffs(entries, 'credit', '2026-11-');
  const fundingMarkers = statementPayoffs(entries, 'checking', '2026-11-');
  assert.equal(markers.length, 1);
  assert.equal(markers[0].side, 'card');
  assert.equal(markers[0].amount, 80.75);
  assert.equal(fundingMarkers.length, 1);
  assert.equal(fundingMarkers[0].side, 'funding');
  assert.equal(fundingMarkers[0].amount, 70.61);
  assert.equal(statementPayoffs(entries, 'other-bank', '2026-11-')[0].amount, 10.14);
  assert.equal(statementPayoffs(entries, 'credit', '2026-10-').length, 0);
  assert.equal(statementPayoffs(entries, 'other-card', '2026-11-').length, 0);

  const groups = groupByDay([alsoPaid], entry => entry.balancesAfter.credit, 'credit', markers);
  assert.deepEqual(Array.from(groups, group => group.date), ['2026-11-15', '2026-11-06']);
  assert.equal(groups[0].items[0].kind, 'payoff');
  assert.equal(groups[0].items[0].payoff.remainingBalance, 25);
  assert.equal(groups[1].items[0].entry, alsoPaid);
  assert.equal(groups[0].hasFlows, false);
  assert.equal(groups[1].hasFlows, true);
  assert.equal(groups[1].net, -25.35);
  assert(groups.every(group => group.endBalance === null));
  const payerDays = groupByDay([], () => 0, 'checking', fundingMarkers);
  assert.equal(payerDays[0].items[0].kind, 'payoff');
  assert.equal(payerDays[0].items[0].payoff.amount, 70.61);
  assert.equal(payerDays[0].hasFlows, false);
});

test('balance corrections and transfers affect running balances without adding income or spending', () => {
  const purchase = expense('purchase', '2026-11-06', 'checking', -40, payoff);
  const adjustment = {
    transId: 'transfer', record: { type: 'adjustment', date: '2026-11-07', accountId: 'credit', amount: 80 },
    balancesAfter: { credit: 25 }, totalBalanceAfter: 100,
  };
  const entries = [adjustment, purchase];
  const [chip] = summarizeMonths(entries, [{ year: 2026, month: 10 }], 0, 'credit');
  assert.equal(chip.deposits, 0);
  assert.equal(chip.withdrawals, 40);
  assert.equal(chip.count, 1);
  const points = daySeries(entries, entries, 2026, 10, 8, 0, e => e.totalBalanceAfter);
  assert.equal(points[6].outflow, 40);
  assert.equal(points[7].balance, 100);
  assert.equal(points[7].inflow, 0);
  assert.equal(points[7].count, 0);
});
