/**
 * Colour theme choices for Settings > Appearance.
 *
 * Deliberately its own module with NO imports, like fontChoice.ts: the root
 * layout (a Server Component) embeds this list in the pre-paint script.
 *
 * The VALUES are persisted in localStorage and matched by CSS
 * (html[data-pebble-theme="..."] in globals.css), so once shipped they are
 * effectively permanent. Labels live in the dictionary, indexed by value.
 * Independent of dark mode: every theme has a light and a dark palette.
 */
export const THEME_CHOICES = ['original', 'ocean', 'sakura', 'slate', 'sand'] as const;

export type ThemeChoice = (typeof THEME_CHOICES)[number];

/** Validates a stored value: localStorage can hold anything, from any build. */
export function isThemeChoice(value: unknown): value is ThemeChoice {
  return typeof value === 'string' && (THEME_CHOICES as readonly string[]).includes(value);
}

/** The attribute on <html> that globals.css keys on. Absent means original. */
export const THEME_ATTRIBUTE = 'data-pebble-theme';
