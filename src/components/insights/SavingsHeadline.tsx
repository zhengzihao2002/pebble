'use client';

import type { Transaction } from '@/types';
import { isSideCash } from '@/lib/stats';
import { formatCurrency, formatMonthYear } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';

const MAX_MONTHS = 12;
const wholeDollars = (v: number) => formatCurrency(Math.round(v)).replace(/\.00$/, '');
const monthIndex = (ymd: string) => Number(ymd.slice(0, 4)) * 12 + Number(ymd.slice(5, 7)) - 1;

/**
 * The page's headline: how much of your income you kept over the last
 * complete months (up to 12), with the range spelled out. Complete months
 * only, so the figure does not swing day to day early in a month - which is
 * why it can differ from the Dashboard's "last 12 months", which includes the
 * current month. Same rules as the Dashboard otherwise: income excludes side
 * cash, spending is every negative amount; transfers never reach this list.
 * The first month counts only if the history starts on the 1st. Hidden with
 * no complete month or no income. Figure and sentence blur in privacy mode.
 */
export function SavingsHeadline({ transactions, today }: { transactions: Transaction[]; today: string | null }) {
  const { d, t, locale } = useTranslation();
  if (!today || transactions.length === 0) return null;

  const earliest = transactions.reduce((m, x) => (x.date < m ? x.date : m), transactions[0].date);
  const firstComplete = monthIndex(earliest) + (earliest.endsWith('-01') ? 0 : 1);
  const last = monthIndex(today) - 1;
  const first = Math.max(firstComplete, last - (MAX_MONTHS - 1));
  const months = last - first + 1;
  if (months < 1) return null;

  let income = 0;
  let spending = 0;
  for (const x of transactions) {
    const k = monthIndex(x.date);
    if (k < first || k > last) continue;
    if (x.amount < 0) spending += -x.amount;
    else if (x.type === 'income' && !isSideCash(x)) income += x.amount;
  }
  if (income <= 0) return null;

  const kept = income - spending;
  const good = kept >= 0;
  const span = months === 1 ? d.insights.savedSpanOne : t(d.insights.savedSpanMany, { months: String(months) });
  const sentence = good
    ? t(d.insights.savedKept, { span, pct: `${Math.round((kept / income) * 100)}%`, amount: wholeDollars(kept / months) })
    : t(d.insights.savedOver, { span, amount: wholeDollars(-kept), perMonth: wholeDollars(-kept / months) });

  const toLabel = formatMonthYear(Math.floor(last / 12), last % 12, locale);
  const range = months === 1 ? toLabel : `${formatMonthYear(Math.floor(first / 12), first % 12, locale)} – ${toLabel}`;
  const label = months === 1 ? d.insights.savedLabelOne : t(d.insights.savedLabelMany, { months: String(months) });
  const figure = good ? `${Math.round((kept / income) * 100)}%` : wholeDollars(kept);
  const tone = good ? 'var(--pine)' : 'var(--wine)';
  const tint = `color-mix(in srgb, ${tone} 8%, transparent)`;

  return (
    <section className="card" style={{ padding: '1.25rem 1.5rem', backgroundImage: `linear-gradient(${tint}, ${tint})` }}>
      <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--ink-soft)' }}>{label} · {range}</p>
      <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.4rem 1.25rem', marginTop: '0.35rem' }}>
        <span className="font-display pb-money" style={{ fontSize: 'clamp(2rem, 5vw, 2.6rem)', lineHeight: 1.05, fontWeight: 600, color: tone }}>{figure}</span>
        <p className="pb-money" style={{ margin: 0, flex: '1 1 18rem', fontSize: '0.95rem', lineHeight: 1.5 }}>{sentence}</p>
      </div>
    </section>
  );
}
