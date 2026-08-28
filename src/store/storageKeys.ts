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

/** Field the pre-paint script reads. Must stay in partialize(). */
export const DARK_MODE_FIELD = 'darkMode';

/**
 * Field the pre-paint script reads to set <html lang> before first paint.
 * Must stay in partialize(), same as DARK_MODE_FIELD.
 */
export const LOCALE_FIELD = 'locale';
