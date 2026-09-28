/**
 * Light / Dark / System. Deliberately import-free: the root layout (a Server
 * Component) and the pre-paint script's inputs come from here too.
 */
export const APPEARANCE_CHOICES = ['light', 'dark', 'system'] as const;
export type Appearance = (typeof APPEARANCE_CHOICES)[number];

export function isAppearance(value: unknown): value is Appearance {
  return typeof value === 'string' && (APPEARANCE_CHOICES as readonly string[]).includes(value);
}

/** The device's light/dark setting. */
export const DARK_QUERY = '(prefers-color-scheme: dark)';
