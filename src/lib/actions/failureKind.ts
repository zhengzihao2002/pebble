/**
 * What kind of failure an action reports.
 *
 * Deliberately NOT a 'server-only' module: client components import the type
 * to decide whether "Try again" is worth offering.
 *
 * Absent kind means "we cannot say" - the client must then assume the failure
 * is NOT retryable. Offering a retry we cannot justify is the more dangerous
 * default here, because most writes are not idempotent and a retry of a call
 * that actually committed produces a duplicate financial transaction.
 */
export type FailureKind =
  /** Reached the database; it failed or refused. The write did NOT happen. */
  | 'database'
  /** Never got an answer. The write MAY have happened - do not claim otherwise. */
  | 'network'
  /** The input was rejected. Retrying it unchanged fails identically. */
  | 'validation'
  /** No session. Must never be presented as a database problem. */
  | 'session'
  /** Auth service unreachable - distinct from being signed out. */
  | 'auth'
  /** The row is gone, or was never the caller's to touch. */
  | 'notFound'
  | 'unknown';

/** Retrying is sensible only when we know the write did not land. */
export function isRetryable(kind: FailureKind | undefined): boolean {
  return kind === 'database' || kind === 'auth';
}
