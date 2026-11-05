/** Local title matching only. Notes, categories and financial data are never
 * sent to a logo service or changed by recognition. More-specific merchants
 * precede their parent brands (Whole Foods before Amazon).
 */
const BRANDS = [
  ['whole-foods-market', ['whole foods', 'wholefoods', 'wholefds', '全食超市']],
  ['costco', ['costco', '好市多', '开市客']],
  ['amazon', ['amazon', 'amzn', '亚马逊']],
  ['starbucks', ['starbucks', '星巴克']],
  ['walmart', ['walmart', 'wal mart', '沃尔玛']],
  ['target', ['target']],
  ['kroger', ['kroger']],
  ['aldi-sud', ['aldi']],
  ['mcdonalds', ['mcdonalds', '麦当劳']],
  ['burger-king', ['burger king', '汉堡王']],
  ['taco-bell', ['taco bell']],
  ['subway', ['subway']],
  ['doordash', ['doordash', 'door dash']],
  ['instacart', ['instacart']],
  ['uber', ['uber', 'uber eats', 'ubereats']],
  ['lyft', ['lyft']],
  ['netflix', ['netflix']],
  ['spotify', ['spotify']],
  ['hulu', ['hulu']],
  ['claude', ['claude', 'anthropic']],
  ['apple', ['apple', 'itunes']],
  ['youtube', ['youtube', 'you tube']],
  ['ikea', ['ikea', '宜家']],
  ['home-depot', ['home depot', 'the home depot']],
  ['best-buy', ['best buy', 'bestbuy']],
  ['walgreens', ['walgreens']],
  ['cvs', ['cvs', 'cvs pharmacy']],
] as const;

export type TransactionBrand = (typeof BRANDS)[number][0];

function normalize(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/['’]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/** Match supported names wherever their text appears in the visible title. */
export function detectTransactionBrand(description: string): TransactionBrand | null {
  const title = normalize(description.split(/\r?\n/, 1)[0]);
  for (const [brand, aliases] of BRANDS) {
    if (aliases.some(alias => title.includes(alias))) return brand;
  }
  return null;
}
