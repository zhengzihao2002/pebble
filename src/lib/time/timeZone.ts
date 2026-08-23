/**
 * Timezone plumbing shared by both sides of the RSC boundary.
 *
 * Deliberately NOT server-only: the browser writes the cookie this module
 * names, and the server reads it. Both need the same name and the same
 * validation, and duplicating either is how they drift apart.
 */

export const TIME_ZONE_COOKIE = 'pebble-tz';

/**
 * Used only when a zone genuinely cannot be determined. UTC is chosen because
 * it is obviously neutral rather than plausibly right - a wrong-but-plausible
 * default is harder to notice than an obviously generic one.
 */
export const FALLBACK_TIME_ZONE = 'UTC';

/**
 * True for a real IANA zone name.
 *
 * The value arrives from a cookie, which is user-editable, so it is never fed
 * to Intl unchecked. Constructing a formatter is the validation: Intl throws a
 * RangeError on anything that is not a zone it knows, which covers both typos
 * and deliberately malformed input.
 */
export function isValidTimeZone(value: string): boolean {
  if (!value || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * The browser's own zone. Client-side only - on the server this resolves to
 * the container's zone, which is UTC on Vercel and the exact bug being fixed.
 */
export function resolveBrowserTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return zone && isValidTimeZone(zone) ? zone : FALLBACK_TIME_ZONE;
  } catch {
    return FALLBACK_TIME_ZONE;
  }
}
