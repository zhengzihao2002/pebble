export const PROFILE_COLORS = ['gold', 'theme', 'sky', 'sage', 'rose', 'violet'] as const;
export type ProfileColor = (typeof PROFILE_COLORS)[number];

export function normalizeProfileColor(value: unknown): ProfileColor {
  return PROFILE_COLORS.find(color => color === value) ?? 'gold';
}
