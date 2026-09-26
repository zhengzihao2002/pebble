/**
 * Health status bar maths (Dashboard). Pure and dependency-free.
 *
 * Colour is a HUE on the OKLCH wheel, not an RGB blend: red to green in RGB
 * passes through muddy brown, while walking the hue passes through orange,
 * yellow and the yellow-greens. OKLCH also holds perceived lightness steady,
 * so the yellow middle does not glare brighter than either end.
 *
 * Anchors: 0% or below = red, 25% = yellow, 50% or above = green, linear in
 * between. Continuous, so no change in rate ever produces a jump; everything
 * from 50% up is the same green.
 */
export const HEALTH_HUE_RED = 25;
export const HEALTH_HUE_YELLOW = 100;
export const HEALTH_HUE_GREEN = 150;

export function healthHue(savingsRate: number): number {
  if (!Number.isFinite(savingsRate) || savingsRate <= 0) return HEALTH_HUE_RED;
  if (savingsRate >= 50) return HEALTH_HUE_GREEN;
  if (savingsRate <= 25) {
    return HEALTH_HUE_RED + (savingsRate / 25) * (HEALTH_HUE_YELLOW - HEALTH_HUE_RED);
  }
  return HEALTH_HUE_YELLOW + ((savingsRate - 25) / 25) * (HEALTH_HUE_GREEN - HEALTH_HUE_YELLOW);
}

/**
 * HP: the savings rate held to 0-100 and floored, matching how stats.ts
 * floors the rate itself - HP can never read higher than the card beside it.
 */
export function healthPoints(savingsRate: number): number {
  if (!Number.isFinite(savingsRate)) return 0;
  return Math.floor(Math.min(100, Math.max(0, savingsRate)));
}
