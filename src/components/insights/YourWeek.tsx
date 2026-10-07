'use client';

import type { Transaction } from '@/types';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';

const pad = (n: number) => String(n).padStart(2, '0');
/** 12 full weeks, so every weekday is counted the same number of times. */
const WINDOW_DAYS = 84;
const MIN_PURCHASES = 10;
const MIN_DAYS = 28;

const toYmd = (dt: Date) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
const fromYmd = (s: string) => new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
const wholeDollars = (v: number) => formatCurrency(Math.round(v)).replace(/\.00$/, '');

/**
 * Average spending on each day of the week over the last 12 weeks. Spending
 * only, and scheduled payments are left out (rent would win every time); a
 * small note on the card says so. Each weekday's total is divided by how many
 * of that weekday fall in the history actually available, so a new account is
 * not understated. Amounts blur in privacy mode.
 */
export function YourWeek({ transactions, today }: { transactions: Transaction[]; today: string | null }) {
  const { d, t, locale } = useTranslation();
  if (!today) return <section className="card" style={{ padding: '1.25rem 1.5rem', minHeight: 260 }} aria-busy="true" />;

  const end = fromYmd(today);
  const windowStart = toYmd(new Date(end.getFullYear(), end.getMonth(), end.getDate() - (WINDOW_DAYS - 1)));
  const earliest = transactions.reduce<string | null>((m, x) => (m === null || x.date < m ? x.date : m), null);
  const startYmd = earliest && earliest > windowStart ? earliest : windowStart;

  const totals = [0, 0, 0, 0, 0, 0, 0];
  const occurrences = [0, 0, 0, 0, 0, 0, 0];
  let purchases = 0;
  for (const x of transactions) {
    if (x.type !== 'expense' || x.amount >= 0 || x.recurringRuleId || x.date < startYmd || x.date > today) continue;
    totals[fromYmd(x.date).getDay()] += Math.abs(x.amount);
    purchases += 1;
  }
  const cursor = fromYmd(startYmd);
  while (toYmd(cursor) <= today) {
    occurrences[cursor.getDay()] += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  const historyDays = occurrences.reduce((a, b) => a + b, 0);
  const enough = purchases >= MIN_PURCHASES && historyDays >= MIN_DAYS;

  const weekStart = locale === 'zh' ? 1 : 0;
  const order = Array.from({ length: 7 }, (_, i) => (weekStart + i) % 7);
  const avg = order.map((wd) => (occurrences[wd] ? totals[wd] / occurrences[wd] : 0));
  const max = Math.max(0, ...avg);
  const topIdx = avg.indexOf(max);
  const others = avg.filter((_, i) => i !== topIdx);
  const rest = others.reduce((a, b) => a + b, 0) / others.length;
  const ratio = rest > 0 ? max / rest : 0;

  const tag = locale === 'zh' ? 'zh-CN' : 'en-US';
  // 1 January 2023 was a Sunday.
  const dayName = (wd: number, style: 'narrow' | 'long') =>
    new Date(2023, 0, 1 + wd).toLocaleDateString(tag, { weekday: style });
  const sentence = ratio >= 1.2
    ? t(d.insights.yourWeekTop, { day: dayName(order[topIdx], 'long'), amount: wholeDollars(max), ratio: ratio.toFixed(1) })
    : d.insights.yourWeekEven;

  return (
    <section className="card" style={{ padding: '1.25rem 1.5rem' }} aria-labelledby="pb-week-title">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div>
          <h3 id="pb-week-title" style={{ fontWeight: 600, fontSize: '0.95rem', margin: 0 }}>{d.insights.yourWeekTitle}</h3>
          <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: 'var(--ink-soft)' }}>{d.insights.yourWeekHint}</p>
        </div>
        <span style={{ fontSize: '0.66rem', color: 'var(--ink-soft)', opacity: 0.85 }}>{d.insights.yourWeekNote}</span>
      </div>

      {!enough ? (
        <p style={{ margin: '0.9rem 0 0', fontSize: '0.84rem', color: 'var(--ink-soft)' }}>{d.insights.yourWeekEmpty}</p>
      ) : (
        <>
          <p className="pb-money" style={{ margin: '0.9rem 0 0', fontSize: '0.86rem', lineHeight: 1.45 }}>{sentence}</p>
          <div
            className="pb-chart-fade" role="img"
            aria-label={order.map((wd, i) => `${dayName(wd, 'long')}: ${wholeDollars(avg[i])}`).join(', ')}
            style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6, height: 150, marginTop: '1rem' }}
          >
            {avg.map((v, i) => {
              const top = i === topIdx;
              return (
                <div key={order[i]} style={{ display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr) auto', justifyItems: 'center', gap: 4, minWidth: 0, height: '100%' }}>
                  <span className="font-mono-tab" style={{ fontSize: '0.62rem', whiteSpace: 'nowrap', color: top ? 'var(--ink)' : 'var(--ink-soft)', fontWeight: top ? 600 : 400 }}>{wholeDollars(v)}</span>
                  <div style={{ width: '100%', maxWidth: 28, height: '100%', display: 'flex', alignItems: 'flex-end' }}>
                    <div style={{
                      width: '100%', height: `${max > 0 ? Math.max(3, (v / max) * 100) : 3}%`, borderRadius: '5px 5px 2px 2px',
                      backgroundColor: top ? 'var(--pine)' : 'color-mix(in srgb, var(--ink) 16%, transparent)',
                    }} />
                  </div>
                  <span style={{ fontSize: '0.7rem', color: top ? 'var(--ink)' : 'var(--ink-soft)', fontWeight: top ? 600 : 400 }}>{dayName(order[i], 'narrow')}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
