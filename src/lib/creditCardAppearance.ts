/** Presentation only: colors follow the largest outstanding spending categories. */
export function creditCardAppearance(name: string, owed: number, charges: { category: string; amount: number }[]) {
  const apple = /apple/i.test(name) && /card/i.test(name);
  const spending = apple && owed > 0.004;
  const totals = new Map<string, number>();
  for (const charge of charges) {
    totals.set(charge.category, (totals.get(charge.category) ?? 0) + Math.abs(charge.amount));
  }
  const palette = ['#ffc35a', '#ed9bd0', '#b6a0f1', '#9ed9bf', '#91ccef', '#ffa482'];
  const categories = [...totals].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const colors = categories.slice(0, 3).map(([category]) => {
    let hash = 0;
    for (const char of category) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    return palette[hash % palette.length];
  });
  return { apple, spending, colors: [colors[0] ?? palette[0], colors[1] ?? palette[1], colors[2] ?? palette[2]] };
}
