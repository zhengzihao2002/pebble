import type { Account } from '@/lib/data/mappers';
import type { ExpenseTransaction, Transaction } from '@/types';

/**
 * Credit card statements and due dates - the one place these rules live.
 *
 * Pebble has no statements, so it uses the common grace period: a due date
 * covers the unpaid charges made at least STATEMENT_GRACE_DAYS before it.
 * Newer charges roll to the following due date. A charge is OVERDUE once the
 * due date that covered it has passed and it is still on the card (paying
 * off moves it to a bank account, so "still on the card" means unpaid).
 *
 * Dates are 'YYYY-MM-DD'; `today` comes from the caller (zone-aware).
 */
export const STATEMENT_GRACE_DAYS = 21;

const pad = (n: number) => String(n).padStart(2, '0');
const toYmd = (y: number, m: number, d: number) => {
  const dt = new Date(y, m, d);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
};
const addDays = (ymd: string, n: number) => toYmd(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10) + n);
const daysBetween = (a: string, b: string) => Math.round(
  (Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86_400_000,
);
/** The due date in month m (0-based, may be out of range); 29-31 clamp to the month's last day. */
const dueIn = (y: number, m: number, dueDay: number) => toYmd(y, m, Math.min(dueDay, new Date(y, m + 1, 0).getDate()));

/** The next due date on or after today, and the one before it. */
export function dueDates(dueDay: number, today: string): { next: string; previous: string } {
  const y = +today.slice(0, 4);
  const m = +today.slice(5, 7) - 1;
  const thisMonth = dueIn(y, m, dueDay);
  return thisMonth >= today
    ? { next: thisMonth, previous: dueIn(y, m - 1, dueDay) }
    : { next: dueIn(y, m + 1, dueDay), previous: thisMonth };
}

export interface CardStatus {
  card: Account;
  /** Everything still on the card. */
  owed: number;
  next: string;
  previous: string;
  /** Days until `next` (0 = due today). */
  daysLeft: number;
  /** Charges covered by the next due date - includes any overdue ones. */
  dueNow: number;
  /** Charges whose due date has already passed. */
  overdue: number;
  dueChargeIds: string[];
}

const round = (v: number) => Math.round(v * 100) / 100;

export function cardStatus(card: Account, charges: ExpenseTransaction[], today: string): CardStatus | null {
  if (card.kind !== 'credit' || !card.dueDay) return null;
  const { next, previous } = dueDates(card.dueDay, today);
  const cutNow = addDays(next, -STATEMENT_GRACE_DAYS);
  const cutPrev = addDays(previous, -STATEMENT_GRACE_DAYS);
  let owed = 0;
  let dueNow = 0;
  let overdue = 0;
  const dueChargeIds: string[] = [];
  for (const c of charges) {
    if (c.accountId !== card.id) continue;
    const a = Math.abs(c.amount);
    owed += a;
    if (c.date <= cutNow) { dueNow += a; dueChargeIds.push(c.id); }
    if (c.date <= cutPrev) overdue += a;
  }
  return { card, owed: round(owed), next, previous, daysLeft: daysBetween(today, next), dueNow: round(dueNow), overdue: round(overdue), dueChargeIds };
}

/** Every active or hibernated credit card's status. */
export function cardStatuses(accounts: Account[], transactions: Transaction[], today: string): CardStatus[] {
  const expenses = transactions.filter((x): x is ExpenseTransaction => x.type === 'expense');
  return accounts
    .filter((a) => a.kind === 'credit')
    .map((a) => cardStatus(a, expenses, today))
    .filter((s): s is CardStatus => s !== null);
}

export type ReminderLevel = 'overdue' | 'd1' | 'd3' | 'd7';

/** Missed first; otherwise due within 1 (today or tomorrow), 3 or 7 days. Null when nothing calls for one. */
export function reminderLevel(s: CardStatus): ReminderLevel | null {
  if (s.overdue > 0.004) return 'overdue';
  if (s.dueNow <= 0.004) return null;
  if (s.daysLeft <= 1) return 'd1';
  if (s.daysLeft <= 3) return 'd3';
  if (s.daysLeft <= 7) return 'd7';
  return null;
}
