/** Pure calendar-based chart estimates and quick-set amounts. Never reads the clock. */
export interface SpendingHistory {
  months: string[];
  byCat: Record<string, number[]>;
  current: string;
}
const index = (month: string) => Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1;
const monthKey = (i: number) => `${Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}`;
const cents = (value: number) => Math.round(value * 100) / 100;
function completed(history: SpendingHistory, name: string, count: number): (number | null)[] {
  const byMonth = new Map(history.months.map((m, i) => [m, history.byCat[name]?.[i] ?? 0]));
  const end = index(history.current);
  return Array.from({ length: count }, (_, i) => {
    const value = byMonth.get(monthKey(end - count + i));
    return value !== undefined && Number.isFinite(value) ? Math.max(0, value) : null;
  });
}
/** Chart observations stop today; future-dated entries must not masquerade as actuals. */
export function budgetHistoryThroughToday(transactions: readonly {date: string; amount: number; category: string}[], today: string): SpendingHistory {
  const year = Number(today.slice(0,4));
  const current = index(today.slice(0,7));
  const first = (year - 3) * 12;
  const months = Array.from({length: current - first + 1},(_,i)=>monthKey(first+i));
  const byCat: Record<string, number[]> = {};
  for (const entry of transactions) {
    const mi = index(entry.date.slice(0,7)) - first;
    if (entry.date > today || entry.amount >= 0 || mi < 0 || mi >= months.length) continue;
    (byCat[entry.category] ??= Array(months.length).fill(0))[mi] += Math.abs(entry.amount);
  }
  return {months, byCat, current:today.slice(0,7)};
}

/** Matches the main budget page's quick set: six-month average × 12, or actual last 12 months. */
export function budgetQuickSet(history: SpendingHistory | null, name: string) {
  if (!history || !history.byCat[name]?.some(v => v > 0)) return { sixMonthAnnual: null, last12Total: null };
  const six = completed(history, name, 6), twelve = completed(history, name, 12);
  return {
    sixMonthAnnual: six.every(v => v !== null) ? Math.round(six.reduce<number>((s,v)=>s+(v ?? 0),0) / 6 * 12) : null,
    last12Total: twelve.every(v => v !== null) ? Math.round(twelve.reduce<number>((s,v)=>s+(v ?? 0),0)) : null,
  };
}
export interface SpendingProjection {
  averageMonthly: number;
  sampleMonths: number;
  from: string;
  through: string;
  /** Additional amount after today, not a replacement for already-recorded spending. */
  additions: (number | null)[];
  remaining: number;
}
/**
 * Estimate from up to six completed calendar months, requiring at least three
 * months since the category first had spending. Today is counted as complete,
 * matching yearFraction(); December 31 therefore adds exactly zero.
 */
export function projectCategorySpending(history: SpendingHistory, name: string, today: string, shownYear: number): SpendingProjection | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || Number(today.slice(0,4)) !== shownYear || today.slice(0,7) !== history.current) return null;
  const current = index(history.current);
  const series = history.byCat[name];
  if (!series) return null;
  const first = history.months.findIndex((_,i) => Number.isFinite(series[i]) && series[i] > 0);
  if (first < 0) return null;
  const start = Math.max(index(history.months[first]), current - 6);
  const samples = current - start;
  if (samples < 3) return null;
  const values = completed(history, name, samples);
  if (values.some(v => v === null) || values.filter(v => v !== null && v > 0).length < 3) return null;
  const monthly = cents(values.reduce<number>((s,v)=>s+(v ?? 0),0) / samples);
  const mi = Number(today.slice(5,7)) - 1;
  const days = new Date(Date.UTC(shownYear, mi + 1, 0)).getUTCDate();
  const day = Number(today.slice(8,10));
  if (day < 1 || day > days) return null;
  const additions = Array.from({ length: 12 }, (_, i) => i < mi ? null : cents(i === mi ? monthly * (days - day) / days : monthly));
  return { averageMonthly: cents(monthly), sampleMonths: samples, from: monthKey(start), through: monthKey(current - 1), additions, remaining: cents(additions.reduce<number>((s,v)=>s+(v ?? 0),0)) };
}
/** 0 plus four equal, pleasant monetary increments; all chart series fit. */
export function budgetCurrencyAxis(values: (number | null | undefined)[]) {
  const max = Math.max(0, ...values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v)));
  const raw = (max || 4) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const scaled = raw / magnitude;
  const step = Math.max(.01, [1, 2, 2.5, 5, 10].find(v => v >= scaled)! * magnitude);
  const ceiling = step * 4;
  return { ticks: Array.from({length:5},(_,i)=>cents(i*step)), domain: [0,ceiling] as [number,number] };
}
