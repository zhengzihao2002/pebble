/**
 * Same place, however the bank wrote it: case, spacing and a trailing store
 * number ignored.
 *
 * Lives here (not in components/insights/shared.ts, which re-exports it) so
 * the Dashboard's recurring detector and Insights' subscription note group
 * charges by exactly the same key. The key is also part of persisted ids
 * (`sub:${key}`, `rec:${kind}:${key}`), so changing this function would bring
 * back every note a person had dismissed.
 */
export const placeKey = (title: string) => title.toLowerCase().replace(/\s*#?\d{2,}\s*$/, '').replace(/\s+/g, ' ').trim();
