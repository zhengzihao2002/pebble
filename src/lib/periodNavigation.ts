/** Dashboard periods are newest first. Clamp queued steps to the available list. */
export function stepPeriodKey(periods: readonly { key: string }[], current: string | null, direction: 1 | -1) {
  if (!periods.length) return current;
  const index = Math.max(0, periods.findIndex(period => period.key === current));
  return periods[Math.max(0, Math.min(periods.length - 1, index + direction))].key;
}
