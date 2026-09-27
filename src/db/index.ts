import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema });

/**
 * The raw Neon HTTP client drizzle wraps. Exported ONLY for multi-statement
 * transactions (neonSql.transaction([...])), which drizzle's neon-http driver
 * cannot express - see src/lib/data/userWriteLock.ts. Every ordinary query
 * goes through `db`.
 */
export const neonSql = sql;
