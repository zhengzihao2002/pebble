import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parse } from '@babel/parser';
import { transformSync } from 'esbuild';
const source = fs.readFileSync('src/lib/actions/pebble.ts', 'utf8');
const ast = parse(source, { sourceType: 'module', plugins: ['typescript'] });
const fn = ast.program.body.find(node => node.type === 'FunctionDeclaration' && node.id?.name === 'setAccountGhost');
assert(fn);
const code = transformSync(source.slice(fn.start, fn.end), { loader: 'ts', target: 'es2022' }).code;
function fixture({ updated = true } = {}) {
  const runs = [];
  let revalidated = 0;
  const neonSql = (parts, ...params) => ({ sql: parts.join('?'), params });
  neonSql.transaction = async (statements, options) => { runs.push({ statements, options }); return [[], updated ? [{ id: 'owned' }] : []]; };
  const toggle = vm.runInNewContext(`${code}\nsetAccountGhost;`, {
    neonSql,
    userWriteLockStatement: userId => ({ lock: userId }),
    revalidateAll: () => { revalidated++; },
    fail: (error, kind, code) => ({ ok: false, error, kind, code }),
    handleUnexpected: () => ({ ok: false, error: 'unexpected' }),
  });
  return { toggle, runs, get revalidated() { return revalidated; } };
}

test('ghost toggle is session-wrapped and never accepts a client user id', () => {
  const declaration = ast.program.body.find(node => node.type === 'ExportNamedDeclaration' && node.declaration?.type === 'VariableDeclaration'
    && node.declaration.declarations.some(item => item.id.name === 'setAccountGhostAction'));
  const value = declaration.declaration.declarations.find(item => item.id.name === 'setAccountGhostAction').init;
  assert.equal(value.callee.name, 'withSessionUser');
  assert.equal(value.arguments[0].name, 'setAccountGhost');
});

test('toggle uses owner-scoped, user-locked atomic SQL and clears preference only on enabling', async () => {
  const f = fixture();
  for (const enabled of [true, false]) {
    assert.equal((await f.toggle('session-owner', 'account-id', enabled)).ok, true);
    const run = f.runs.at(-1);
    assert.equal(run.statements[0].lock, 'session-owner');
    const update = run.statements[1];
    assert.match(update.sql, /WHERE user_id = \?::uuid AND id = \?/);
    assert.match(update.sql, /is_preferred = CASE WHEN \? THEN false ELSE is_preferred END/);
    assert.equal(update.params[0], enabled);
    assert.equal(update.params[1], enabled);
    assert.equal(update.params[2], 'session-owner');
    assert.equal(update.params[3], 'account-id');
    assert.doesNotMatch(update.sql, /is_default|DELETE|status\s*=/i, 'Seeded and hibernated accounts can opt in without being frozen or deleted');
  }
  assert.equal(f.revalidated, 2);
});

test('invalid flags never reach SQL and missing or foreign accounts do not succeed', async () => {
  const valid = fixture();
  for (const invalid of [null, undefined, 'true', 1]) assert.equal((await valid.toggle('owner', 'account', invalid)).ok, false);
  assert.equal(valid.runs.length, 0);
  const missing = fixture({ updated: false });
  const result = await missing.toggle('owner', 'someone-elses-account', true);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'notFound.account');
  assert.equal(missing.revalidated, 0);
});
