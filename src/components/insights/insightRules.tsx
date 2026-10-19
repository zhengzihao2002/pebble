import { AlertTriangle, CalendarCheck, CalendarClock, Coins, Copy, CreditCard, Moon, Repeat, Target, TrendingDown, TrendingUp } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cardStatuses, reminderLevel } from '@/lib/creditCards';
import type { Goal, RecurringRule, Transaction } from '@/types';
import type { Account } from '@/lib/data/mappers';
import { formatCurrency, formatDate } from '@/lib/format';
import { descriptionTitle } from '@/lib/transactionDescription';
import { categoryLabel } from '@/lib/i18n/enumLabels';
import { renderTemplate } from '@/lib/i18n/RichText';
import type { Dictionary, Locale } from '@/lib/i18n';
import { placeKey } from './shared';

/** Starting values for a new schedule from a possible subscription. */
export interface SchedulePrefill {
  description: string;
  category: string;
  accountId: string;
  amount: number;
  startDate: string;
}

/**
 * Where a note sits on the page. 'urgent': act now (card overdue or due
 * within a day, possible duplicates). 'review': worth a look (other card
 * reminders, subscriptions, price changes, unusual charges, small things,
 * goal pace, quiet accounts). 'good': going well, or simply good to know
 * (no-spend days, below usual, yearly scheduled total). Grouping never
 * changes the order inside a group, nor any id.
 */
export type InsightGroup = 'urgent' | 'review' | 'good';

export interface Insight {
  id: string;
  group: InsightGroup;
  icon: LucideIcon;
  tone: string;
  title: string;
  body: ReactNode;
  action?: { label: string; onClick?: () => void; href?: string };
}

const pad = (n: number) => String(n).padStart(2, '0');
const DAY_MS = 86_400_000;
const dayNum = (ymd: string) => Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10)) / DAY_MS;
const ymdOf = (dt: Date) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const amt = (x: Transaction) => Math.abs(x.amount);
const byDate = (a: Transaction, b: Transaction) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
/** Every gap between consecutive charges is roughly a month. */
const monthly = (xs: Transaction[]) => xs.slice(1).every((x, i) => {
  const g = dayNum(x.date) - dayNum(xs[i].date);
  return g >= 25 && g <= 35;
});

/** How many times a year each schedule frequency repeats. */
const PER_YEAR: Record<string, number> = { once: 0, weekly: 52, biweekly: 26, monthly: 12, yearly: 1 };

export interface BuildInsightsArgs {
  transactions: Transaction[];
  rules: RecurringRule[];
  goals: Goal[];
  accounts: Account[];
  today: string;
  d: Dictionary;
  t: (template: string, vars?: Record<string, string | number>) => string;
  locale: Locale;
  onOpen: (txn: Transaction) => void;
  onCreateSchedule: (prefill: SchedulePrefill) => void;
  onPayOff: (card: Account) => void;
}

/**
 * Fixed, explainable rules over data already on the page - never a guess.
 * Each insight has one action and can be dismissed (per user). Sentences
 * carry amounts, so they blur in privacy mode.
 *
 * Moved here unchanged from WorthKnowing.tsx so the page can show the notes
 * in two places (the attention list and the good-news strip) from one
 * computation. Thresholds, ordering and every id format are exactly as they
 * were: the ids are persisted in insightsDismissed, and changing one would
 * bring back every note a person had dismissed.
 */
export function buildInsights({
  transactions, rules, goals, accounts, today, d, t, locale, onOpen, onCreateSchedule, onPayOff,
}: BuildInsightsArgs): Insight[] {
  const tag = locale === 'zh' ? 'zh-CN' : 'en-US';
  const todayN = dayNum(today);
  const thisMonth = today.slice(0, 7);
  const expenses = transactions.filter((x) => x.type === 'expense' && x.amount < 0);
  const nameOf = (x: Transaction) => descriptionTitle(x.description) || categoryLabel(d, x.category);
  // Names are USER DATA: framed so they read as a title, not part of the sentence.
  const chip = (s: string) => <span className="pb-wk-name">{s}</span>;
  const items: Insight[] = [];

  // Subscriptions and price changes: charges grouped by place over ~7 months.
  const groups = new Map<string, Transaction[]>();
  for (const x of expenses) {
    if (dayNum(x.date) < todayN - 210) continue;
    const k = placeKey(descriptionTitle(x.description));
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(x);
  }
  const scheduled = new Set(
    rules.filter((r) => r.status === 'active' && r.kind === 'expense').map((r) => placeKey(descriptionTitle(r.description))),
  );
  groups.forEach((list, k) => {
    const xs = [...list].sort(byDate);
    if (xs.length < 3) return;
    const last = xs[xs.length - 1];
    if (todayN - dayNum(last.date) > 45) return;

    const tail3 = xs.slice(-3);
    const a3 = tail3.map(amt);
    if (monthly(tail3) && Math.max(...a3) <= Math.min(...a3) * 1.05 && !scheduled.has(k)) {
      // The next expected charge after today, on the same day of the month.
      const y = +last.date.slice(0, 4);
      let m = +last.date.slice(5, 7) - 1;
      const day = +last.date.slice(8, 10);
      let next = last.date;
      while (next <= today) {
        m += 1;
        next = ymdOf(new Date(y, m, Math.min(day, new Date(y, m + 1, 0).getDate())));
      }
      items.push({
        id: `sub:${k}`, group: 'review', icon: Repeat, tone: 'var(--pine)', title: d.insights.subTitle,
        body: renderTemplate(d.insights.subBody, { name: chip(nameOf(last)), amount: formatCurrency(amt(last)) }),
        action: {
          label: d.insights.subAction,
          onClick: () => onCreateSchedule({ description: descriptionTitle(last.description), category: last.category, accountId: last.accountId, amount: amt(last), startDate: next }),
        },
      });
    }

    if (xs.length >= 4) {
      const tail4 = xs.slice(-4);
      const prev = tail4.slice(0, 3).map(amt);
      const from = prev[2];
      const to = amt(last);
      if (monthly(tail4) && Math.max(...prev) <= Math.min(...prev) * 1.01 && Math.abs(to - from) >= 1 && Math.abs(to - from) / from >= 0.03) {
        items.push({
          id: `price:${k}:${last.id}`, group: 'review', icon: TrendingUp, tone: 'var(--gold)', title: d.insights.priceTitle,
          body: renderTemplate(d.insights.priceBody, {
            name: chip(nameOf(last)), from: formatCurrency(from), to: formatCurrency(to),
            month: new Date(+last.date.slice(0, 4), +last.date.slice(5, 7) - 1, 1).toLocaleDateString(tag, { month: 'long' }),
          }),
          action: { label: d.insights.open, onClick: () => onOpen(last) },
        });
      }
    }
  });

  // Unusual charges: at least 3x the category's usual purchase, and $50+.
  const byCat = new Map<string, number[]>();
  for (const x of expenses) {
    if (dayNum(x.date) < todayN - 365) continue;
    if (!byCat.has(x.category)) byCat.set(x.category, []);
    byCat.get(x.category)!.push(amt(x));
  }
  expenses
    .filter((x) => todayN - dayNum(x.date) <= 30)
    .map((x) => {
      const arr = byCat.get(x.category) ?? [];
      if (arr.length < 5) return null;
      const med = median(arr);
      return med > 0 && amt(x) >= 3 * med && amt(x) >= 50 ? { x, ratio: amt(x) / med } : null;
    })
    .filter((v): v is { x: Transaction; ratio: number } => v !== null)
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 3)
    .forEach(({ x, ratio }) => items.push({
      id: `unusual:${x.id}`, group: 'review', icon: AlertTriangle, tone: 'var(--wine)', title: d.insights.unusualTitle,
      body: renderTemplate(d.insights.unusualBody, { amount: formatCurrency(amt(x)), name: chip(nameOf(x)), times: Math.round(ratio), category: categoryLabel(d, x.category) }),
      action: { label: d.insights.open, onClick: () => onOpen(x) },
    }));

  // Possible duplicates: same date, amount, place and account, last 30 days.
  const dups = new Map<string, Transaction[]>();
  for (const x of expenses) {
    if (todayN - dayNum(x.date) > 30) continue;
    const k = placeKey(descriptionTitle(x.description));
    if (!k) continue;
    const key = `${x.date}|${Math.round(amt(x) * 100)}|${k}|${x.accountId}`;
    if (!dups.has(key)) dups.set(key, []);
    dups.get(key)!.push(x);
  }
  dups.forEach((list) => {
    if (list.length < 2) return;
    const first = list[0];
    items.push({
      id: `dup:${list.map((x) => x.id).sort().join(',')}`, group: 'urgent', icon: Copy, tone: 'var(--wine)', title: d.insights.dupTitle,
      body: renderTemplate(d.insights.dupBody, { count: list.length, amount: formatCurrency(amt(first)), name: chip(nameOf(first)), date: formatDate(first.date, locale) }),
      action: { label: d.insights.open, onClick: () => onOpen(first) },
    });
  });

  // Small things add up: the same place 8+ times this month, each $20 or less.
  const small = new Map<string, Transaction[]>();
  for (const x of expenses) {
    if (!x.date.startsWith(thisMonth)) continue;
    const k = placeKey(descriptionTitle(x.description));
    if (!k) continue;
    if (!small.has(k)) small.set(k, []);
    small.get(k)!.push(x);
  }
  [...small.entries()]
    .filter(([, l]) => l.length >= 8 && l.every((x) => amt(x) <= 20))
    .map(([k, l]) => ({ k, l, total: l.reduce((s, x) => s + amt(x), 0) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 2)
    .forEach(({ k, l, total }) => items.push({
      id: `small:${k}:${thisMonth}`, group: 'review', icon: Coins, tone: 'var(--gold)', title: d.insights.smallTitle,
      body: renderTemplate(d.insights.smallBody, { name: chip(nameOf(l[l.length - 1])), count: l.length, amount: formatCurrency(total) }),
    }));

  // Goal pace: what an unreached goal needs per month to hit its date.
  for (const g of goals) {
    if (!g.date || g.current >= g.target || g.date <= today) continue;
    const monthsLeft = Math.max(1, Math.round((dayNum(g.date) - todayN) / 30.44));
    items.push({
      id: `goal:${g.id}:${thisMonth}`, group: 'review', icon: Target, tone: 'var(--pine)', title: d.insights.goalTitle,
      body: renderTemplate(d.insights.goalBody, { name: chip(g.name), amount: formatCurrency((g.target - g.current) / monthsLeft), date: formatDate(g.date, locale) }),
      action: { label: d.insights.goalAction, href: '/goals' },
    });
  }

  // Quiet accounts: active, no transactions for 8+ months.
  const lastByAccount = new Map<string, string>();
  for (const x of transactions) {
    const prev = lastByAccount.get(x.accountId);
    if (!prev || x.date > prev) lastByAccount.set(x.accountId, x.date);
  }
  for (const a of accounts) {
    if (a.status !== 'active') continue;
    const last = lastByAccount.get(a.id);
    if (!last || todayN - dayNum(last) < 240) continue;
    items.push({
      id: `dormant:${a.id}:${last}`, group: 'review', icon: Moon, tone: 'var(--ink-soft)', title: d.insights.dormantTitle,
      body: renderTemplate(d.insights.dormantBody, { name: chip(a.name), date: formatDate(last, locale) }),
      action: { label: d.insights.dormantAction, href: '/settings' },
    });
  }

  // --- Positive and neutral notes. They come after the warnings above. ---
  const ty = +today.slice(0, 4);
  const tm = +today.slice(5, 7) - 1;
  const td = +today.slice(8, 10);
  // Day-to-day spending: scheduled payments land in lumps and would mislead.
  const dayToDay = expenses.filter((x) => !x.recurringRuleId);

  // No-spend days this month, up to yesterday.
  const spentOn = new Set(dayToDay.filter((x) => x.date.startsWith(thisMonth) && x.date < today).map((x) => x.date));
  const elapsed = td - 1;
  const noSpend = elapsed - spentOn.size;
  // Only while logging is active: some day-to-day spending in the last 30 days.
  const logging = dayToDay.some((x) => x.date < today && todayN - dayNum(x.date) <= 30);
  if (noSpend >= 3 && logging) {
    let run = 0;
    let longest = 0;
    for (let day = 1; day <= elapsed; day += 1) {
      if (spentOn.has(`${thisMonth}-${pad(day)}`)) run = 0;
      else { run += 1; longest = Math.max(longest, run); }
    }
    items.push({
      id: `nospend:${thisMonth}`, group: 'good', icon: CalendarCheck, tone: 'var(--pine)', title: d.insights.noSpendTitle,
      body: t(d.insights.noSpendBody, { count: noSpend }) + (longest >= 2 ? t(d.insights.noSpendStreak, { streak: longest }) : ''),
    });
  }

  // Below usual: a category 25%+ under its pace from the last 3 complete
  // months. Needs a week into the month and 3 full months of history.
  const monthsBack = [1, 2, 3].map((n) => ymdOf(new Date(ty, tm - n, 1)).slice(0, 7));
  const earliestDate = transactions.reduce<string | null>((acc, x) => (acc === null || x.date < acc ? x.date : acc), null);
  if (td >= 7 && earliestDate !== null && earliestDate <= `${monthsBack[2]}-01`) {
    const frac = td / new Date(ty, tm + 1, 0).getDate();
    const totals = new Map<string, { now: number; past: number }>();
    for (const x of dayToDay) {
      const mk = x.date.slice(0, 7);
      const isNow = mk === thisMonth && x.date <= today;
      if (!isNow && !monthsBack.includes(mk)) continue;
      const e = totals.get(x.category) ?? { now: 0, past: 0 };
      if (isNow) e.now += amt(x);
      else e.past += amt(x);
      totals.set(x.category, e);
    }
    let low: { cat: string; now: number; expected: number } | null = null;
    for (const [cat, v] of [...totals.entries()]) {
      const usual = v.past / 3;
      if (usual < 50) continue;
      const expected = usual * frac;
      if (v.now > expected * 0.75) continue;
      if (!low || expected - v.now > low.expected - low.now) low = { cat, now: v.now, expected };
    }
    if (low) {
      items.push({
        id: `below:${low.cat}:${thisMonth}`, group: 'good', icon: TrendingDown, tone: 'var(--pine)', title: d.insights.belowTitle,
        body: t(d.insights.belowBody, {
          category: categoryLabel(d, low.cat), pct: `${Math.round((1 - low.now / low.expected) * 100)}%`,
          amount: formatCurrency(low.now), expected: formatCurrency(low.expected),
        }),
      });
    }
  }

  // Scheduled payments per year: active spending schedules that have not ended.
  let perYearTotal = 0;
  let counted = 0;
  for (const r of rules) {
    if (r.status !== 'active' || r.kind !== 'expense' || (r.endDate && r.endDate < today)) continue;
    const n = PER_YEAR[r.frequency as string];
    if (!n) continue;
    perYearTotal += Math.abs(r.amount) * n;
    counted += 1;
  }
  if (counted >= 2) {
    items.push({
      id: `yearly:${today.slice(0, 4)}`, group: 'good', icon: CalendarClock, tone: 'var(--ink-soft)', title: d.insights.yearlyTitle,
      body: t(d.insights.yearlyBody, { count: counted, amount: formatCurrency(perYearTotal) }),
      action: { label: d.insights.yearlyAction, href: '/scheduled' },
    });
  }

  // Credit card payments: pinned ABOVE every other note. One id per card, due
  // date and level, so dismissing the 7-day reminder leaves the later ones.
  // Overdue and due-within-a-day are urgent; the 3- and 7-day notes are a look.
  const cardNotes: Insight[] = [];
  for (const s of cardStatuses(accounts, transactions, today)) {
    const lvl = reminderLevel(s);
    if (!lvl) continue;
    const name = chip(s.card.last4 ? `${s.card.name} ····${s.card.last4}` : s.card.name);
    const overdue = lvl === 'overdue';
    cardNotes.push({
      id: `card:${s.card.id}:${overdue ? s.previous : s.next}:${lvl}`,
      group: overdue || lvl === 'd1' ? 'urgent' : 'review',
      icon: CreditCard,
      tone: overdue ? 'var(--wine)' : lvl === 'd1' ? 'var(--gold)' : 'var(--ink-soft)',
      title: overdue ? d.insights.cardOverdueTitle : d.insights.cardDueTitle,
      body: overdue
        ? renderTemplate(d.insights.cardOverdueBody, { name, amount: formatCurrency(s.overdue), date: formatDate(s.previous, locale) })
        : renderTemplate(d.insights.cardDueBody, { name, amount: formatCurrency(s.dueNow), date: formatDate(s.next, locale) }),
      action: { label: d.accounts.payOffAction, onClick: () => onPayOff(s.card) },
    });
  }
  items.unshift(...cardNotes);

  return items;
}
