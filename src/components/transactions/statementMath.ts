/**
 * Pure figures for the Transactions page, derived from the ledger the page
 * already has. Nothing here recomputes a balance: every balance is read from
 * a ledger entry's totalBalanceAfter / balancesAfter, so the statement, the
 * month strip, the chart and the account lens can never disagree with the
 * server's single ledger walk.
 *
 * Every list in here is NEWEST FIRST, like the ledger itself.
 */
import type { StatementEntry } from './StatementList';

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
  /** The rows shown for the month (only the lensed account's under a lens). */
  entries: StatementEntry[];
  opening: number;
  closing: number;
  deposits: number;
  withdrawals: number;
  adjustments: number;
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
  const flows = entries.filter((e) => e.record.type !== 'adjustment');
  const deposits = flows.reduce((s, e) => (e.record.amount > 0 ? s + e.record.amount : s), 0);
  const withdrawals = flows.reduce((s, e) => (e.record.amount < 0 ? s + Math.abs(e.record.amount) : s), 0);
  const adjustments = entries.reduce((s, e) => (e.record.type === 'adjustment' ? s + e.record.amount : s), 0);
  return { entries, opening, closing, deposits, withdrawals, adjustments };
}

export interface MonthSummary {
  year: number;
  month: number;
  deposits: number;
  withdrawals: number;
  /** Records in the month (adjustments included: they are activity too). */
  count: number;
  closing: number;
}

/**
 * One summary per month for the timeline strip, in the order the months are
 * given. Same rules as monthFigures, so a chip and the statement it opens
 * always agree.
 */
export function summarizeMonths(
  all: StatementEntry[], months: { year: number; month: number }[], openingTotal: number, accountId: string | null = null,
): MonthSummary[] {
  return months.map(({ year, month }) => {
    const f = monthFigures(all, year, month, openingTotal, accountId);
    return { year, month, deposits: f.deposits, withdrawals: f.withdrawals, count: f.entries.length, closing: f.closing };
  });
}

export interface DayGroup {
  date: string;
  entries: StatementEntry[];
  /** Money in minus money out for the day, adjustments left out as in the totals. */
  net: number;
  /** Whether the day had any non-adjustment record (a transfer-only day has no net to show). */
  hasFlows: boolean;
  /** Balance after the day's newest record. */
  endBalance: number;
}

/** Splits newest-first entries into newest-first days. */
export function groupByDay(entries: StatementEntry[], read: (e: StatementEntry) => number): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const e of entries) {
    let g = groups[groups.length - 1];
    if (!g || g.date !== e.record.date) {
      g = { date: e.record.date, entries: [], net: 0, hasFlows: false, endBalance: read(e) };
      groups.push(g);
    }
    g.entries.push(e);
    if (e.record.type !== 'adjustment') {
      g.net += e.record.amount;
      g.hasFlows = true;
    }
  }
  return groups;
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
    const f = flowByDate.get(e.record.date) ?? { inflow: 0, outflow: 0, count: 0 };
    f.count += 1;
    if (e.record.type !== 'adjustment') {
      if (e.record.amount > 0) f.inflow += e.record.amount;
      else f.outflow += Math.abs(e.record.amount);
    }
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
