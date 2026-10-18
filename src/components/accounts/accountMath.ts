/**
 * Pure helpers for the Accounts page: the range, the daily walk, the period's
 * wording and the per-day money flow. No hooks and no clock reads - every
 * date comes from the caller's zone-aware `today`.
 */
import type { Account } from '@/lib/data/mappers';
import type { BalanceAdjustment, ExpenseTransaction, IncomeTransaction } from '@/types';
import type { Dictionary } from '@/lib/i18n';

export type Range = '1m' | '3m' | '6m' | '1y' | 'all';
export const RANGES: Range[] = ['1m', '3m', '6m', '1y', 'all'];
export const MONTHS: Record<Exclude<Range, 'all'>, number> = { '1m': 1, '3m': 3, '6m': 6, '1y': 12 };
export const isRange = (v: unknown): v is Range => typeof v === 'string' && (RANGES as string[]).includes(v);

const pad = (n: number) => String(n).padStart(2, '0');
export const ymdOf = (dt: Date) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
export const dateOf = (ymd: string) => new Date(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)));
export const addDaysYmd = (ymd: string, n: number) => {
  const d = dateOf(ymd);
  return ymdOf(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
};
export const round2 = (v: number) => Math.round(v * 100) / 100;

export interface DayPoint {
  date: string;
  total: number;
  /** Every account's balance at the end of this day, keyed by id. */
  byAccount: Record<string, number>;
}

export interface ChronoPoint {
  date: string;
  total: number;
  byAccount: Record<string, number>;
}

/**
 * The first day of the range. 'All' starts on the first recorded day (and
 * always at least a day before today, so the chart has a line to draw).
 */
export function rangeStart(range: Range, today: string, chrono: ChronoPoint[]): string {
  if (range === 'all') {
    const first = chrono.find((c) => c.date)?.date;
    const floor = addDaysYmd(today, -1);
    return first && first < floor ? first : floor;
  }
  const t = dateOf(today);
  return ymdOf(new Date(t.getFullYear(), t.getMonth() - MONTHS[range], t.getDate()));
}

/**
 * One point per day: the balance at the end of that day, carried forward on
 * days with no records. The first point is the true balance on the first day.
 */
export function buildDays(chrono: ChronoPoint[], today: string, start: string): DayPoint[] {
  const out: DayPoint[] = [];
  let i = 0;
  let cur: { total: number; byAccount: Record<string, number> } = { total: 0, byAccount: {} };
  for (let dt = dateOf(start); ymdOf(dt) <= today; dt = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + 1)) {
    const k = ymdOf(dt);
    while (i < chrono.length && chrono[i].date <= k) { cur = chrono[i]; i++; }
    out.push({ date: k, total: round2(cur.total), byAccount: cur.byAccount });
  }
  return out;
}

/** Change from a to b, with the percent of |a| (null when a is 0), true minus sign. */
export function changeBetween(a: number, b: number): { change: number; pct: string | null } {
  const change = round2(b - a);
  const pct = a !== 0 ? `${change >= 0 ? '+' : '−'}${Math.abs((change / Math.abs(a)) * 100).toFixed(1)}%` : null;
  return { change, pct };
}

/**
 * The words for the chosen range. Fixed ranges keep the page's existing
 * sentences ("over the last 6 months"); 'All' says "since {date}".
 */
export interface PeriodWords {
  /** "6 months" - for templates that take {period}. Empty for 'All'. */
  period: string;
  isSince: boolean;
  startLabel: string;
  sentence: (change: number, pct: string | null, amountText: string) => string;
  chartLabel: string;
  cardsPeriod: string;
  changeOver: string;
  sparkLabel: (name: string) => string;
}

export function periodWords(
  d: Dictionary, t: (s: string, v: Record<string, string | number>) => string,
  range: Range, startLabel: string,
): PeriodWords {
  const a = d.accountsPage;
  const x = d.ux.accounts;
  if (range === 'all') {
    const date = startLabel;
    return {
      period: '', isSince: true, startLabel,
      sentence: (change, pct, amount) => change === 0 ? t(x.flatSince, { date })
        : change > 0 ? (pct ? t(x.upSince, { amount, pct, date }) : t(x.upSinceNoPct, { amount, date }))
        : (pct ? t(x.downSince, { amount, pct, date }) : t(x.downSinceNoPct, { amount, date })),
      chartLabel: t(x.chartLabelSince, { date }),
      cardsPeriod: t(x.cardsPeriodSince, { date }),
      changeOver: t(x.changeSince, { date }),
      sparkLabel: (name) => t(x.sparkLabelSince, { name, date }),
    };
  }
  const period = range === '1m' ? x.period1m : range === '3m' ? a.period3m : range === '6m' ? a.period6m : a.period1y;
  return {
    period, isSince: false, startLabel,
    sentence: (change, pct, amount) => change === 0 ? t(a.flat, { period })
      : change > 0 ? (pct ? t(a.up, { amount, pct, period }) : t(a.upNoPct, { amount, period }))
      : (pct ? t(a.down, { amount, pct, period }) : t(a.downNoPct, { amount, period })),
    chartLabel: t(a.chartLabel, { period }),
    cardsPeriod: t(a.cardsPeriod, { period }),
    changeOver: t(a.changeOver, { period }),
    sparkLabel: (name) => t(a.sparkLabel, { name, period }),
  };
}

/** "Chase Checking ····4412" - names are USER DATA, never translated. */
export const accountLabel = (a: Pick<Account, 'name' | 'last4'>) => (a.last4 ? `${a.name} ····${a.last4}` : a.name);

/** Accounts the page shows, in the cards' order: bank/cash first, then cards; larger balances first. */
export function shownAccounts(accounts: Account[], last: Record<string, number>) {
  return accounts
    .filter((a) => a.status === 'active' || a.status === 'hibernated')
    .map((a) => ({ a, now: round2(last[a.id] ?? 0) }))
    .sort((x, y) => (x.a.kind === 'credit' ? 1 : 0) - (y.a.kind === 'credit' ? 1 : 0) || y.now - x.now);
}

export interface DayFlow { in: number; out: number; count: number }

/**
 * Money in and out per day across all accounts: income and spending only.
 * Transfers and corrections are left out - they are neither earning nor
 * spending, and a transfer pair nets to zero anyway.
 */
export function flowByDay(expenses: ExpenseTransaction[], income: IncomeTransaction[], from: string, to: string) {
  const map = new Map<string, DayFlow>();
  const add = (date: string, key: 'in' | 'out', v: number) => {
    if (date < from || date > to) return;
    const cur = map.get(date) ?? { in: 0, out: 0, count: 0 };
    cur[key] = round2(cur[key] + v);
    cur.count += 1;
    map.set(date, cur);
  };
  for (const e of expenses) add(e.date, 'out', Math.abs(e.amount));
  for (const i of income) add(i.date, 'in', Math.abs(i.amount));
  return map;
}

/** One account's records, newest first, labelled for the detail sheet. */
export type AccountRecord =
  | { kind: 'expense'; id: string; date: string; amount: number; description: string; category: string }
  | { kind: 'income'; id: string; date: string; amount: number; description: string; category: string }
  | { kind: 'transfer'; id: string; date: string; amount: number; description: string; otherAccountId: string | null }
  | { kind: 'correction'; id: string; date: string; amount: number; description: string };

export function recordsFor(
  accountId: string, expenses: ExpenseTransaction[], income: IncomeTransaction[], adjustments: BalanceAdjustment[],
): AccountRecord[] {
  const out: AccountRecord[] = [];
  for (const e of expenses) if (e.accountId === accountId) out.push({ kind: 'expense', id: e.id, date: e.date, amount: e.amount, description: e.description, category: e.category });
  for (const i of income) if (i.accountId === accountId) out.push({ kind: 'income', id: i.id, date: i.date, amount: i.amount, description: i.description, category: i.category });
  const groups = new Map<string, BalanceAdjustment[]>();
  for (const r of adjustments) {
    if (!r.transferGroupId) continue;
    const l = groups.get(r.transferGroupId) ?? [];
    l.push(r);
    groups.set(r.transferGroupId, l);
  }
  for (const r of adjustments) {
    if (r.accountId !== accountId) continue;
    if (r.transferGroupId) {
      const other = (groups.get(r.transferGroupId) ?? []).find((x) => x.id !== r.id);
      out.push({ kind: 'transfer', id: r.id, date: r.date, amount: r.amount, description: r.description, otherAccountId: other?.accountId ?? null });
    } else {
      out.push({ kind: 'correction', id: r.id, date: r.date, amount: r.amount, description: r.description });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id.localeCompare(a.id)));
}
