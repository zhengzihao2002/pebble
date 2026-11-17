import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

const migration = new URL('../migrations/20261117_ghost_accounts.sql', import.meta.url);

/** Only this additive account migration runs during prebuild. Never infer or
 * replay the directory's other migrations, drop objects, or rewrite ledger data. */
export async function migrateGhostAccounts({ env = process.env, createClient = neon, read = readFile, log = console.log } = {}) {
  if (env.PEBBLE_SKIP_MIGRATIONS === '1') {
    if (env.VERCEL) throw new Error('Migration bypass is allowed only for local validation.');
    log('Ghost account migration skipped for local validation.');
    return;
  }
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required for the ghost account migration.');
  const source = await read(migration, 'utf8');
  // Keep the complete dollar-quoted function body intact. Do not split SQL at
  // semicolons: that corrupts DO/function bodies and can produce partial DDL.
  const match = source.match(/\bBEGIN;\s*(DO \$ghost_migration\$[\s\S]*\$ghost_migration\$;)\s*COMMIT;\s*$/);
  if (!match) throw new Error('The expected single ghost migration body was not found.');
  const sql = createClient(env.DATABASE_URL);
  await sql.transaction([
    sql.query("SET LOCAL lock_timeout = '5s'"),
    sql.query("SET LOCAL statement_timeout = '15s'"),
    sql.query(match[1]),
  ], { isolationLevel: 'ReadCommitted', fetchOptions: { signal: AbortSignal.timeout(25000) } });
  log('Ghost account schema is ready. Existing account data was preserved.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  migrateGhostAccounts().catch(error => {
    // Never print connection details, URLs, credentials, or SQL parameters.
    const code = typeof error?.code === 'string' && /^[A-Z0-9]{5}$/.test(error.code) ? error.code : 'connection-or-schema';
    console.error(`Ghost account migration failed (${code}). Build stopped; the existing deployment remains available.`);
    process.exitCode = 1;
  });
}
