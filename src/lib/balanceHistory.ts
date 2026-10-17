/**
 * Total balance, day by day, for the Dashboard hero's trajectory line.
 *
 * Pure and dependency-free: no clock reads (the caller passes its zone-aware
 * `today`), no UI imports.
 *
 * WALKS BACKWARD FROM THE SERVER'S TOTAL rather than forward from zero. The
 * balance at the end of day D is the total minus every record dated after D.
 * With the same records that is exactly the forward walk the Accounts page
 * and the statement ledger use (sum of every record up to D), because the
 * total is itself the sum of every record - but anchoring on the authoritative
 * figure means the line can never end somewhere the big number disagrees
 * with, and a future-dated record is counted the same way the total counts it.
 *
 * Records against an account that is not in `accountIds` are skipped, the
 * same rule computeCurrentBalances applies, so a stray row cannot bend the line
 * without also bending the total.
 */

export interface BalanceRecord {
  date: string; // 'YYYY-MM-DD'
  amount: number; // signed
  accountId: string;
}

export interface BalancePoint {
  date: string; // 'YYYY-MM-DD'
  /** Balance at the end of that day. */
  total: number;
}

function ymd(dt: Date): string {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/**
 * `days` points ending with `today` (inclusive), oldest first.
 * `today` is a 'YYYY-MM-DD' resolved in the user's zone by the caller.
 */
export function buildBalanceHistory(
  records: readonly BalanceRecord[],
  accountIds: readonly string[],
  totalBalance: number,
  today: string,
  days = 90,
): BalancePoint[] {
  const known = new Set(accountIds);
  // Newest first, so one pass peels records off as the day steps back.
  const sorted = records
    .filter((r) => known.has(r.accountId))
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const ty = Number(today.slice(0, 4));
  const tm = Number(today.slice(5, 7)) - 1;
  const td = Number(today.slice(8, 10));

  const out: BalancePoint[] = [];
  let running = totalBalance;
  let i = 0;
  for (let k = 0; k < days; k++) {
    const day = ymd(new Date(ty, tm, td - k));
    // Remove everything dated after `day`: what is left is the balance at its end.
    while (i < sorted.length && sorted[i].date > day) {
      running -= sorted[i].amount;
      i++;
    }
    out.push({ date: day, total: Math.round(running * 100) / 100 });
  }
  return out.reverse();
}

export interface BalanceChange {
  /** totalBalance minus the first point: the hero figure stays the reference. */
  change: number;
  /** Percent of the starting balance; null when that start was zero or negative. */
  pct: number | null;
}

export function balanceChange(points: readonly BalancePoint[], totalBalance: number): BalanceChange | null {
  if (points.length < 2) return null;
  const first = points[0].total;
  const change = Math.round((totalBalance - first) * 100) / 100;
  return { change, pct: first > 0 ? (change / first) * 100 : null };
}
