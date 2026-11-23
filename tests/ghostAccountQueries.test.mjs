import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { parse } from '@babel/parser';
import { buildSync, transformSync } from 'esbuild';
import { drizzle } from 'drizzle-orm/neon-http';
import * as operators from 'drizzle-orm';
const require = createRequire(import.meta.url);
const schemaModule = { exports: {} };
const schemaSource = buildSync({ entryPoints: ['src/db/schema.ts'], bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external' }).outputFiles[0].text;
vm.runInNewContext(schemaSource, { module: schemaModule, exports: schemaModule.exports, require });
const schema = schemaModule.exports;
const source = fs.readFileSync('src/lib/data/queries.ts', 'utf8');
const ast = parse(source, { sourceType: 'module', plugins: ['typescript'] });
const names = ['withoutGhost', 'getExpenses', 'getIncome', 'getBalanceAdjustments', 'getRecurringRules', 'getRulesDueForCatchUp', 'getAccounts'];
const functions = ast.program.body.map(node => node.type === 'ExportNamedDeclaration' ? node.declaration : node)
  .filter(node => node?.type === 'FunctionDeclaration' && names.includes(node.id?.name));
const compiled = transformSync(functions.map(node => source.slice(node.start, node.end)).join('\n'), { loader: 'ts', target: 'es2022' }).code;
function fixture() {
  const queries = [];
  const real = drizzle.mock();
  const wrap = target => {
    if (!target || typeof target !== 'object' || typeof target.toSQL !== 'function') return target;
    return new Proxy(target, { get(object, key) {
      if (key === 'then') return resolve => { queries.push(object.toSQL()); resolve([]); };
      const value = Reflect.get(object, key);
      return typeof value === 'function' ? (...args) => wrap(value.apply(object, args)) : value;
    } });
  };
  const db = { select: (...args) => {
    const select = real.select(...args);
    return new Proxy(select, { get(object, key) {
      const value = Reflect.get(object, key);
      return typeof value === 'function' ? (...args) => wrap(value.apply(object, args)) : value;
    } });
  } };
  const neonSql = (strings, ...params) => {
    queries.push({ sql: strings.join('?'), params });
    return [];
  };
  const scope = { ...operators, ...schema, db, neonSql,
    mapExpenseRow: value => value, mapIncomeRow: value => value,
    mapRecurringRuleRow: value => value, mapAccountRow: value => value,
  };
  const functions = vm.runInNewContext(`${compiled}\n({${names.join(',')}})`, scope);
  return { ...functions, queries };
}

for (const name of ['getExpenses', 'getIncome', 'getRecurringRules']) {
  test(`${name} excludes ghost accounts by default and requires explicit raw scope`, async () => {
    const f = fixture();
    await f[name]('owner');
    const normal = f.queries.at(-1);
    assert.match(normal.sql, /not exists/i);
    assert.match(normal.sql, /"account"\."is_ghost"/);
    assert(normal.params.includes('owner'));
    assert(normal.params.includes(true));
    await f[name]('owner', { includeGhost: true });
    const raw = f.queries.at(-1);
    assert.doesNotMatch(raw.sql, /not exists|is_ghost/i);
    assert(raw.params.includes('owner'), 'Explicit ghost visibility must retain the owner scope');
    if (name === 'getRecurringRules') assert(raw.params.includes('deleted'), 'Raw visibility still excludes deleted rules');
  });
}

test('balance postings are owner scoped and only include ghost accounts on request', async () => {
  const f = fixture();
  await f.getBalanceAdjustments('owner');
  assert.match(f.queries[0].sql, /pebble_balance_posting/);
  assert.match(f.queries[0].sql, /b.user_id=\?::uuid AND \(\? OR NOT a.is_ghost\)/);
  assert.deepEqual(f.queries[0].params, ['owner', false]);
  await f.getBalanceAdjustments('owner', { includeGhost: true });
  assert.deepEqual(f.queries[1].params, ['owner', true]);
});

test('ghost schedules still materialize into their own accounts through the catch-up query', async () => {
  const f = fixture();
  await f.getRulesDueForCatchUp('owner', '2026-11-17');
  const query = f.queries.at(-1);
  assert.doesNotMatch(query.sql, /is_ghost/);
  assert(query.params.includes('owner'));
  assert(query.params.includes('active'));
});

test('ordinary account reads omit ghost identities; management scope keeps them owner-scoped', async () => {
  const f = fixture();
  await f.getAccounts('owner');
  assert.match(f.queries.at(-1).sql, /"account"\."is_ghost"/);
  assert(f.queries.at(-1).params.includes(false));
  await f.getAccounts('owner', { includeGhost: true });
  const raw = f.queries.at(-1);
  // The selected row still has is_ghost; only the WHERE predicate is absent.
  assert.doesNotMatch(raw.sql.split(' where ')[1], /is_ghost/);
  assert(raw.params.includes('owner'));
});
