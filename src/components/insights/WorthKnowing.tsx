'use client';

import Link from 'next/link';
import { AlertTriangle, Coins, Copy, Moon, Repeat, Target, TrendingUp, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Goal, RecurringRule, Transaction } from '@/types';
import type { Account } from '@/lib/data/mappers';
import { formatCurrency, formatDate } from '@/lib/format';
import { descriptionTitle } from '@/lib/transactionDescription';
import { categoryLabel } from '@/lib/i18n/enumLabels';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { usePebbleStore } from '@/store/usePebbleStore';
import { placeKey } from './TopPlaces';

/** Starting values for a new schedule from a possible subscription. */
export interface SchedulePrefill {
  description: string;
  category: string;
  accountId: string;
  amount: number;
  startDate: string;
}

interface Insight {
  id: string;
  icon: LucideIcon;
  tone: string;
  title: string;
  body: string;
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

/**
 * Fixed, explainable rules over data already on the page - never a guess.
 * Each insight has one action and can be dismissed (per user). Sentences
 * carry amounts, so they blur in privacy mode.
 */
export function WorthKnowing({ transactions, rules, goals, accounts, today, onOpen, onCreateSchedule }: {
  transactions: Transaction[];
  rules: RecurringRule[];
  goals: Goal[];
  accounts: Account[];
  today: string | null;
  onOpen: (txn: Transaction) => void;
  onCreateSchedule: (prefill: SchedulePrefill) => void;
}) {
  const { d, t, locale } = useTranslation();
  const dismissed = usePebbleStore((s) => s.insightsDismissed);
  const dismiss = usePebbleStore((s) => s.dismissInsight);
  if (!today) return <section className="card" style={{ padding: '1.25rem 1.5rem', minHeight: 160 }} aria-busy="true" />;

  const tag = locale === 'zh' ? 'zh-CN' : 'en-US';
  const todayN = dayNum(today);
  const thisMonth = today.slice(0, 7);
  const expenses = transactions.filter((x) => x.type === 'expense' && x.amount < 0);
  const nameOf = (x: Transaction) => descriptionTitle(x.description) || categoryLabel(d, x.category);
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
      let y = +last.date.slice(0, 4);
      let m = +last.date.slice(5, 7) - 1;
      const day = +last.date.slice(8, 10);
      let next = last.date;
      while (next <= today) {
        m += 1;
        next = ymdOf(new Date(y, m, Math.min(day, new Date(y, m + 1, 0).getDate())));
      }
      y = 0;
      items.push({
        id: `sub:${k}`, icon: Repeat, tone: 'var(--pine)', title: d.insights.subTitle,
        body: t(d.insights.subBody, { name: nameOf(last), amount: formatCurrency(amt(last)) }),
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
          id: `price:${k}:${last.id}`, icon: TrendingUp, tone: 'var(--gold)', title: d.insights.priceTitle,
          body: t(d.insights.priceBody, {
            name: nameOf(last), from: formatCurrency(from), to: formatCurrency(to),
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
      id: `unusual:${x.id}`, icon: AlertTriangle, tone: 'var(--wine)', title: d.insights.unusualTitle,
      body: t(d.insights.unusualBody, { amount: formatCurrency(amt(x)), name: nameOf(x), times: Math.round(ratio), category: categoryLabel(d, x.category) }),
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
      id: `dup:${list.map((x) => x.id).sort().join(',')}`, icon: Copy, tone: 'var(--wine)', title: d.insights.dupTitle,
      body: t(d.insights.dupBody, { count: list.length, amount: formatCurrency(amt(first)), name: nameOf(first), date: formatDate(first.date, locale) }),
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
      id: `small:${k}:${thisMonth}`, icon: Coins, tone: 'var(--gold)', title: d.insights.smallTitle,
      body: t(d.insights.smallBody, { name: nameOf(l[l.length - 1]), count: l.length, amount: formatCurrency(total) }),
    }));

  // Goal pace: what an unreached goal needs per month to hit its date.
  for (const g of goals) {
    if (!g.date || g.current >= g.target || g.date <= today) continue;
    const monthsLeft = Math.max(1, Math.round((dayNum(g.date) - todayN) / 30.44));
    items.push({
      id: `goal:${g.id}:${thisMonth}`, icon: Target, tone: 'var(--pine)', title: d.insights.goalTitle,
      body: t(d.insights.goalBody, { name: g.name, amount: formatCurrency((g.target - g.current) / monthsLeft), date: formatDate(g.date, locale) }),
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
      id: `dormant:${a.id}:${last}`, icon: Moon, tone: 'var(--ink-soft)', title: d.insights.dormantTitle,
      body: t(d.insights.dormantBody, { name: a.name, date: formatDate(last, locale) }),
      action: { label: d.insights.dormantAction, href: '/settings' },
    });
  }

  const shown = items.filter((i) => !(dismissed ?? []).includes(i.id));
  const actionStyle: React.CSSProperties = { padding: '0.35rem 0.8rem', fontSize: '0.78rem', textDecoration: 'none', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center' };

  return (
    <section className="card" style={{ padding: '1.25rem 1.5rem' }} aria-labelledby="pb-worth-title">
      <h3 id="pb-worth-title" style={{ fontWeight: 600, fontSize: '0.95rem', margin: 0 }}>{d.insights.wkTitle}</h3>
      <p style={{ margin: '0.2rem 0 0.9rem', fontSize: '0.78rem', color: 'var(--ink-soft)' }}>{d.insights.wkHint}</p>
      {shown.length === 0 ? (
        <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--ink-soft)' }}>{d.insights.wkEmpty}</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {shown.map((i, n) => {
            const Icon = i.icon;
            return (
              <li key={i.id} className="goal-step" style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.75rem 0', borderTop: n === 0 ? 'none' : '1px solid var(--line)' }}>
                <span aria-hidden="true" style={{ width: 32, height: 32, borderRadius: '0.6rem', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: i.tone, backgroundColor: `color-mix(in srgb, ${i.tone} 14%, transparent)` }}>
                  <Icon size={16} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: i.tone }}>{i.title}</span>
                  {/* Names are USER DATA. Amounts are inside, so the line blurs in privacy mode. */}
                  <span className="pb-money" style={{ display: 'block', fontSize: '0.86rem', lineHeight: 1.45, marginTop: 2 }}>{i.body}</span>
                  {i.action && (
                    <span style={{ display: 'inline-block', marginTop: '0.45rem' }}>
                      {i.action.href ? (
                        <Link href={i.action.href} prefetch={false} className="pill" style={actionStyle}>{i.action.label}</Link>
                      ) : (
                        <button type="button" className="pill" onClick={i.action.onClick} style={actionStyle}>{i.action.label}</button>
                      )}
                    </span>
                  )}
                </span>
                <button
                  type="button" className="icon-btn" onClick={() => dismiss(i.id)}
                  aria-label={d.insights.dismiss} title={d.insights.dismiss}
                  style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <X size={15} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
