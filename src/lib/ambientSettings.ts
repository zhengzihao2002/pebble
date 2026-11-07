export const AMBIENT_ROUTES = ['default', 'orbit', 'weave', 'sweep'] as const;
export type AmbientRoute = typeof AMBIENT_ROUTES[number];
export const AMBIENT_MAX_BALLS = 6;

export interface AmbientSettings {
  route: AmbientRoute;
  /** 0 is clear; 50 preserves the original soft Gaussian appearance. */
  frost: number;
  speed: number;
  count: number;
  /** null follows the theme and its colour cycle; a custom hex stays fixed. */
  colours: (string | null)[];
}

export const DEFAULT_AMBIENT_SETTINGS: AmbientSettings = {
  route: 'default', frost: 50, speed: 1, count: 3,
  colours: Array.from({ length: AMBIENT_MAX_BALLS }, () => null),
};

const numberIn = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;

/** Treat saved preferences as untrusted; always return a fresh complete object. */
export function normalizeAmbientSettings(value: unknown): AmbientSettings {
  const source = value && typeof value === 'object' ? value as Partial<AmbientSettings> : {};
  return {
    route: AMBIENT_ROUTES.includes(source.route as AmbientRoute) ? source.route as AmbientRoute : 'default',
    frost: numberIn(source.frost, 50, 0, 100),
    speed: numberIn(source.speed, 1, .25, 3),
    count: Math.round(numberIn(source.count, 3, 1, AMBIENT_MAX_BALLS)),
    colours: Array.from({ length: AMBIENT_MAX_BALLS }, (_, i) => {
      const colour = Array.isArray(source.colours) ? source.colours[i] : null;
      return typeof colour === 'string' && /^#[0-9a-f]{6}$/i.test(colour) ? colour.toLowerCase() : null;
    }),
  };
}
