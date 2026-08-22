import type {
  BalanceAdjustment,
  CategoryMeta,
  ExpenseTransaction,
  IncomeTransaction,
  LedgerRecord,
  Transaction,
} from '@/types';
import { atMidnight, getToday, parseLocalDate } from './format';

// Side Cash is real money and counts toward the balance, but it is not
// earnings: cash back, a gift, a gambling win. It is deliberately excluded
// from every "income" figure so the income, savings rate and trend numbers
// reflect actual earning power. It remains fully visible in Reports.
export function isSideCash(t: Transaction): boolean {
  return t.type === 'income' && t.category === 'Side Cash';
}

// Merges transactions and adjustments into one newest-first list for the
// statement ledger. Adjustments are deliberately absent from mergeTransactions
// below: that feeds Reports, which must never see them.
export function mergeLedgerRecords(
  transactions: Transaction[], adjustments: BalanceAdjustment[]
): LedgerRecord[] {
  return [...transactions, ...adjustments].sort(
    (a, b) => parseLocalDate(b.date).getTime() - parseLocalDate(a.date).getTime()
  );
}

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
export function buildTrendData(transactions: Transaction[], mode: string): TrendPoint[] {
  const granularity = mode === 'quarter' ? 'quarter' : mode === 'year' ? 'year' : 'month';
  const buckets = new Map<string, { sortKey: number; label: string; income: number; spending: number }>();
  transactions.forEach((t) => {
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
    const cutoff = new Date(now.getFullYear(), now.getMonth() - monthsBack + 1, 1);
    return (d) => d >= cutoff;
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
  transactions.forEach((t) => {
    if (t.amount < 0 && categoryMeta[t.category] && inWindow(parseLocalDate(t.date))) {
      sums[t.category] = (sums[t.category] || 0) + Math.abs(t.amount);
    }
  });
  return Object.entries(categoryMeta)
    .map(([name, meta]) => ({ name, value: sums[name] || 0, color: meta.color }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);
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
    return a.id.localeCompare(b.id); // same-day tiebreak, via the date/time-based id
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
export function getAvailablePeriods(transactions: Transaction[], granularity: 'month' | 'quarter' | 'year'): PeriodOption[] {
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
  return [...map.values()].sort((a, b) => b.sortKey - a.sortKey);
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
