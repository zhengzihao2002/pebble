import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parse } from '@babel/parser';
import { transformSync } from 'esbuild';

const source = readFileSync('src/lib/actions/pebble.ts', 'utf8');
const ast = parse(source, { sourceType: 'module', plugins: ['typescript'] });
const handler = ast.program.body.find(node => node.type === 'FunctionDeclaration' && node.id?.name === 'deleteGoal');
const { code } = transformSync(source.slice(handler.start, handler.end), { loader: 'ts' });

test('dismissing a reached goal releases its allocation and checks completion and ownership at deletion', async () => {
  const goal = { id: 'id', userId: 'userId', currentAmount: 'currentAmount', targetAmount: 'targetAmount' };
  let rows = [
    { id: 'car', userId: 'owner', currentAmount: 625, targetAmount: 500 },
    { id: 'home', userId: 'owner', currentAmount: 100, targetAmount: 500 },
    { id: 'foreign', userId: 'other', currentAmount: 500, targetAmount: 500 },
  ];
  let revalidations = 0;
  const db = { delete(table) {
    assert.equal(table, goal);
    return { where: predicate => ({ returning() {
      const removed = rows.filter(predicate);
      rows = rows.filter(row => !predicate(row));
      return removed;
    } }) };
  } };
  const deleteGoal = new Function('db', 'goal', 'and', 'eq', 'gt', 'gte', 'fail', 'revalidateAll',
    code + '\nreturn deleteGoal')(
      db, goal, (...predicates) => row => predicates.every(predicate => !predicate || predicate(row)),
      (column, value) => row => row[column] === value,
      (column, value) => row => row[column] > value,
      (column, target) => row => row[column] >= row[target],
      (_error, _kind, code) => ({ ok: false, code }),
      () => { revalidations++; },
    );
  const dismiss = id => deleteGoal('owner', { id, reachedOnly: true });
  assert.match(source, /export const deleteGoalAction = withSessionUser\(deleteGoal\)/);
  assert.equal((await dismiss('home')).ok, false);
  assert.equal((await dismiss('foreign')).ok, false);
  assert.deepEqual(await dismiss('car'), { ok: true });
  assert.deepEqual(rows.filter(row => row.userId === 'owner').map(row => row.currentAmount), [100]);
  assert.equal(revalidations, 1);
  assert.equal((await dismiss('car')).ok, false);
  assert.deepEqual(await deleteGoal('owner', { id: 'home', deferPageRefresh: true }), { ok: true });
  assert.equal(revalidations, 1);
});
