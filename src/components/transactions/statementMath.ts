/**
 * Pure figures for the Transactions page, derived from the ledger the page
 * already has. Nothing here recomputes a balance: every balance is read from
 * a ledger entry's totalBalanceAfter / balancesAfter, so the statement, the
 * month strip, the chart and the account lens can never disagree with the
 * server's single ledger walk.
 *
 * Every list in here is NEWEST FIRST, like the ledger itself.
 */
import { compareSameDayIds } from '@/lib/stats';
import { transactionDisplayAccountId } from '@/lib/creditCards';
import type { CreditCardPayoff, LedgerRecord } from '@/types';
import type { StatementEntry } from './StatementList';

export function isCardShadow(record: LedgerRecord, accountId: string | null): boolean {
  return accountId !== null && record.type === 'expense' && record.accountId !== accountId
    && record.creditCardPayoff?.cardId === accountId;
}

export interface StatementPayoff extends CreditCardPayoff {
  side: 'card' | 'funding';
  amount: number;
  fundingAccountIds: string[];
}

/** One display marker per payment, scoped to the side of the selected account. */
export function statementPayoffs(entries: StatementEntry[], accountId: string, monthPrefix: string): StatementPayoff[] {
  const payoffs = new Map<string, Omit<StatementPayoff, 'fundingAccountIds'> & { fundingAccountIds: Set<string> }>();
  for (const { record } of entries) {
    if (record.type !== 'expense') continue;
    const payoff = record.creditCardPayoff;
    if (!payoff?.date.startsWith(monthPrefix)) continue;
    const side = payoff.cardId === accountId ? 'card' : record.accountId === accountId ? 'funding' : null;
    if (!side) continue;
    const marker = payoffs.get(payoff.id) ?? { ...payoff, side, amount: 0, fundingAccountIds: new Set<string>() };
    marker.amount += cents(Math.abs(record.amount));
    marker.fundingAccountIds.add(record.accountId);
    payoffs.set(payoff.id, marker);
  }
  return [...payoffs.values()].map(payoff => ({
    ...payoff, amount: payoff.amount / 100, fundingAccountIds: [...payoff.fundingAccountIds],
  }));
}

/** 'YYYY-MM-01' and the first day of the following month, for range checks. */
export function monthBounds(year: number, month: number): { start: string; next: string; prefix: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const nextDate = new Date(year, month + 1, 1);
  return {
    start: `${year}-${pad(month + 1)}-01`,
    next: `${nextDate.getFullYear()}-${pad(nextDate.getMonth() + 1)}-01`,
    prefix: `${year}-${pad(month + 1)}-`,
  };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Which balance a view follows: the total of every account, or one account's
 * own running balance (the account lens).
 */
export function balanceReader(accountId: string | null): (e: StatementEntry) => number {
  return accountId ? (e) => e.balancesAfter[accountId] ?? 0 : (e) => e.totalBalanceAfter;
}

export interface MonthFigures {
  /** Postings that reconcile the month's account balance. */
  entries: StatementEntry[];
  opening: number;
  closing: number;
  deposits: number;
  withdrawals: number;
  adjustments: number;
}

/** Income and spending from real transactions, independent of balance postings. */
export function statementFlows(entries: StatementEntry[]) {
  let deposits = 0;
  let withdrawals = 0;
  let count = 0;
  for (const { record } of entries) {
    if (record.type === 'adjustment') continue;
    if (record.type === 'income') deposits += cents(record.amount);
    else withdrawals -= cents(record.amount);
    count++;
  }
  return { deposits: deposits / 100, withdrawals: withdrawals / 100, count };
}

/**
 * A month's statement figures.
 *
 * All accounts: exactly the original rules. entriesWithRecords is
 * newest-first, so [0] of a filtered slice is always the most recent entry in
 * it - that's the closing balance for the month, and the first entry strictly
 * before monthStart is the closest prior balance (the opening balance), even
 * across a month with zero activity. With no prior entry the month opens at
 * openingTotal, which is always 0 - every account starts at zero by design.
 *
 * Adjustments - manual corrections AND transfers, which are stored as a pair
 * of adjustment rows - get their own figure. Counting them by sign made a
 * correction read as income or spending, and every transfer inflated BOTH
 * deposits and withdrawals. A transfer's two rows share a date and sum to
 * zero, so here they cancel and only corrections remain.
 * closing = opening + deposits - withdrawals + adjustments still holds.
 *
 * One account (lens): the same walk, reading that account's own balance from
 * every entry's balancesAfter (every entry carries every account's balance,
 * so the opening still comes from the closest prior entry of ANY account).
 * Flows are that account's records only; within one account a transfer's two
 * halves no longer cancel, so its adjustments include transfers in and out.
 * The same identity holds.
 */
export function monthFigures(
  all: StatementEntry[], year: number, month: number, openingTotal: number, accountId: string | null = null,
): MonthFigures {
  const { start, next } = monthBounds(year, month);
  const read = balanceReader(accountId);
  const inMonth = all.filter((e) => e.record.date >= start && e.record.date < next);
  const priorEntry = all.find((e) => e.record.date < start);
  const opening = priorEntry ? read(priorEntry) : (accountId ? 0 : openingTotal);
  const closing = inMonth.length > 0 ? read(inMonth[0]) : opening;
  const entries = accountId ? inMonth.filter((e) => e.record.accountId === accountId) : inMonth;
  const { deposits, withdrawals } = statementFlows(entries);
  const adjustments = entries.reduce((s, e) => (e.record.type === 'adjustment' ? s + e.record.amount : s), 0);
  return { entries, opening, closing, deposits, withdrawals, adjustments };
}

export interface MonthSummary {
  year: number;
  month: number;
  deposits: number;
  withdrawals: number;
  /** Income and expense records in the month. */
  count: number;
  closing: number;
}

/**
 * Timeline bars describe the statement's income and spending. The closing
 * figure follows the account balance, including its balance-only postings.
 */
export function summarizeMonths(
  all: StatementEntry[], months: { year: number; month: number }[], openingTotal: number, accountId: string | null = null,
): MonthSummary[] {
  return months.map(({ year, month }) => {
    const f = monthFigures(all, year, month, openingTotal, accountId);
    const { prefix } = monthBounds(year, month);
    const activity = accountId ? all.filter(({ record }) => record.date.startsWith(prefix)
      && transactionDisplayAccountId(record) === accountId) : f.entries;
    return { year, month, ...statementFlows(activity), closing: f.closing };
  });
}

type StatementItem =
  | { kind: 'record'; id: string; entry: StatementEntry }
  | { kind: 'payoff'; id: string; payoff: StatementPayoff };

export interface DayGroup {
  date: string;
  items: StatementItem[];
  /** Money in minus money out, from the purchases and income shown here. */
  net: number;
  hasFlows: boolean;
  /** Balance after the day's newest posting, when the day has one. */
  endBalance: number | null;
}

/** Prepare ledger rows and display-only payoff markers for a day heading. */
export function groupByDay(
  entries: StatementEntry[],
  read: (e: StatementEntry) => number,
  lensAccountId: string | null = null,
  payoffs: StatementPayoff[] = [],
  ghostIds?: ReadonlySet<string>,
): DayGroup[] {
  const groups = new Map<string, DayGroup>();
  const groupFor = (date: string) => {
    let group = groups.get(date);
    if (!group) {
      group = { date, items: [], net: 0, hasFlows: false, endBalance: null };
      groups.set(date, group);
    }
    return group;
  };
  for (const entry of entries) {
    const { record } = entry;
    const group = groupFor(record.date);
    group.items.push({ kind: 'record', id: entry.transId, entry });
    if (ghostIds?.has(record.accountId)) continue;
    if (!isCardShadow(record, lensAccountId)) group.endBalance ??= read(entry);
    if (record.type !== 'adjustment') {
      group.net += record.amount;
      group.hasFlows = true;
    }
  }
  for (const payoff of payoffs) {
    groupFor(payoff.date).items.push({ kind: 'payoff', id: payoff.id, payoff });
  }
  if (payoffs.length > 0) {
    for (const { items } of groups.values()) {
      if (items.some((item) => item.kind === 'payoff')) items.sort((a, b) => compareSameDayIds(b.id, a.id));
    }
  }
  return [...groups.values()].sort((a, b) => b.date.localeCompare(a.date));
}

export interface DayPoint {
  /** 0 is "before the month" (the opening balance); 1..n are days. */
  day: number;
  date: string | null;
  balance: number;
  inflow: number;
  outflow: number;
  count: number;
}

/**
 * End-of-day balance for each day of the month, up to lastDay (today, in the
 * current month - never projected forward). A day with no records carries
 * the previous day's balance. Point 0 holds the opening balance, so the first
 * step of the chart starts where the month started.
 */
export function daySeries(
  monthEntries: StatementEntry[], allInMonth: StatementEntry[], year: number, month: number, lastDay: number,
  opening: number, read: (e: StatementEntry) => number,
): DayPoint[] {
  const { prefix } = monthBounds(year, month);
  // End of day: the newest entry of that day, of ANY account (the balance
  // moves with every record), while the in/out/count describe only the rows
  // this view shows.
  const endByDate = new Map<string, number>();
  for (const e of allInMonth) if (!endByDate.has(e.record.date)) endByDate.set(e.record.date, read(e));
  const flowByDate = new Map<string, { inflow: number; outflow: number; count: number }>();
  for (const e of monthEntries) {
    if (e.record.type === 'adjustment') continue;
    const f = flowByDate.get(e.record.date) ?? { inflow: 0, outflow: 0, count: 0 };
    f.count += 1;
    if (e.record.type === 'income') f.inflow += e.record.amount;
    else f.outflow -= e.record.amount;
    flowByDate.set(e.record.date, f);
  }
  const points: DayPoint[] = [{ day: 0, date: null, balance: opening, inflow: 0, outflow: 0, count: 0 }];
  let bal = opening;
  for (let day = 1; day <= lastDay; day += 1) {
    const date = `${prefix}${String(day).padStart(2, '0')}`;
    bal = endByDate.get(date) ?? bal;
    const f = flowByDate.get(date) ?? { inflow: 0, outflow: 0, count: 0 };
    points.push({ day, date, balance: bal, ...f });
  }
  return points;
}

/** Rounded to cents so float residue never prints as a signed zero. */
export function cents(n: number): number {
  return Math.round(n * 100);
}
