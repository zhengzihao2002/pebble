/**
 * The id a transaction saved offline carries from the moment it is created.
 *
 * It becomes the row's primary key, which is what makes uploading safe to
 * repeat: a retry after a lost response inserts the same id again, the
 * database refuses the duplicate, and the server recognises the row as the
 * caller's own earlier copy (see addTransaction in actions/pebble.ts).
 *
 * FORMAT: the 17-digit local timestamp generateTransId() uses (yyyyMMddHHmmssSSS),
 * a hyphen, then 12 random characters from [a-z0-9] (60 bits). Why:
 *  - It sorts among app-generated ids by the moment the person typed the
 *    entry, so same-day ordering (compareSameDayIds) is right even when the
 *    upload happens days later - a random UUID would scramble it.
 *  - It never contains '_', the marker compareSameDayIds uses for legacy
 *    imported rows.
 *  - 60 random bits make a collision with another user's id, or a guess at
 *    someone else's id, not a practical concern; the server still checks
 *    ownership instead of relying on that.
 *
 * Not a 'use server' module: the server validates against the same pattern,
 * and the client builds ids with it.
 */
export const CLIENT_ID_PATTERN = /^\d{17}-[a-z0-9]{12}$/;

export function isClientId(value: unknown): value is string {
  return typeof value === 'string' && CLIENT_ID_PATTERN.test(value);
}

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function makeClientId(now: Date = new Date()): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}${pad(now.getMilliseconds(), 3)}`;
  const bytes = new Uint8Array(12);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  // 256 is not a multiple of 36, so a plain modulo favours the first four
  // letters slightly - irrelevant for uniqueness at 60 bits.
  let rand = '';
  for (const b of bytes) rand += ALPHABET[b % ALPHABET.length];
  return `${stamp}-${rand}`;
}
