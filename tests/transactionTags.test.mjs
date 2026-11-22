import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parse } from '@babel/parser';
import { transformSync } from 'esbuild';

const { code: grouping } = transformSync(readFileSync('src/lib/transactionTags.ts', 'utf8'), { loader: 'ts', format: 'cjs' });
const groupedModule = { exports: {} };
new Function('module', 'exports', grouping)(groupedModule, groupedModule.exports);
const { groupTransactionTags, indexTaggedTransactions, MAX_TAG_NAME_LENGTH } = groupedModule.exports;

const actions = readFileSync('src/lib/actions/pebble.ts', 'utf8');
const program = parse(actions, { sourceType: 'module', plugins: ['typescript'] }).program.body;
const handler = program.find(node => node.type === 'FunctionDeclaration' && node.id?.name === 'renameTransactionTag');
const { code: renameCode } = transformSync(actions.slice(handler.start, handler.end), { loader: 'ts' });

test('tag groups count exact names and omit untagged transactions', () => {
  assert.deepEqual(groupTransactionTags([
    { tag: 'Coffee' }, { tag: 'Coffee' }, { tag: 'coffee' }, { tag: '  ' }, {},
  ]), [{ name: 'Coffee', count: 2 }, { name: 'coffee', count: 1 }]);
});

test('saved tag rows retain paid-card names and use the same date and id ordering as live rows', () => {
  const row = { tag: 'Groceries', description: 'Market visit', category: 'Food', date: '2026-11-21', amount: 24.59, accountId: 'bank' };
  const details = indexTaggedTransactions([
    { ...row, id: 'a' },
    { ...row, id: 'z', creditCardPayoff: { cardName: 'Credit' } },
    { ...row, id: 'old', date: '2026-11-19' },
    { ...row, id: 'p', tag: '__proto__', accountId: 'missing' },
    { ...row, id: 'no-tag', tag: '' },
  ], [{ id: 'bank', name: 'Debit' }]);
  assert.deepEqual(details.Groceries.map(({ id, accountName }) => [id, accountName]), [['z', 'Credit'], ['a', 'Debit'], ['old', 'Debit']]);
  assert.deepEqual(details.__proto__.map(({ id, accountName }) => [id, accountName]), [['p', null]]);
  assert.deepEqual(Object.keys(details), ['Groceries', '__proto__']);
});

test('bulk rename checks its session, validates the target, and changes only the matching expense tags', async () => {
  const exported = program.find(node => node.type === 'ExportNamedDeclaration' && node.declaration?.type === 'VariableDeclaration'
    && node.declaration.declarations.some(item => item.id.name === 'renameTransactionTagAction'));
  const action = exported.declaration.declarations.find(item => item.id.name === 'renameTransactionTagAction').init;
  assert.equal(action.callee.name, 'withSessionUser');
  assert.equal(action.arguments[0].name, 'renameTransactionTag');

  const writes = [];
  const neonSql = (parts, ...params) => ({ sql: parts.join('?'), params });
  neonSql.transaction = async statements => { writes.push(statements); return [[], [{ count: 2 }]]; };
  let revalidated = false;
  const rename = new Function('neonSql', 'userWriteLockStatement', 'revalidateAll', 'fail', 'MAX_TAG_NAME_LENGTH',
    renameCode + '\nreturn renameTransactionTag')(
      neonSql, user => ({ lock: user }), () => { revalidated = true; }, () => ({ ok: false }), MAX_TAG_NAME_LENGTH,
  );
  for (const target of ['', ' Coffee ', 'x'.repeat(MAX_TAG_NAME_LENGTH + 1)]) {
    assert.equal((await rename('owner', 'Coffee', target)).ok, false);
  }
  assert.equal(writes.length, 0);

  assert.deepEqual(await rename('owner', 'Coffee', ' Café '), { ok: true, count: 2 });
  assert.deepEqual(writes[0][0], { lock: 'owner' });
  const [{ sql, params }] = writes[0].slice(1);
  assert.match(sql, /UPDATE expense SET tag = \? WHERE user_id = \?::uuid AND tag = \? RETURNING 1/);
  assert.deepEqual(params, ['Café', 'owner', 'Coffee']);
  assert(revalidated);
});

test('clear requires a selection and scopes the update to its owner, current tag, and selected rows', async () => {
  assert.match(actions, /export const clearTransactionTagsAction = withSessionUser\(clearTransactionTags\)/);
  assert.match(actions, /export const loadTaggedTransactionsAction = withSessionUser\(loadTaggedTransactions\)/);
  const clearHandler = program.find(node => node.type === 'FunctionDeclaration' && node.id?.name === 'clearTransactionTags');
  const { code } = transformSync(actions.slice(clearHandler.start, clearHandler.end), { loader: 'ts' });
  const writes = [];
  const neonSql = (parts, ...params) => ({ sql: parts.join('?'), params });
  neonSql.transaction = async statements => { writes.push(statements); return [[], [{ count: 1 }]]; };
  const clear = new Function('neonSql', 'userWriteLockStatement', 'revalidateAll', 'fail', code + '\nreturn clearTransactionTags')(
    neonSql, user => ({ lock: user }), () => {}, () => ({ ok: false }),
  );
  assert.equal((await clear('owner', 'Coffee', [])).ok, false);
  assert.equal((await clear('owner', '', ['id'])).ok, false);
  assert.equal(writes.length, 0);
  assert.deepEqual(await clear('owner', 'Coffee', ['own', 'other']), { ok: true, count: 1 });
  const [lock, update] = writes[0];
  assert.deepEqual(lock, { lock: 'owner' });
  assert.match(update.sql, /UPDATE expense SET tag = ''\s+WHERE user_id = \?::uuid AND tag = \? AND id = ANY\(\?::text\[\]\)/);
  assert.deepEqual(update.params, ['owner', 'Coffee', ['own', 'other']]);
});
