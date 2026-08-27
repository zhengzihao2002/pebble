import type {
  BalanceAdjustment,
  CategoryMeta,
  ExpenseTransaction,
  IncomeTransaction,
  LedgerRecord,
  Transaction,
} from '@/types';
import { atMidnight, getToday, parseLocalDate } from './format';

// Same-day tiebreak for records sorted ascending by date.
//
// Two id formats coexist after the data import: legacy 'YYYYMMDD_NNNNNNNNN'
// (underscore) and app-generated 'YYYYMMDDHHMMSSmmm-rrrr' (hyphen). Both open
// with the same eight date digits, so a plain string compare falls through to
// position 9 - a digit for app ids, '_' for imported ones. Digits sort below
// '_', so EVERY app-entered record sorted before EVERY imported one on a
// shared day, and after the newest-first reverse it appeared below them.
//
// Imported rows are backfilled history and app rows are entered live, so
// imported sorts as earlier within a day. Inside one format the plain string
// compare is already correct: both are zero-padded and most-significant-first.
//
// Known limitation: generateTransId stamps the CURRENT time, not the
// transaction's date, so a back-dated entry carries an id from the day it was
// typed. Its position among records on the date it was assigned to is
// therefore arbitrary. Fixing that means changing id generation and cannot
// repair existing rows; tracked separately.
export function compareSameDayIds(aId: string, bId: string): number {
  const aImported = aId.includes('_');
  const bImported = bId.includes('_');
  if (aImported !== bImported) return aImported ? -1 : 1;
  return aId.localeCompare(bId);
}

// Side Cash is real money and counts toward the balance, but it is not
// earnings: cash back, a gift, a gambling win. It is deliberately excluded
// from every "income" figure so the income, savings rate and trend numbers
// reflect actual earning power. It remains fully visible in Reports.
export function isSideCash(t: Transaction): boolean {
  return t.type === 'income' && t.category === 'Side Cash';
}

// NOTE: mergeLedgerRecords() was removed here. It was exported but never
// imported, and it sorted by date with NO compareSameDayIds tiebreak - so any
// future caller would have inherited the exact same-day ordering bug that
// comparator exists to prevent. computeRecentTransactions() below is the
// correct way to combine transactions with adjustments.

// Merges the two permanent histories into one newest-first list. Replaces
// the useTransactions() store selector now that data arrives from the server.
export function mergeTransactions(
  expenses: ExpenseTransaction[], income: IncomeTransaction[]
): Transaction[] {
  return [...expenses, ...income].sort(
    (a, b) => parseLocalDate(b.date).getTime() - parseLocalDate(a.date).getTime()
  );
}

export interface TrendPoint {
  month: string;
  income: number;
  spending: number;
}

// Builds income/spending totals bucketed by month, quarter, or year for the
// "Income vs. spending" dashboard chart.
export function buildTrendData(transactions: Transaction[], mode: string, yearKey?: string | null): TrendPoint[] {
  const granularity = mode === 'quarter' ? 'quarter' : mode === 'year' ? 'year' : 'month';

  // 'month' and 'quarter' bucket by granularity WITHOUT a window (unlike
  // last6/last12, which slice below), so across several years of history they
  // plot every month ever recorded - dozens of points crushed into one small
  // chart. yearKey scopes them to a single year: 12 monthly or 4 quarterly
  // points, which is what a trend line can actually show.
  //
  // Deliberately not a single-period pin like the donut and stat tiles use:
  // those display one aggregate, so pinning one month is meaningful, whereas
  // pinning a series chart to one month leaves a single unconnected point.
  // 'year' mode ignores yearKey - the years themselves are the series.
  const scoped = (yearKey && (granularity === 'month' || granularity === 'quarter'))
    ? transactions.filter((t) => `${parseLocalDate(t.date).getFullYear()}` === yearKey)
    : transactions;

  const buckets = new Map<string, { sortKey: number; label: string; income: number; spending: number }>();
  scoped.forEach((t) => {
    const d = parseLocalDate(t.date);
    let key: string, sortKey: number, label: string;
    if (granularity === 'month') {
      key = `${d.getFullYear()}-${d.getMonth()}`;
      sortKey = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    } else if (granularity === 'quarter') {
      const q = Math.floor(d.getMonth() / 3) + 1;
      key = `${d.getFullYear()}-Q${q}`;
      sortKey = new Date(d.getFullYear(), (q - 1) * 3, 1).getTime();
      label = `Q${q} '${String(d.getFullYear()).slice(2)}`;
    } else {
      key = `${d.getFullYear()}`;
      sortKey = new Date(d.getFullYear(), 0, 1).getTime();
      label = `${d.getFullYear()}`;
    }
    if (!buckets.has(key)) buckets.set(key, { sortKey, label, income: 0, spending: 0 });
    const bucket = buckets.get(key)!;
    if (t.amount > 0) {
      if (!isSideCash(t)) bucket.income += t.amount;
    } else {
      bucket.spending += Math.abs(t.amount);
    }
  });

  let arr = [...buckets.values()].sort((a, b) => a.sortKey - b.sortKey);
  if (mode === 'last6') arr = arr.slice(-6);
  if (mode === 'last12') arr = arr.slice(-12);
  return arr.map((b) => ({ month: b.label, income: Math.round(b.income), spending: Math.round(b.spending) }));
}

// Estimates a full year of income from Standard Income history: average
// monthly pay, annualized.
export function estimateAnnualIncome(transactions: Transaction[]): number {
  const incomeTxns = transactions.filter((t) => t.category === 'Standard Income');
  if (incomeTxns.length === 0) return 0;
  const monthsSeen = new Set(incomeTxns.map((t) => {
    const d = parseLocalDate(t.date);
    return `${d.getFullYear()}-${d.getMonth()}`;
  }));
  const total = incomeTxns.reduce((s, t) => s + t.amount, 0);
  const avgMonthly = total / monthsSeen.size;
  return Math.round(avgMonthly * 12);
}

// Shared "is this date within the selected window" logic, used by every
// period-aware dashboard widget.
//
// `now` is snapshotted ONCE here, at predicate-construction time, and closed
// over by the returned predicates. Calling getToday() inside a predicate
// instead would re-read the clock for every transaction in a filter pass -
// and a pass that straddled midnight would apply two different upper bounds
// to different rows of the same list.
export function getWindowPredicate(mode: string, periodKey?: string | null): (d: Date) => boolean {
  const now = getToday();

  if (mode === '30d' || mode === '90d') {
    const days = mode === '30d' ? 30 : 90;
    const cutoff = atMidnight(now);
    cutoff.setDate(cutoff.getDate() - days + 1);
    return (d) => d >= cutoff && d <= now;
  }
  if (mode === 'last6' || mode === 'last12') {
    const monthsBack = mode === 'last6' ? 6 : 12;
    // monthsBack CALENDAR months, ending with the one in progress: for "last
    // 12" on 26 Aug 2026 that is Sep 2025 through Aug 2026. The `+ 1` is what
    // makes the count 12 rather than 13 - dropping it reaches back an extra
    // month and the label stops describing the window.
    //
    // The final month is deliberately partial. The dashboard answers "where am
    // I right now", so today's spending belongs in it. The Analysis page uses
    // 12 COMPLETE months instead (Aug 2025 - Jul 2026), because an average over
    // a half-finished month understates spending and overstates runway. Two
    // different questions, two different windows, both labelled.
    const cutoff = new Date(now.getFullYear(), now.getMonth() - monthsBack + 1, 1);
    // Upper bound: without it a future-dated transaction counts as money
    // already spent. The 30d/90d branch was always bounded; these were not.
    return (d) => d >= cutoff && d <= now;
  }
  if (mode === 'month') {
    return periodKey
      ? (d) => `${d.getFullYear()}-${d.getMonth()}` === periodKey
      : (d) => d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }
  if (mode === 'quarter') {
    return periodKey
      ? (d) => `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}` === periodKey
      : (d) => { const q = Math.floor(now.getMonth() / 3); return d.getFullYear() === now.getFullYear() && Math.floor(d.getMonth() / 3) === q; };
  }
  return periodKey
    ? (d) => `${d.getFullYear()}` === periodKey
    : (d) => d.getFullYear() === now.getFullYear();
}

const WINDOW_MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WINDOW_MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

export interface WindowDescription {
  /** Human range, e.g. 'Aug 2025 - Aug 2026' or 'Jul 28 - Aug 26, 2026'. */
  rangeLabel: string;
  /** True when the window runs up to today and so contains an unfinished period. */
  inProgress: boolean;
}

/**
 * The same window getWindowPredicate() filters by, described in words.
 *
 * MUST BE KEPT IN STEP WITH getWindowPredicate ABOVE. A label that disagrees
 * with the filter is worse than no label - it makes a correct number look
 * wrong. Every branch here mirrors a branch there, in the same order.
 *
 * Exists because the predicate returns a bare boolean function with no bounds,
 * so nothing downstream could say which months it covered. The Analysis page
 * prints its resolved range under the period selector; this gives the
 * dashboard the same, rather than leaving the user to infer it.
 */
export function describeWindow(mode: string, periodKey?: string | null): WindowDescription {
  const now = getToday();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();

  if (mode === '30d' || mode === '90d') {
    const days = mode === '30d' ? 30 : 90;
    const start = atMidnight(now);
    start.setDate(start.getDate() - days + 1);
    const sameYear = start.getFullYear() === y;
    const left = `${WINDOW_MONTH_ABBR[start.getMonth()]} ${start.getDate()}${sameYear ? '' : `, ${start.getFullYear()}`}`;
    return { rangeLabel: `${left} - ${WINDOW_MONTH_ABBR[m]} ${d}, ${y}`, inProgress: true };
  }

  if (mode === 'last6' || mode === 'last12') {
    const monthsBack = mode === 'last6' ? 6 : 12;
    // Mirrors the predicate exactly, `+ 1` included.
    const start = new Date(y, m - monthsBack + 1, 1);
    return {
      rangeLabel: `${WINDOW_MONTH_ABBR[start.getMonth()]} ${start.getFullYear()} - ${WINDOW_MONTH_ABBR[m]} ${y}`,
      inProgress: true,
    };
  }

  if (mode === 'month') {
    // periodKey is `${year}-${monthIndex}` with a ZERO-BASED month, matching
    // the predicate's own key construction.
    if (periodKey) {
      const [py, pm] = periodKey.split('-').map(Number);
      return { rangeLabel: `${WINDOW_MONTH_FULL[pm]} ${py}`, inProgress: py === y && pm === m };
    }
    return { rangeLabel: `${WINDOW_MONTH_FULL[m]} ${y}`, inProgress: true };
  }

  if (mode === 'quarter') {
    const q = Math.floor(m / 3) + 1;
    if (periodKey) {
      const [pyRaw, pqRaw] = periodKey.split('-Q');
      const py = Number(pyRaw);
      const pq = Number(pqRaw);
      return { rangeLabel: `Q${pq} ${py}`, inProgress: py === y && pq === q };
    }
    return { rangeLabel: `Q${q} ${y}`, inProgress: true };
  }

  // Year, and the fallback for any unrecognised mode - mirroring the
  // predicate, whose final branch is also year.
  const py = periodKey ? Number(periodKey) : y;
  return { rangeLabel: String(py), inProgress: py === y };
}

/** Bucket for spending whose category name matches no category row. */
export const UNCATEGORISED_LABEL = 'Uncategorised';

export interface CategoryBreakdownEntry {
  name: string;
  value: number;
  color: string;
}

// Aggregates expense totals per category within a selected window, for the
// "Where it went" chart. periodKey lets the caller pin an exact
// month/quarter/year instead of defaulting to the current one.
export function buildCategoryBreakdown(
  transactions: Transaction[], mode: string, categoryMeta: CategoryMeta, periodKey?: string | null
): CategoryBreakdownEntry[] {
  const inWindow = getWindowPredicate(mode, periodKey);
  const sums: Record<string, number> = {};

  // Spending whose category name matches no category row. Previously these
  // were skipped outright, so the money vanished from this chart while still
  // counting in every total - the chart and the stat tiles disagreed, with
  // nothing to indicate why. Bucketed rather than dropped: a visible
  // "Uncategorised" slice is a question the user can answer.
  //
  // Happens when a category is renamed or deleted outside the actions that
  // cascade it, or when imported history used a name that was never created.
  let unmatched = 0;

  transactions.forEach((t) => {
    if (t.amount >= 0 || !inWindow(parseLocalDate(t.date))) return;
    if (categoryMeta[t.category]) {
      sums[t.category] = (sums[t.category] || 0) + Math.abs(t.amount);
    } else {
      unmatched += Math.abs(t.amount);
    }
  });

  const entries = Object.entries(categoryMeta)
    .map(([name, meta]) => ({ name, value: sums[name] || 0, color: meta.color }))
    .filter((d) => d.value > 0);

  if (unmatched > 0) {
    // Literal hex rather than FALLBACK_CATEGORY_COLOR from @/data/seed: that
    // module pulls in lucide-react icon components, and stats.ts is imported
    // by server actions where dragging a UI dependency in would be wrong.
    entries.push({ name: UNCATEGORISED_LABEL, value: unmatched, color: '#8A8F8B' });
  }

  return entries.sort((a, b) => b.value - a.value);
}

// Derives per-category spend directly from transactions, filtered to a
// single year (budgets are annual — "spent" resets each year).
export function computeCategorySpent(transactions: Transaction[], year: number): Record<string, number> {
  const spent: Record<string, number> = {};
  transactions.forEach((t) => {
    if (t.amount < 0 && parseLocalDate(t.date).getFullYear() === year) {
      spent[t.category] = (spent[t.category] || 0) + Math.abs(t.amount);
    }
  });
  return spent;
}

export interface LedgerEntry {
  transId: string;
  checkingBalanceAfter: number;
  cashBalanceAfter: number;
  totalBalanceAfter: number;
}

// Walks all expense+income records chronologically once, tracking TWO
// independent running balances (Checking and Cash), and returns a
// lightweight newest-first ledger.
//
// Starts from the OPENING balances (the balance before any recorded
// transaction) and walks FORWARD. Opening balances are stored; current
// balances are derived. Storing the current balance instead would mean two
// sources of truth that can silently drift apart — unacceptable for money.
export function computeRecentTransactions(
  expenses: ExpenseTransaction[], income: IncomeTransaction[], checkingOpening: number, cashOpening: number,
  adjustments: BalanceAdjustment[] = []
): LedgerEntry[] {
  const all: LedgerRecord[] = [...expenses, ...income, ...adjustments].sort((a, b) => {
    const dateDiff = parseLocalDate(a.date).getTime() - parseLocalDate(b.date).getTime();
    if (dateDiff !== 0) return dateDiff;
    return compareSameDayIds(a.id, b.id);
  });

  let runningChecking = checkingOpening;
  let runningCash = cashOpening;

  const ledger: LedgerEntry[] = all.map((t) => {
    if (t.paymentMethod === 'Checking') runningChecking += t.amount;
    else runningCash += t.amount;
    return {
      transId: t.id,
      checkingBalanceAfter: runningChecking,
      cashBalanceAfter: runningCash,
      totalBalanceAfter: runningChecking + runningCash,
    };
  });

  return ledger.reverse(); // newest first, matching the statement display order
}

export interface CurrentBalances {
  checking: number;
  cash: number;
  total: number;
}

// Current balance is DERIVED, never stored: opening + the sum of every
// transaction against that payment method. Expense amounts are negative and
// income amounts positive, so a single sum handles both directions.
export function computeCurrentBalances(
  transactions: Transaction[], checkingOpening: number, cashOpening: number,
  adjustments: BalanceAdjustment[] = []
): CurrentBalances {
  let checking = checkingOpening;
  let cash = cashOpening;
  const all: LedgerRecord[] = [...transactions, ...adjustments];
  all.forEach((t) => {
    if (t.paymentMethod === 'Checking') checking += t.amount;
    else cash += t.amount;
  });
  return { checking, cash, total: checking + cash };
}

export interface MonthOption {
  year: number;
  month: number; // 0-11
  label: string;
}

// The last `n` calendar months including the current one, newest first —
// powers the Transactions page's "up to 12 months back" statement navigator.
export function getLastNMonths(referenceDate: Date, n: number): MonthOption[] {
  const months: MonthOption[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - i, 1);
    months.push({
      year: d.getFullYear(),
      month: d.getMonth(),
      label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    });
  }
  return months;
}

export interface PeriodStats {
  income: number;
  spending: number;
  savingsRate: number;
  saved: number;
}

// Totals income/spending within a selected window, for the
// Income/Spending/Savings rate/Saved stat tiles.
export function computeStatsForPeriod(transactions: Transaction[], mode: string, periodKey?: string | null): PeriodStats {
  const inWindow = getWindowPredicate(mode, periodKey);
  let income = 0;
  let spending = 0;
  transactions.forEach((t) => {
    if (inWindow(parseLocalDate(t.date))) {
      if (t.amount > 0) {
        if (!isSideCash(t)) income += t.amount;
      } else {
        spending += Math.abs(t.amount);
      }
    }
  });
  // Math.floor (not round) to 2 decimal places: rounding to a whole number
  // would overstate the savings rate (e.g. show 100% for 99.9985%). Flooring
  // never rounds toward a more flattering number in either direction.
  const savingsRate = income > 0 ? Math.floor(((income - spending) / income) * 10000) / 100 : 0;
  return { income, spending, savingsRate, saved: income - spending };
}

export interface PeriodOption {
  key: string;
  sortKey: number;
  label: string;
}

// Lists the specific months/quarters/years actually present in the data,
// newest first — powers the "which month/quarter/year" sub-selector next to
// the breakdown mode dropdown.
export function getAvailablePeriods(
  transactions: Transaction[],
  granularity: 'month' | 'quarter' | 'year',
  latestYearOnly = false,
): PeriodOption[] {
  const map = new Map<string, PeriodOption>();
  transactions.forEach((t) => {
    const d = parseLocalDate(t.date);
    let key: string, sortKey: number, label: string;
    if (granularity === 'month') {
      key = `${d.getFullYear()}-${d.getMonth()}`;
      sortKey = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } else if (granularity === 'quarter') {
      const q = Math.floor(d.getMonth() / 3) + 1;
      key = `${d.getFullYear()}-Q${q}`;
      sortKey = new Date(d.getFullYear(), (q - 1) * 3, 1).getTime();
      label = `Q${q} ${d.getFullYear()}`;
    } else {
      key = `${d.getFullYear()}`;
      sortKey = new Date(d.getFullYear(), 0, 1).getTime();
      label = `${d.getFullYear()}`;
    }
    if (!map.has(key)) map.set(key, { key, sortKey, label });
  });
  const all = [...map.values()].sort((a, b) => b.sortKey - a.sortKey);

  // latestYearOnly trims the dashboard selectors to one year's worth of
  // periods. Several years of history turns "By month" into a list of dozens,
  // which is a Reports-shaped job, not a dashboard one.
  //
  // Scoped to the newest year PRESENT IN THE DATA rather than the current
  // calendar year, deliberately. Reading the clock here would make the option
  // list differ between the server render (UTC on Vercel) and the client at
  // year boundaries - a hydration mismatch. The data-derived year is
  // deterministic, matches the calendar year whenever there is recent
  // activity, and still shows the most recent months in January before that
  // year has any transactions, where a clock-derived list would be empty.
  //
  // Never applied to 'year': one option is not a selector.
  if (!latestYearOnly || granularity === 'year' || all.length === 0) return all;
  const latestYear = new Date(all[0].sortKey).getFullYear();
  return all.filter((p) => new Date(p.sortKey).getFullYear() === latestYear);
}

// The share of gross pay withheld before it landed. Derived from the two
// stored amounts rather than persisted: the imported data carried a
// tax_percentage column, dropped on import because gross and net already
// determine it and a stored copy can drift when either is edited.
//
// Named for deductions, not tax: the gap also covers insurance and retirement
// contributions. Returns 0 for a zero gross rather than dividing by it.
export function deductionPct(gross: number, net: number): number {
  return gross > 0 ? ((gross - net) / gross) * 100 : 0;
}

// Blends a hex color toward white by `amount` (0-1), for gradient-shaded pie slices.
export function lightenColor(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, (num >> 16) + Math.round((255 - (num >> 16)) * amount));
  const g = Math.min(255, ((num >> 8) & 0xff) + Math.round((255 - ((num >> 8) & 0xff)) * amount));
  const b = Math.min(255, (num & 0xff) + Math.round((255 - (num & 0xff)) * amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export function darkenColor(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, (num >> 16) - Math.round((num >> 16) * amount));
  const g = Math.max(0, ((num >> 8) & 0xff) - Math.round(((num >> 8) & 0xff) * amount));
  const b = Math.max(0, (num & 0xff) - Math.round((num & 0xff) * amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
