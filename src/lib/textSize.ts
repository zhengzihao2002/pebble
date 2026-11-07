export const MIN_TEXT_SIZE = 100;
export const MAX_TEXT_SIZE = 150;

/** Shared by controls, persisted preferences and the first-paint script. */
export function normalizeTextSize(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(MAX_TEXT_SIZE, Math.max(MIN_TEXT_SIZE, value))
    : MIN_TEXT_SIZE;
}
