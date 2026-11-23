import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parse } from '@babel/parser';
import { buildSync, transformSync } from 'esbuild';

const source = readFileSync('src/lib/actions/pebble.ts', 'utf8');
const action = parse(source, { sourceType: 'module', plugins: ['typescript'] }).program.body
  .find(node => node.type === 'FunctionDeclaration' && node.id?.name === 'skipNextRecurring');
const { code } = transformSync(source.slice(action.start, action.end), { loader: 'ts' });
const compiled = buildSync({
  stdin: {
    contents: "export { planChargeNext } from './src/lib/recurring/chargeNext'; export { advanceOccurrenceStatement } from './src/lib/recurring/chargeNextSql';",
    resolveDir: process.cwd(),
  },
  bundle: true, write: false, platform: 'node', format: 'cjs',
}).outputFiles[0].text;
const pure = { exports: {} };
new Function('module', compiled)(pure);

test('skip advances the reviewed occurrence under the owner write lock without an insert', async () => {
  let rule = {
    id: 'rule', kind: 'expense', status: 'active', frequency: 'monthly', startDate: '2026-01-01',
    materializedThrough: '2026-12-01', endMode: 'never', endCount: null, endDate: null,
  };
  let updates = 0;
  let refreshes = 0;
  const neonSql = (strings, ...params) => ({ text: strings.join('?'), params });
  neonSql.transaction = async ([lock, update]) => {
    assert.equal(lock, 'owner');
    assert.match(update.text, /^UPDATE recurring_rule rr/);
    assert.match(update.text, /rr.user_id = \?::uuid AND rr.status = 'active'/);
    assert.match(update.text, /rr.materialized_through IS NOT DISTINCT FROM \?::date/);
    assert.doesNotMatch(update.text, /\bINSERT\b/);
    assert.equal(update.params[2], 'owner');
    if (rule.materializedThrough !== update.params[4]) return [[], []];
    rule = { ...rule, materializedThrough: update.params[0] };
    updates++;
    return [[], [{ id: rule.id }]];
  };
  const skip = new Function('deps', `const { fail, isYmd, getRecurringRuleById, todayInZone, resolveUserTimeZone, FALLBACK_TIME_ZONE, planChargeNext, advanceOccurrenceStatement, neonSql, userWriteLockStatement, revalidateAll, handleUnexpected } = deps;\n${code}\nreturn skipNextRecurring;`)({
    fail: (_message, kind, errorCode) => ({ ok: false, kind, errorCode }),
    isYmd: value => /^\d{4}-\d{2}-\d{2}$/.test(value),
    getRecurringRuleById: async (user, id) => user === 'owner' && id === rule.id ? rule : null,
    todayInZone: () => '2026-11-23', resolveUserTimeZone: async () => 'UTC', FALLBACK_TIME_ZONE: 'UTC',
    ...pure.exports, neonSql, userWriteLockStatement: user => user,
    revalidateAll: () => { refreshes++; }, handleUnexpected: (_where, error) => { throw error; },
  });
  const input = { id: 'rule', expectedOccurrence: '2027-01-01' };
  const both = await Promise.all([skip('owner', input), skip('owner', input)]);
  assert.deepEqual(both.find(result => result.ok), { ok: true, nextDate: '2027-02-01', finished: false });
  assert.equal(both.filter(result => result.ok).length, 1);
  assert.equal(updates, 1);
  assert.equal(refreshes, 1);
  assert.equal((await skip('another-user', { ...input, expectedOccurrence: '2027-02-01' })).ok, false);
  rule = { ...rule, status: 'paused' };
  assert.equal((await skip('owner', { ...input, expectedOccurrence: '2027-02-01' })).ok, false);
  assert.equal(updates, 1);
});
