import 'server-only';
import { neonSql } from '@/db';

/**
 * Per-user write lock for check-then-write saves.
 *
 * Returns a statement to put FIRST in a neonSql.transaction([...]). It takes
 * a transaction-scoped advisory lock keyed to this user: a second save for
 * the same user waits at this statement until the first transaction commits,
 * and is released automatically at commit or rollback. Other users are
 * never blocked.
 *
 * The check must be a SEPARATE, LATER statement in the same transaction.
 * Under Postgres's default READ COMMITTED isolation each statement takes a
 * fresh snapshot, so a statement run after the lock sees every commit made
 * while it waited. A check folded into the lock's own statement would use a
 * snapshot taken before the wait - stale.
 *
 * drizzle's neon-http driver cannot express this (no interactive
 * transactions), hence the raw client.
 */
export function userWriteLockStatement(userId: string) {
  return neonSql`SELECT pg_advisory_xact_lock(hashtext('pebble.user-write'), hashtext(${userId}))`;
}
