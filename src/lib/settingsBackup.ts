/**
 * Settings backup: everything Pebble remembers ON THIS DEVICE, as one code
 * the user can copy, keep, and paste back after reinstalling the app.
 *
 * Deleting a Home Screen app on iOS deletes its storage, and with it every
 * device preference (theme, text size, fonts, chart choices, sounds, ...).
 * Money data lives in the account on the server and needs none of this.
 *
 * What goes in: every `pebble-` localStorage entry that belongs to the
 * signed-in user or to the device as a whole, EXCEPT caches and machine state
 * (DENIED below). Caches rebuild themselves; restoring stale ones would show
 * the wrong layout, and the offline queue must never be replayed from a copy.
 * Other people's entries on a shared device are never included.
 *
 * The user's id is replaced with a placeholder, so a code restores into
 * whichever account is signed in when it is pasted.
 */

export const BACKUP_PREFIX = 'PEBBLE-SETTINGS-1:';
const USER = '{user}';
const MAIN_PREFS = 'pebble-ui';
const LAST_USER = 'pebble-ui:last-user';
const MAX_ITEMS = 2000;

/** Caches and machine state: never copied out, never written back. */
const DENIED = [
  LAST_USER,
  'pebble-layout-sizes:',
  'pebble-bottom-nav:',
  'pebble-offline',
  'pebble-sw-',
  'pebble-quickpicks:',
  'pebble-strip-reload',
];

export interface StorageLike {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface BackupBody { v: 1; at: string; items: Record<string, string> }

const denied = (key: string) => DENIED.some((prefix) => key === prefix || key.startsWith(prefix));

/** A main-preferences entry of SOME user (`pebble-ui:<id>`) or the shared one. */
const isMainPrefs = (key: string) => key === MAIN_PREFS || (key.startsWith(`${MAIN_PREFS}:`) && key !== LAST_USER);

/** An entry a code may carry: Pebble's own, and not a cache. */
const restorable = (key: unknown, value: unknown): key is string =>
  typeof key === 'string' && typeof value === 'string' && key.startsWith('pebble') && !denied(key);

// URL-safe base64 without padding: only letters, digits, - and _, so no app
// the code passes through (Notes, Messages, mail) turns part of it into a
// link or reformats it.
function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Accepts both alphabets, with or without padding. */
function fromBase64(code: string): string {
  let standard = code.replace(/-/g, '+').replace(/_/g, '/');
  while (standard.length % 4) standard += '=';
  const binary = atob(standard);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

/** The signed-in user on this device, or null before anyone signed in. */
export function currentUserId(storage: StorageLike): string | null {
  try { return storage.getItem(LAST_USER) || null; } catch { return null; }
}

/**
 * Builds the code. Returns null when there is nothing to back up (no saved
 * preferences at all), so the UI can say so instead of copying an empty code.
 */
export function createSettingsBackup(storage: StorageLike, userId: string | null, now = new Date()): string | null {
  const items: Record<string, string> = {};
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key || !key.startsWith('pebble') || denied(key)) continue;
    // Main preferences: only this user's own entry (or, before anyone signed
    // in, the shared one). Another person's entry on this device stays here.
    if (isMainPrefs(key)) {
      const mine = userId ? key === `${MAIN_PREFS}:${userId}` : key === MAIN_PREFS;
      if (!mine) continue;
    }
    const value = storage.getItem(key);
    if (value === null) continue;
    const portable = userId && key.includes(userId) ? key.split(userId).join(USER) : key;
    items[isMainPrefs(key) ? `${MAIN_PREFS}:${USER}` : portable] = value;
  }
  if (!items[`${MAIN_PREFS}:${USER}`]) return null;
  const body: BackupBody = { v: 1, at: now.toISOString(), items };
  return BACKUP_PREFIX + toBase64(JSON.stringify(body));
}

export type RestoreResult =
  | { ok: true; count: number; savedAt: string }
  | { ok: false; reason: 'empty' | 'notCode' | 'damaged' | 'noUser' };

export type ReadResult =
  | { ok: true; body: BackupBody }
  | { ok: false; reason: 'empty' | 'notCode' | 'damaged' };

/**
 * Reads a pasted code without writing anything. Forgiving about everything a
 * trip through the clipboard, Notes or a chat can do to it - text around it,
 * line breaks, spaces, invisible characters, quotes, a lower-cased prefix -
 * and strict only about what restoring needs: a readable body with this
 * user's preferences in the shape the app's store writes. Entries that are
 * not Pebble's own, or are caches, are skipped rather than failing the code.
 */
export function readSettingsBackup(input: string): ReadResult {
  if (!input.trim()) return { ok: false, reason: 'empty' };
  const at = input.toUpperCase().indexOf(BACKUP_PREFIX);
  if (at < 0) return { ok: false, reason: 'notCode' };
  // After the prefix, a code may have been wrapped onto several lines or had
  // invisible characters slipped in, and may be followed by other words. Join
  // the pieces between line breaks/spaces/invisibles; if that does not
  // decode, drop trailing pieces one at a time (a "Thanks" after the code).
  // In each try, punctuation (a closing quote, a full stop) ends the code.
  const pieces = input.slice(at + BACKUP_PREFIX.length).split(/[\s\u00AD\u200B-\u200F\u2060\uFEFF]+/);
  let parsed: unknown = null;
  // At most a few trailing pieces: each try decodes the whole code, and a
  // long damaged paste must fail fast rather than freeze the page.
  for (let n = pieces.length; n > Math.max(0, pieces.length - 8) && parsed === null; n--) {
    const payload = (/^[A-Za-z0-9+/_=-]*/.exec(pieces.slice(0, n).join(''))?.[0] ?? '').replace(/=+$/, '');
    if (!payload) continue;
    try { parsed = JSON.parse(fromBase64(payload)); } catch { parsed = null; }
  }
  if (!parsed || typeof parsed !== 'object') return { ok: false, reason: 'damaged' };
  const { v, at: savedAt, items } = parsed as Partial<BackupBody>;
  if (v !== 1 || !items || typeof items !== 'object' || Array.isArray(items)) return { ok: false, reason: 'damaged' };
  const kept: Record<string, string> = {};
  let count = 0;
  for (const [key, value] of Object.entries(items)) {
    if (!restorable(key, value) || ++count > MAX_ITEMS) continue;
    kept[key] = value;
  }
  // The preferences entry must be what the app's store writes, or restoring
  // it would only be thrown away (or worse, half-applied) on the next load.
  const main = kept[`${MAIN_PREFS}:${USER}`];
  if (typeof main !== 'string') return { ok: false, reason: 'damaged' };
  try {
    const prefs = JSON.parse(main) as { state?: unknown };
    if (!prefs || typeof prefs.state !== 'object' || prefs.state === null) return { ok: false, reason: 'damaged' };
  } catch { return { ok: false, reason: 'damaged' }; }
  return { ok: true, body: { v: 1, at: typeof savedAt === 'string' ? savedAt : '', items: kept } };
}

/**
 * Writes a pasted code into this device's storage for the signed-in user.
 * Entries the code does not mention are left as they are. The caller reloads
 * the page afterwards so every part of the app starts from the restored
 * values (the pre-paint script, the store, the per-page choices).
 */
export function restoreSettingsBackup(storage: StorageLike, userId: string | null, input: string): RestoreResult {
  const read = readSettingsBackup(input);
  if (!read.ok) return read;
  if (!userId) return { ok: false, reason: 'noUser' };
  let count = 0;
  for (const [key, value] of Object.entries(read.body.items)) {
    storage.setItem(key.split(USER).join(userId), value);
    count++;
  }
  return { ok: true, count, savedAt: read.body.at };
}
