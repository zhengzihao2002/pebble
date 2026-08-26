/**
 * Group D: forward-projected recurring occurrences.
 *
 * USES generateOccurrences() - the date math is NOT reimplemented here.
 * Clamping is measured from the original anchor rather than the previous
 * occurrence, so rules cannot drift; that is already verified against leap
 * years and month-end cases.
 *
 * INCLUDES 'once' RULES, unlike computeCommitments(). A one-off is not a
 * standing monthly commitment, but it IS money leaving your account soon.
 * The two cards answer different questions and both say so in their tooltips.
 *
 * NO DOUBLE COUNTING. window.after is EXCLUSIVE and is set to at least
 * materializedThrough, so occurrences already written to the ledger as real
 * transactions are never projected again.
 */

import { generateOccurrences, type Ymd } from '@/lib/recurring/occurrences';
import { isExhausted } from '@/lib/recurring/occurrences';
import type { RecurringRule } from '@/types';

export interface UpcomingItem {
  ruleId: string;
  description: string;
  category: string;
  kind: 'expense' | 'income';
  /** Signed as stored: expense <= 0, income >= 0 and NET. */
  amount: number;
  date: string;
}

export interface UpcomingMonth {
  key: string; // 'YYYY-MM'
  label: string;
  items: UpcomingItem[];
  /** Positive magnitude. */
  expenseTotal: number;
  /** Net. */
  incomeTotal: number;
}

export interface UpcomingSummary {
  months: UpcomingMonth[];
  expenseTotal: number;
  incomeTotal: number;
  count: number;
  /** Inclusive upper bound actually used, for labelling. */
  throughYmd: string;
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Day before `ymd`, as the exclusive lower bound for "from today onwards". */
function dayBefore(ymd: string): string {
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(5, 7));
  const d = Number(ymd.slice(8, 10));
  const prev = new Date(y, m - 1, d - 1);
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(prev.getDate()).padStart(2, '0')}`;
}

/** Last day of the month `monthsAhead` from `ymd`. */
function endOfMonthAhead(ymd: string, monthsAhead: number): string {
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(5, 7));
  const end = new Date(y, m + monthsAhead, 0);
  return `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
}

export function computeUpcoming(
  rules: readonly RecurringRule[],
  today: string,
  monthsAhead = 3,
): UpcomingSummary {
  const throughYmd = endOfMonthAhead(today, monthsAhead);
  const items: UpcomingItem[] = [];

  for (const r of rules) {
    // Paused rules owe nothing. Exhausted rules have no occurrences left.
    // 'once' is deliberately NOT filtered - see the header.
    if (r.status !== 'active') continue;
    if (isExhausted(r, r.materializedThrough)) continue;

    // EXCLUSIVE lower bound. materializedThrough marks what is already in the
    // ledger; taking the later of that and yesterday means we neither replay
    // history nor project dates that have already passed.
    const yesterday = dayBefore(today);
    const after = (r.materializedThrough && r.materializedThrough > yesterday
      ? r.materializedThrough
      : yesterday) as Ymd;

    const dates = generateOccurrences(r, { after, through: throughYmd as Ymd, limit: 60 });

    for (const date of dates) {
      items.push({
        ruleId: r.id,
        description: r.description,
        category: r.category,
        kind: r.kind,
        amount: r.amount,
        date,
      });
    }
  }

  // Projected occurrences have no ids, so compareSameDayIds does not apply.
  items.sort((a, b) => a.date.localeCompare(b.date) || a.description.localeCompare(b.description));

  const byMonth = new Map<string, UpcomingMonth>();
  let expenseTotal = 0;
  let incomeTotal = 0;

  for (const it of items) {
    const key = it.date.slice(0, 7);
    let m = byMonth.get(key);
    if (!m) {
      const mi = Number(key.slice(5, 7)) - 1;
      m = { key, label: `${MONTH_ABBR[mi]} ${key.slice(0, 4)}`, items: [], expenseTotal: 0, incomeTotal: 0 };
      byMonth.set(key, m);
    }
    m.items.push(it);
    if (it.kind === 'expense') {
      const mag = Math.abs(it.amount);
      m.expenseTotal += mag;
      expenseTotal += mag;
    } else {
      // Income rule amounts are NET, matching the transaction rule.
      m.incomeTotal += it.amount;
      incomeTotal += it.amount;
    }
  }

  return {
    months: [...byMonth.values()].sort((a, b) => a.key.localeCompare(b.key)),
    expenseTotal,
    incomeTotal,
    count: items.length,
    throughYmd,
  };
}
