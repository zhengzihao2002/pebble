/**
 * Finds payments that repeat on a schedule but have no recurring rule yet:
 * the Dashboard's "Looks recurring" card.
 *
 * Pure and deterministic: every date arrives as a 'YYYY-MM-DD' string
 * (`today` included - no clock reads, no Date.now()), and all day arithmetic
 * is in UTC integer space, so the server and the browser agree and a DST shift
 * can never move a result.
 *
 * Insights has a narrower detector (monthly expenses, exactly three charges
 * within 5%) that stays as it is, ids included; this one groups by the SAME
 * place key (placeKey) so the two agree on what "the same place" means.
 *
 * HOW A CANDIDATE IS FOUND
 *  1. Group transactions by (kind, place). Rows that already came from a rule
 *     (recurringRuleId) are not evidence of a habit - they ARE the schedule -
 *     and places a rule already covers (active or paused, same kind) are left
 *     alone.
 *  2. Several charges on one day count as one occurrence (summed), so a
 *     doubled-up day does not read as a 0-day gap.
 *  3. The cadence comes from the most recent gap, and the run is the longest
 *     stretch of consecutive occurrences, ending at the latest one, whose
 *     every gap fits that cadence. Older, irregular history does not disqualify
 *     a habit that has since settled.
 *  4. The run is then trimmed to its most recent stretch whose amounts sit
 *     within tolerance of their median (a price rise starts a new stretch).
 *  5. The latest occurrence must be recent enough that the habit is live.
 */
import type { RecurringFrequency, RecurringKind, RecurringRule, Transaction } from '@/types';
import { descriptionTitle } from '@/lib/transactionDescription';
import { daysInMonth } from './occurrences';
import { placeKey } from './placeKey';

export type DetectedFrequency = Exclude<RecurringFrequency, 'once'>;

export interface RecurringCandidate {
  kind: RecurringKind;
  /** The place key (placeKey of the title); with `kind` it identifies the candidate. */
  key: string;
  /** The latest occurrence's title, as the person wrote it. */
  title: string;
  category: string;
  accountId: string;
  /** Typical amount, signed as the app stores it: negative for an expense, net (positive) for income. */
  amount: number;
  /** Income only: the typical gross, or the net when no gross was recorded. */
  grossAmount: number | null;
  frequency: DetectedFrequency;
  /** The next expected date, strictly after `today`. */
  nextDate: string;
  /** Occurrences in the matching run (same-day charges count once). */
  occurrences: number;
  /** 0..1: more occurrences, steadier gaps and amounts, and a fresher last one score higher. */
  confidence: number;
}

/** How far back the weekly, biweekly and monthly habits are read. */
export const LOOKBACK_DAYS = 400;
/**
 * Yearly habits are read further back: two charges a year apart cannot both
 * sit inside a 400-day window unless the later one is under five weeks old,
 * which would hide an insurance bill paid eight months ago. The last
 * occurrence must still be within LOOKBACK_DAYS.
 */
export const YEARLY_LOOKBACK_DAYS = 800;
/** Most candidates returned. */
export const MAX_CANDIDATES = 5;

const DAY_MS = 86_400_000;
const dayNum = (ymd: string) => Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10)) / DAY_MS;
const monthIndex = (ymd: string) => +ymd.slice(0, 4) * 12 + +ymd.slice(5, 7) - 1;
const pad = (n: number) => String(n).padStart(2, '0');
const ymdOfUtc = (n: number) => {
  const dt = new Date(n * DAY_MS);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
};

interface Cadence {
  /** Fewest occurrences that make a habit. */
  min: number;
  /** Nominal days between occurrences. */
  interval: number;
  /** Occurrences at which the count stops adding confidence. */
  full: number;
  /** Largest believable wobble (days) for the regularity score. */
  wobble: number;
  /** Do two consecutive occurrences (earlier, later) belong to this cadence? */
  fits: (a: string, b: string) => boolean;
}

const gapOf = (a: string, b: string) => dayNum(b) - dayNum(a);

/** Two days of the month are "the same" within 3 days, or both at a month's end. */
function sameDayOfMonth(a: string, b: string): boolean {
  const da = +a.slice(8, 10);
  const db = +b.slice(8, 10);
  if (Math.abs(da - db) <= 3) return true;
  // The 31st paid on the 28th of a short month, and back.
  const endA = da === daysInMonth(+a.slice(0, 4), +a.slice(5, 7));
  const endB = db === daysInMonth(+b.slice(0, 4), +b.slice(5, 7));
  return (endB && da >= db) || (endA && db >= da);
}

const CADENCES: Record<DetectedFrequency, Cadence> = {
  weekly: { min: 3, interval: 7, full: 8, wobble: 1, fits: (a, b) => { const g = gapOf(a, b); return g >= 6 && g <= 8; } },
  biweekly: { min: 3, interval: 14, full: 6, wobble: 2, fits: (a, b) => { const g = gapOf(a, b); return g >= 12 && g <= 16; } },
  monthly: {
    min: 3, interval: 30.44, full: 6, wobble: 3,
    // 28-31 days apart, in consecutive calendar months, on about the same day.
    fits: (a, b) => { const g = gapOf(a, b); return g >= 28 && g <= 31 && monthIndex(b) - monthIndex(a) === 1 && sameDayOfMonth(a, b); },
  },
  yearly: { min: 2, interval: 365, full: 3, wobble: 10, fits: (a, b) => { const g = gapOf(a, b); return g >= 355 && g <= 375; } },
};
const ORDER: DetectedFrequency[] = ['weekly', 'biweekly', 'monthly', 'yearly'];

/** Amounts may sit this far from their median: bills are steady, paychecks are not. */
const TOLERANCE: Record<RecurringKind, number> = { expense: 0.08, income: 0.15 };

interface Occurrence {
  date: string;
  /** Positive magnitude. */
  amount: number;
  gross: number;
  category: string;
  accountId: string;
  title: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** The next date after `today` this habit falls on. */
function nextAfter(freq: DetectedFrequency, run: Occurrence[], today: string): string {
  const last = run[run.length - 1].date;
  const todayN = dayNum(today);
  if (freq === 'weekly' || freq === 'biweekly') {
    const step = freq === 'weekly' ? 7 : 14;
    const k = Math.floor((todayN - dayNum(last)) / step) + 1;
    return ymdOfUtc(dayNum(last) + step * Math.max(1, k));
  }
  if (freq === 'monthly') {
    // The usual day of the month (median, so one late posting does not move
    // it), clamped to short months.
    const day = Math.round(median(run.map((o) => +o.date.slice(8, 10))));
    let idx = monthIndex(last);
    for (;;) {
      idx += 1;
      const y = Math.floor(idx / 12);
      const m = (idx % 12) + 1;
      const next = `${y}-${pad(m)}-${pad(Math.min(day, daysInMonth(y, m)))}`;
      if (next > today) return next;
    }
  }
  // Yearly: the same month and day, Feb 29 falling back to Feb 28.
  const month = +last.slice(5, 7);
  const day = +last.slice(8, 10);
  let y = +last.slice(0, 4);
  for (;;) {
    y += 1;
    const next = `${y}-${pad(month)}-${pad(Math.min(day, daysInMonth(y, month)))}`;
    if (next > today) return next;
  }
}

export function detectRecurring(
  transactions: readonly Transaction[],
  rules: readonly RecurringRule[],
  today: string,
  /** `${kind}|${key}` of candidates the person dismissed; left out BEFORE the cap, so they never use up its places. */
  skip?: ReadonlySet<string>,
): RecurringCandidate[] {
  const todayN = dayNum(today);

  // Places a live schedule already covers: active or paused, same kind.
  const covered = new Set<string>();
  for (const r of rules) {
    if (r.status === 'deleted') continue;
    covered.add(`${r.kind}|${placeKey(descriptionTitle(r.description))}`);
  }

  const groups = new Map<string, { kind: RecurringKind; key: string; rows: Transaction[] }>();
  for (const x of transactions) {
    if (x.recurringRuleId) continue;
    const kind: RecurringKind = x.type;
    if (kind === 'expense' ? !(x.amount < 0) : !(x.amount > 0)) continue;
    const age = todayN - dayNum(x.date);
    if (age < 0 || age > YEARLY_LOOKBACK_DAYS) continue;
    const key = placeKey(descriptionTitle(x.description));
    if (!key) continue;
    const id = `${kind}|${key}`;
    if (covered.has(id) || skip?.has(id)) continue;
    const g = groups.get(id);
    if (g) g.rows.push(x);
    else groups.set(id, { kind, key, rows: [x] });
  }

  const found: RecurringCandidate[] = [];
  groups.forEach(({ kind, key, rows }) => {
    // Oldest first, ties by id, so the result never depends on input order.
    rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    // One occurrence per day; the day's last row names it.
    const occ: Occurrence[] = [];
    for (const x of rows) {
      const gross = x.type === 'income' ? x.grossAmount : Math.abs(x.amount);
      const prev = occ[occ.length - 1];
      if (prev && prev.date === x.date) {
        prev.amount += Math.abs(x.amount);
        prev.gross += gross;
        prev.category = x.category;
        prev.accountId = x.accountId;
        prev.title = descriptionTitle(x.description);
      } else {
        occ.push({ date: x.date, amount: Math.abs(x.amount), gross, category: x.category, accountId: x.accountId, title: descriptionTitle(x.description) });
      }
    }
    if (occ.length < 2) return;

    // The cadence of the latest gap.
    const lastOcc = occ[occ.length - 1];
    const freq = ORDER.find((f) => CADENCES[f].fits(occ[occ.length - 2].date, lastOcc.date));
    if (!freq) return;
    const cad = CADENCES[freq];

    // Live: the latest occurrence within 1.5 intervals (and 400 days at most).
    const since = todayN - dayNum(lastOcc.date);
    if (since > Math.min(cad.interval * 1.5, LOOKBACK_DAYS)) return;

    // The run: consecutive occurrences, newest backwards, that keep the cadence.
    let start = occ.length - 1;
    const horizon = freq === 'yearly' ? YEARLY_LOOKBACK_DAYS : LOOKBACK_DAYS;
    while (start > 0 && cad.fits(occ[start - 1].date, occ[start].date) && todayN - dayNum(occ[start - 1].date) <= horizon) start -= 1;

    // Not a habit that merely wobbles: a weekly or fortnightly run cut short
    // by a gap NEAR its interval (a twice-a-month paycheck reads as 14,14,14
    // then 17) is irregular, not new. A real pause is far longer or shorter.
    if ((freq === 'weekly' || freq === 'biweekly') && start > 0 && !cad.fits(occ[start - 1].date, occ[start].date)) {
      const g = gapOf(occ[start - 1].date, occ[start].date);
      if (g >= cad.interval * 0.6 && g <= cad.interval * 1.4) return;
    }

    // The newest stretch of the run whose amounts are steady.
    const tol = TOLERANCE[kind];
    let run: Occurrence[] | null = null;
    let med = 0;
    for (let from = start; from <= occ.length - cad.min; from += 1) {
      const slice = occ.slice(from);
      const m = median(slice.map((o) => o.amount));
      if (m > 0 && slice.every((o) => Math.abs(o.amount - m) <= tol * m + 0.005)) { run = slice; med = m; break; }
    }
    if (!run) return;
    const steady: Occurrence[] = run;
    // Pocket change is not a schedule worth offering.
    if (round2(med) < 1) return;

    // Confidence: how many, how regular, how steady, how fresh.
    const gaps = steady.slice(1).map((o, i) => gapOf(steady[i].date, o.date));
    const usualDay = Math.round(median(steady.map((o) => +o.date.slice(8, 10))));
    const regular = freq === 'monthly'
      ? steady.reduce((s, o) => s + Math.abs(+o.date.slice(8, 10) - usualDay), 0) / steady.length
      : gaps.reduce((s, g) => s + Math.abs(g - cad.interval), 0) / gaps.length;
    const regularity = 1 - Math.min(1, regular / (cad.wobble + 1));
    const steadiness = 1 - Math.min(1, Math.max(...steady.map((o) => Math.abs(o.amount - med) / med)) / tol);
    const count = Math.min(1, steady.length / cad.full);
    const overdue = since > cad.interval * 1.15 ? 0.15 : 0;
    const confidence = Math.max(0, round2(0.5 * count + 0.25 * regularity + 0.25 * steadiness - overdue));

    const last = steady[steady.length - 1];
    const typical = round2(med);
    found.push({
      kind,
      key,
      title: last.title,
      category: last.category,
      accountId: last.accountId,
      amount: kind === 'expense' ? -typical : typical,
      grossAmount: kind === 'income' ? round2(Math.max(median(steady.map((o) => o.gross)), typical)) : null,
      frequency: freq,
      nextDate: nextAfter(freq, steady, today),
      occurrences: steady.length,
      confidence,
    });
  });

  found.sort((a, b) =>
    b.confidence - a.confidence
    || Math.abs(b.amount) - Math.abs(a.amount)
    || (a.kind + a.key < b.kind + b.key ? -1 : a.kind + a.key > b.kind + b.key ? 1 : 0));
  return found.slice(0, MAX_CANDIDATES);
}
