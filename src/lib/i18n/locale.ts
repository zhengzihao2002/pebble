/**
 * Locale plumbing shared by both sides of the RSC boundary.
 *
 * Deliberately NOT server-only, and deliberately separate from the
 * dictionaries: the browser writes the cookie this module names and the
 * server reads it, so both need the same name and the same validation.
 * Duplicating either is how they drift apart. Modelled directly on
 * src/lib/time/timeZone.ts, which solved this exact problem for timezone.
 *
 * Importing this file must never pull a dictionary in - the pre-paint script
 * path and the cookie resolver both want the constants without the strings.
 */

export const LOCALES = ['en', 'zh'] as const;

export type Locale = (typeof LOCALES)[number];

/**
 * English, always. Chosen as the static value every server render and every
 * FIRST client render uses, so the two cannot disagree (see useTranslation).
 */
export const DEFAULT_LOCALE: Locale = 'en';

/**
 * NOT __Secure- prefixed, deliberately: that prefix is exactly what makes the
 * Neon Auth cookies fail on http://localhost in Safari. A display language is
 * not a credential - forging it only changes what the forger sees - and the
 * server validates the value before using it.
 */
export const LOCALE_COOKIE = 'pebble-lang';

/** The value arrives from a cookie and from localStorage, both user-editable. */
export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** For the <html lang> attribute. Drives CJK line-breaking and glyph choice. */
export const HTML_LANG: Record<Locale, string> = { en: 'en', zh: 'zh-CN' };

/**
 * For toLocaleDateString / toLocaleString.
 *
 * ⚠️ NOT for formatCurrency(). These are the user's real US dollars; the
 * currency formatter stays pinned to 'en-US' in every locale.
 */
export const INTL_LOCALE: Record<Locale, string> = { en: 'en-US', zh: 'zh-CN' };
