export const CURSOR_SIZES = [24, 32, 40, 48] as const;
export function normalizeCursorSize(value: unknown): number {
  return typeof value === 'number' && (CURSOR_SIZES as readonly number[]).includes(value) ? value : 32;
}
