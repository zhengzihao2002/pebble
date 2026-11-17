import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateGhostAccounts } from '../scripts/migrate-ghost-accounts.mjs';

const fake = () => {
  const queries = [], transactions = [], logs = [];
  const sql = { query: text => { queries.push(text); return { text }; }, transaction: async (statements, options) => transactions.push({ statements, options }) };
  return { queries, transactions, logs, options: { env: { DATABASE_URL: 'postgres://local-test-only' }, createClient: () => sql, log: value => logs.push(value) } };
};

test('prebuild sends only the complete additive ghost migration in a bounded transaction', async () => {
  const f = fake(); await migrateGhostAccounts(f.options);
  assert.equal(f.transactions.length, 1);
  assert.equal(f.queries.length, 3);
  assert.match(f.queries[0], /lock_timeout = '5s'/);
  assert.match(f.queries[1], /statement_timeout = '15s'/);
  const body = f.queries[2];
  assert.match(body, /^DO \$ghost_migration\$/);
  assert.match(body, /\$ghost_migration\$;$/);
  assert.match(body, /ADD COLUMN IF NOT EXISTS is_ghost boolean NOT NULL DEFAULT false/);
  assert.match(body, /CHECK \(NOT is_ghost OR NOT is_preferred\)/);
  assert(!/\bDELETE\b|\bDROP\b|\bTRUNCATE\b/.test(body));
  assert.equal(f.transactions[0].options.isolationLevel, 'ReadCommitted');
  assert(f.transactions[0].options.fetchOptions.signal instanceof AbortSignal);
});

test('local fake-credential builds can skip; Vercel builds cannot bypass the migration', async () => {
  const f = fake(); await migrateGhostAccounts({ ...f.options, env: { PEBBLE_SKIP_MIGRATIONS: '1' } });
  assert.equal(f.transactions.length, 0);
  await assert.rejects(migrateGhostAccounts({ ...f.options, env: { VERCEL: '1', PEBBLE_SKIP_MIGRATIONS: '1' } }), /only for local validation/);
  await assert.rejects(migrateGhostAccounts({ ...f.options, env: {} }), /DATABASE_URL is required/);
});

test('migration errors stop the build and malformed scripts never execute partially', async () => {
  const f = fake();
  await assert.rejects(migrateGhostAccounts({ ...f.options, read: async () => 'BEGIN; ALTER TABLE account DROP COLUMN name; COMMIT;' }), /single ghost migration/);
  assert.equal(f.transactions.length, 0);
  const failure = new Error('permission denied');
  await assert.rejects(migrateGhostAccounts({ ...f.options, createClient: () => ({ query: text => ({ text }), transaction: async () => { throw failure; } }) }), failure);
});
