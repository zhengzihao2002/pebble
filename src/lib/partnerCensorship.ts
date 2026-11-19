export const MAX_CENSORED_WORDS = 100;
export const MAX_CENSORED_WORD_LENGTH = 100;

/** Words and phrases are literal and case-insensitive across languages. */
export function normalizeCensoredWords(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_CENSORED_WORDS) return null;
  const unique = new Map<string, string>();
  for (const item of value) {
    if (typeof item !== 'string' || item.length > MAX_CENSORED_WORD_LENGTH || /[\0\r\n]/.test(item)) return null;
    const word = item.trim();
    if (word && !unique.has(word.toLowerCase())) unique.set(word.toLowerCase(), word);
  }
  return [...unique.values()];
}

export function publicPartnerPermissions<T extends string>(stored: unknown, keys: readonly T[]): Partial<Record<T, boolean>> {
  if (!stored || typeof stored !== 'object') return {};
  const values = stored as Record<string, unknown>;
  return Object.fromEntries(keys.filter(key => typeof values[key] === 'boolean').map(key => [key, values[key]])) as Partial<Record<T, boolean>>;
}

export function redactPartnerText(words: readonly string[]) {
  if (!words.length) return (text: string) => text;
  const terms = [...words].sort((a, b) => b.length - a.length)
    .map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(terms.join('|'), 'giu');
  return (text: string) => text.replace(pattern, '***');
}

// A redaction marker is display-only. It must not become a way to locate
// masked records through text, category, or amount searches.
export function allowsPartnerSearch(query: string) {
  return !query.includes('*');
}
