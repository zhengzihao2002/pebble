/**
 * Storage keys shared between the Zustand persist store and the pre-paint
 * theme script in src/app/layout.tsx.
 *
 * Deliberately its own module with NO imports. layout.tsx is a Server
 * Component and must not pull zustand into the root layout just to learn a
 * string, and the store must not import from layout.
 *
 * WHY THIS EXISTS. The pre-paint script reads localStorage directly to avoid a
 * dark-mode flash on every load. It previously hardcoded both values, so
 * changing the store's key or renaming the field silently brought the flash
 * back - no error, no failing test, just a visible regression nobody would
 * connect to the change that caused it. Importing one constant on both sides
 * makes a rename propagate instead.
 *
 * STILL COUPLED, unavoidably: the script also knows zustand-persist's
 * {state:{...}} envelope. That shape is the library's, not ours, so it cannot
 * be derived from anything we control. If the persist middleware's format ever
 * changes, the script must change with it.
 */

/** Zustand persist store name. Deliberately not the pre-migration key. */
export const PEBBLE_UI_STORAGE_KEY = 'pebble-ui';

/**
 * Per-user entries are `pebble-ui:<userId>`. This pointer names the most
 * recent user on the device, so the pre-paint script and the signed-out pages
 * - which run before anyone is known - use that user's look.
 */
export const LAST_USER_KEY = 'pebble-ui:last-user';

export function userStorageKey(userId: string): string {
  return `${PEBBLE_UI_STORAGE_KEY}:${userId}`;
}

/**
 * Field the pre-paint script reads: 'light' | 'dark' | 'system'. Must stay in
 * partialize(). (The script also understands the pre-v2 'darkMode' boolean,
 * so the first load after upgrading does not flash.)
 */
export const APPEARANCE_FIELD = 'appearance';

/**
 * Field the pre-paint script reads to set <html lang> before first paint.
 * Must stay in partialize(), same as APPEARANCE_FIELD.
 */
export const LOCALE_FIELD = 'locale';

/**
 * Field the pre-paint script reads to set the font attribute on <html> before
 * first paint. Must stay in partialize(), same as APPEARANCE_FIELD.
 */
export const FONT_FIELD = 'fontChoice';

/** Field the pre-paint script reads for the Chinese face. Must stay in partialize(). */
export const CJK_FONT_FIELD = 'cjkFontChoice';

/** Field the pre-paint script reads for the colour theme. Must stay in partialize(). */
export const THEME_FIELD = 'themeChoice';

/** Field the pre-paint script reads to size the page before first paint. */
export const TEXT_SIZE_FIELD = 'textSize';

/** Field the pre-paint script reads: false means no welcome animation. */
export const SHOW_WELCOME_FIELD = 'showWelcome';

/**
 * sessionStorage flag set by the auth pages (WelcomeArm): the next app page
 * plays the welcome animation once, then clears it.
 */
export const WELCOME_PENDING_KEY = 'pebble-welcome-pending';

/**
 * Pre-migration store key. Held transactions and balances before the database
 * existed; never read. AppShell deletes it on load.
 */
export const LEGACY_STORAGE_KEY = 'pebble-storage';
