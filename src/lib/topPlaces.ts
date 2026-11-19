import { placeKey } from './recurring/placeKey';

export type TopPlacesRange = 'month' | 'quarter';

interface PlaceCharge {
  id: string;
  date: string;
  amount: number;
  title: string;
  category: string;
}

export interface RankedPlace {
  key: string;
  name: string | null;
  category: string;
  total: number;
  count: number;
  itemIds: string[];
}

export interface TopPlacesSummary {
  total: number;
  places: RankedPlace[];
}

export function rankTopPlaces(charges: readonly PlaceCharge[], today: string, range: TopPlacesRange): TopPlacesSummary {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7)) - 1;
  const day = Number(today.slice(8, 10));
  const startDate = range === 'month' ? new Date(year, month, 1) : new Date(year, month - 3, day);
  const start = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`;

  const groups = new Map<string, {
    total: number; names: Map<string, number>; cats: Map<string, number>; itemIds: string[];
  }>();
  let total = 0;
  for (const charge of charges) {
    if (charge.amount >= 0 || charge.date < start || charge.date > today) continue;
    const title = charge.title.trim();
    const key = placeKey(title);
    if (!key) continue;
    const amount = Math.abs(charge.amount);
    total += amount;
    const group = groups.get(key) ?? { total: 0, names: new Map(), cats: new Map(), itemIds: [] as string[] };
    group.total += amount;
    group.names.set(title, (group.names.get(title) ?? 0) + 1);
    group.cats.set(charge.category, (group.cats.get(charge.category) ?? 0) + 1);
    group.itemIds.push(charge.id);
    groups.set(key, group);
  }

  const mostCommon = (entries: Map<string, number>) => [...entries].sort((a, b) => b[1] - a[1])[0][0];
  const places = [...groups]
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 5)
    .map(([key, group]) => ({
      key, name: mostCommon(group.names), category: mostCommon(group.cats),
      total: group.total, count: group.itemIds.length, itemIds: group.itemIds,
    }));
  return { total, places };
}

/** Preserve the owner's rankings. Drop the raw merchant key everywhere and
 * withhold the identity and item association when a place spans categories
 * the viewer can't see. The rank and authorized financial figures remain. */
export function shareTopPlaces(
  summary: TopPlacesSummary,
  censoredTransactions: ReadonlySet<string>,
  redact: (title: string) => string,
): TopPlacesSummary {
  return {
    total: summary.total,
    places: summary.places.map((place, rank) => {
      const censored = place.itemIds.some(id => censoredTransactions.has(id));
      const mixed = censored && place.itemIds.some(id => !censoredTransactions.has(id));
      return {
        ...place, key: `place-${rank}`, name: censored ? null : redact(place.name ?? ''),
        category: censored ? '' : place.category, itemIds: mixed ? [] : place.itemIds,
      };
    }),
  };
}
