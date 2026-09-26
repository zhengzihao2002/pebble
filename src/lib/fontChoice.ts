/**
 * Font choices for Settings > Appearance.
 *
 * Deliberately its own module with NO imports, like storageKeys.ts: the root
 * layout (a Server Component) embeds these lists in the pre-paint script and
 * must not pull the store in just to learn them.
 *
 * Two independent choices, both always applied - font fallback is per glyph,
 * so the Latin face renders Latin letters and digits and the Chinese face
 * renders Chinese characters. Settings shows only the picker for the current
 * interface language.
 *
 * The VALUES are persisted in localStorage and matched by CSS
 * (html[data-pebble-font] / html[data-pebble-cjk] in globals.css), so once
 * shipped they are effectively permanent. Labels live in the dictionary,
 * indexed by value.
 */
export const FONT_CHOICES = ['default', 'system', 'rounded', 'serif', 'legible'] as const;

export type FontChoice = (typeof FONT_CHOICES)[number];

/** Validates a stored value: localStorage can hold anything, from any build. */
export function isFontChoice(value: unknown): value is FontChoice {
  return typeof value === 'string' && (FONT_CHOICES as readonly string[]).includes(value);
}

/** The attribute on <html> that globals.css keys on. Absent means default. */
export const FONT_ATTRIBUTE = 'data-pebble-font';

/** Chinese face. 'sans' is the default - see the note where --cjk is defined. */
export const CJK_FONT_CHOICES = ['sans', 'serif', 'kai'] as const;

export type CjkFontChoice = (typeof CJK_FONT_CHOICES)[number];

export function isCjkFontChoice(value: unknown): value is CjkFontChoice {
  return typeof value === 'string' && (CJK_FONT_CHOICES as readonly string[]).includes(value);
}

/** The attribute on <html> for the Chinese face. Absent means sans. */
export const CJK_FONT_ATTRIBUTE = 'data-pebble-cjk';
