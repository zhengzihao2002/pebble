export const CURSOR_SIZES = [24, 32, 48] as const;
export function normalizeCursorSize(value: unknown): number {
  // Migrate the retired slider's intermediate size to the Large preset.
  if (value === 40) return 48;
  return typeof value === 'number' && (CURSOR_SIZES as readonly number[]).includes(value) ? value : 32;
}
