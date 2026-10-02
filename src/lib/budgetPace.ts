/** Share of the calendar year elapsed on `today` ('YYYY-MM-DD'), counting today. */
export function yearFraction(today: string): number {
  const [y, m, d] = today.split('-').map(Number);
  const start = Date.UTC(y, 0, 1);
  const day = (Date.UTC(y, m - 1, d) - start) / 86_400_000 + 1;
  const days = (Date.UTC(y + 1, 0, 1) - start) / 86_400_000;
  return day / days;
}

/** Within this share of a budget, spending counts as on pace. */
export const PACE_TOLERANCE = 0.03;
