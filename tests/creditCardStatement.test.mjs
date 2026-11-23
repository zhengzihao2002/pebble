import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { buildSync, transformSync } from 'esbuild';
import { readFileSync } from 'node:fs';
import { parse } from '@babel/parser';

const source = buildSync({
  stdin: {
    contents: `
      export * from './src/components/transactions/statementMath';
      export { transactionDisplayAccountId } from './src/lib/creditCards';
      export { computeCategorySpent, computeCurrentBalances, computeStatsForPeriod, mergeTransactions } from './src/lib/stats';
      export { detectRecurring } from './src/lib/recurring/detect';
    `,
    resolveDir: process.cwd(),
  },
  bundle: true, write: false, platform: 'node', format: 'cjs',
}).outputFiles[0].text;
const compiled = { exports: {} };
vm.runInNewContext(source, { module: compiled, exports: compiled.exports });
const { transactionDisplayAccountId, statementPayoffs, groupByDay, monthFigures, statementFlows, summarizeMonths, daySeries } = compiled.exports;
const { computeCategorySpent, computeCurrentBalances, computeStatsForPeriod, mergeTransactions, detectRecurring } = compiled.exports;

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
  assert.deepEqual(Array.from(markers[0].fundingAccountIds), ['checking', 'other-bank']);
  assert.equal(fundingMarkers.length, 1);
  assert.equal(fundingMarkers[0].side, 'funding');
  assert.equal(fundingMarkers[0].amount, 70.61);
  assert.deepEqual(Array.from(fundingMarkers[0].fundingAccountIds), ['checking']);
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

test('paying a card changes account balances but preserves spending and budget usage', () => {
  const card = { ...expense('purchase', '2026-11-06', 'credit', -40).record, category: 'Food' };
  const debit = { ...expense('debit', '2026-11-07', 'checking', -15).record, category: 'Food' };
  const settled = { ...card, accountId: 'checking', creditCardPayoff: payoff };
  const income = { id: 'pay', type: 'income', category: 'Standard Income', date: '2026-11-02', accountId: 'checking', amount: 200 };
  const adjustment = { type: 'adjustment', accountId: 'checking', amount: 10 };
  const accounts = [{ id: 'checking' }, { id: 'credit' }];
  const before = mergeTransactions([card, debit], [income]);
  const after = mergeTransactions([settled, debit], [income]);
  const today = new Date(2026, 10, 17);

  for (const records of [before, after]) {
    assert.equal(records.length, 3);
    assert.equal(computeStatsForPeriod(records, 'all', null, today).spending, 55);
    assert.equal(computeCategorySpent(records, 2026).Food, 55);
    assert.equal(computeCurrentBalances(records, accounts, [adjustment]).total, 155);
  }
  assert.equal(computeCurrentBalances(before, accounts, [adjustment]).byAccount.credit, -40);
  assert.equal(computeCurrentBalances(after, accounts, [adjustment]).byAccount.credit, 0);
  assert.equal(computeCurrentBalances(after, accounts, [adjustment]).byAccount.checking, 155);
});

test('a paid recurring purchase still suggests the original credit card for future charges', () => {
  const purchases = [8, 9, 10, 11].map(month => ({
    ...expense(`stream-${month}`, `2026-${String(month).padStart(2, '0')}-06`, 'checking', -20, payoff).record,
    description: 'Streaming subscription', category: 'Entertainment',
  }));
  const [candidate] = detectRecurring(purchases, [], '2026-11-17');
  assert.equal(candidate?.accountId, 'credit');
  assert.equal(candidate.amount, -20);
});


test('undo returns the original purchases to the card and removes both payoff markers', async () => {
  const actions = readFileSync('src/lib/actions/pebble.ts', 'utf8');
  const ast = parse(actions, { sourceType: 'module', plugins: ['typescript'] });
  const handler = ast.program.body.find(node => node.type === 'FunctionDeclaration' && node.id?.name === 'undoCreditCardPayoff');
  const { code } = transformSync(actions.slice(handler.start, handler.end), { loader: 'ts' });
  assert.match(actions, /export const undoCreditCardPayoffAction = withSessionUser\(undoCreditCardPayoff\)/);

  const owner = 'owner';
  const card = { id: 'credit', kind: 'credit', name: 'Credit', userId: owner };
  const accounts = [card, { id: 'checking' }, { id: 'cash' }];
  const rows = [
    { ...expense('one', '2026-11-05', 'checking', -40, payoff).record, userId: owner },
    { ...expense('two', '2026-11-06', 'cash', -10, payoff).record, userId: owner },
    { ...expense('different', '2026-11-06', 'checking', -25, { ...payoff, id: 'different' }).record, userId: owner },
    { ...expense('foreign', '2026-11-06', 'checking', -50, payoff).record, userId: 'other' },
  ];
  let refreshes = 0;
  const neonSql = (strings, ...values) => ({ text: strings.join('?'), values });
  neonSql.transaction = async ([lock, cardLock, update]) => {
    assert.deepEqual(lock, { lock: owner });
    assert.match(cardLock.text, /FOR UPDATE/);
    assert.match(update.text, /UPDATE expense e\s+SET account_id = card.id, payment_method = card.name, credit_card_payoff = NULL/);
    assert.match(update.text, /card.user_id = \?::uuid AND card.id = \? AND card.kind = 'credit'/);
    assert.match(update.text, /DELETE FROM credit_card_payment\s+WHERE user_id = \?::uuid AND card_id = \? AND id = \?/);
    assert.match(update.text, /NOT EXISTS \(SELECT 1 FROM deleted\)/);
    assert.match(update.text, /e.user_id = card.user_id AND e.account_id <> card.id\s+AND e.credit_card_payoff->>'cardId' = card.id\s+AND e.credit_card_payoff->>'id' = \?/);
    const [userId, cardId, receiptId] = update.values;
    const restored = rows.filter(row => row.userId === userId && card.id === cardId && row.creditCardPayoff?.cardId === cardId && row.creditCardPayoff.id === receiptId);
    for (const row of restored) Object.assign(row, { accountId: cardId, paymentMethod: card.name, creditCardPayoff: null });
    return [[], [], restored];
  };
  const undo = new Function('neonSql', 'userWriteLockStatement', 'revalidateAll', 'fail', 'handleUnexpected',
    code + '\nreturn undoCreditCardPayoff')(
      neonSql, lock => ({ lock }), () => { refreshes++; },
      (_message, _kind, code) => ({ ok: false, code }), (_where, error) => { throw error; },
    );
  const input = { receiptId: payoff.id, cardId: card.id };
  const entries = () => rows.filter(record => record.userId === owner).map(record => ({ record }));
  assert(statementPayoffs(entries(), 'checking', '2026-11-').some(receipt => receipt.id === payoff.id));
  assert(statementPayoffs(entries(), 'credit', '2026-11-').some(receipt => receipt.id === payoff.id));
  assert.deepEqual(await undo(owner, input), { ok: true });
  for (const account of accounts) {
    assert(!statementPayoffs(entries(), account.id, '2026-11-').some(receipt => receipt.id === payoff.id));
  }
  const balances = computeCurrentBalances(entries().map(({ record }) => record), accounts, []);
  assert.deepEqual({ ...balances.byAccount }, { credit: -50, checking: -25, cash: 0 });
  assert.deepEqual(entries().map(({ record }) => [record.id, record.amount, record.date]), [
    ['one', -40, '2026-11-05'], ['two', -10, '2026-11-06'], ['different', -25, '2026-11-06'],
  ]);
  assert.equal(rows[3].creditCardPayoff, payoff);
  assert.deepEqual(await undo(owner, input), { ok: false, code: 'validation.payoffUnavailable' });
  assert.equal(refreshes, 1);
});


test('standalone payoff stays on both account statements after the last linked purchase is deleted', () => {
  const payment = { ...payoff, fundingAccountId: 'checking' };
  const purchase = expense('purchase', '2026-11-06', 'credit', -50, payment).record;
  const adjustments = [
    { id: 'payment-card', type: 'adjustment', accountId: 'credit', date: payment.date, amount: 50, cardPayment: payment },
    { id: 'payment-funding', type: 'adjustment', accountId: 'checking', date: payment.date, amount: -50, cardPayment: payment },
  ];
  const accounts = [{ id: 'checking' }, { id: 'credit' }];
  for (const expenses of [[purchase], []]) {
    const balance = computeCurrentBalances(expenses, accounts, adjustments).byAccount;
    assert.equal(balance.checking, -50);
    assert.equal(balance.credit, expenses.length ? 0 : 50);
    const entries = [...expenses, ...adjustments].map(record => ({ record, transId: record.id }));
    for (const account of accounts) {
      const receipts = statementPayoffs(entries, account.id, '2026-11-');
      assert.equal(receipts.length, 1);
      assert.equal(receipts[0].amount, 50);
      const accountEntries = entries.filter(entry => entry.record.accountId === account.id);
      const days = groupByDay(accountEntries, () => balance[account.id], account.id, receipts);
      assert.equal(days[0].items[0].kind, 'payoff');
      assert.equal(days[0].items.length, 1);
      assert.equal(days[0].endBalance, balance[account.id]);
      assert.equal(days[0].hasFlows, false);
    }
  }
});
