/**
 * Axis labels for money, kept short so a fixed-width axis can hold them.
 * Display only: a true minus sign (U+2212) for negatives, trailing ".0"
 * dropped. Never used for stored values.
 */
export function formatCompactCurrency(n: number): string {
  if (!Number.isFinite(n)) return '';
  const sign = n < 0 ? '\u2212' : '';
  const abs = Math.abs(n);
  const trim = (x: number) => String(Math.round(x * 10) / 10).replace(/\.0$/, '');
  if (abs >= 1_000_000) return `${sign}$${trim(abs / 1_000_000)}M`;
  if (abs >= 1_000) return `${sign}$${trim(abs / 1_000)}k`;
  return `${sign}$${Math.round(abs)}`;
}
