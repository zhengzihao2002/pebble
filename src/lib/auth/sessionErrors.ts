/** Neon currently normalizes Better Auth's code into an AuthApiError.
 * Match its preserved status/message as well as the original response code;
 * another 403 (a disabled account, for example) must not prompt for a password.
 */
export function requiresFreshSignIn(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as { code?: unknown; status?: unknown; message?: unknown };
  return value.code === 'SESSION_NOT_FRESH'
    || (value.status === 403 && value.message === 'Session is not fresh');
}

export function isInvalidPassword(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  return code === 'INVALID_EMAIL_OR_PASSWORD' || code === 'invalid_credentials';
}
