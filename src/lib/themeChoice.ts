/**
 * Colour theme choices for Settings > Appearance.
 *
 * Deliberately its own module with NO imports, like fontChoice.ts: the root
 * layout (a Server Component) embeds this list in the pre-paint script.
 *
 * The VALUES are persisted in localStorage and matched by CSS
 * (html[data-pebble-theme="..."] in globals.css), so once shipped they are
 * kept stable; retired choices have an explicit alias below. Labels live in
 * the dictionary, indexed by value.
 * Independent of dark mode: every theme has a light and a dark palette.
 */
export const THEME_CHOICES = ['original', 'ocean', 'glacier', 'sakura', 'slate', 'sand', 'lavender', 'lagoon', 'graphite'] as const;

export type ThemeChoice = (typeof THEME_CHOICES)[number];

/** Preserve the closest palette for retired theme preferences. */
export const THEME_ALIASES = { amber: 'sand' } as const;

/** Normalize older browser preferences without exposing retired choices. */
export function resolveThemeChoice(value: unknown): ThemeChoice {
  const mapped = typeof value === 'string' && Object.prototype.hasOwnProperty.call(THEME_ALIASES, value)
    ? THEME_ALIASES[value as keyof typeof THEME_ALIASES] : value;
  return isThemeChoice(mapped) ? mapped : 'original';
}

/** Validates a stored value: localStorage can hold anything, from any build. */
export function isThemeChoice(value: unknown): value is ThemeChoice {
  return typeof value === 'string' && (THEME_CHOICES as readonly string[]).includes(value);
}

/** The attribute on <html> that globals.css keys on. Absent means original. */
export const THEME_ATTRIBUTE = 'data-pebble-theme';
