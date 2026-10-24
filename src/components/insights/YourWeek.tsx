'use client';

import { BarChart3, CalendarRange } from 'lucide-react';
import type { Transaction } from '@/types';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { SectionHeader } from '@/components/kit/SectionHeader';
import { EmptyState } from '@/components/kit/EmptyState';
import { Skeleton } from '@/components/kit/Skeleton';
import { AddTransactionAction } from './AddTransactionAction';

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
 *
 * Refined: every bar stands on a faint full-height track (so a quiet day
 * still reads as a day), a dashed "typical day" line at the average of the
 * other six days makes the sentence's "n times" visible, and the top day
 * carries a small "n×" chip. Short weekday names when the card has room
 * (narrow initials were ambiguous: S/S, T/T), initials below that; the
 * amounts above the bars hide on a very narrow card but stay in the
 * chart's accessible name. Weekdays against weekends is a two-bar
 * comparison instead of two figures.
 */
export function YourWeek({ transactions, today }: { transactions: Transaction[]; today: string | null }) {
  const { d, t, locale } = useTranslation();
  const ux = d.ux.insights;
  const header = (
    <SectionHeader
      id="pb-week-title" icon={BarChart3} title={d.insights.yourWeekTitle} subtitle={d.insights.yourWeekHint}
      actions={<span className="pb-ins-note-chip">{d.insights.yourWeekNote}</span>}
    />
  );
  if (!today) {
    return (
      <section className="card pb-ins-card pb-ins-week" aria-labelledby="pb-week-title" aria-busy="true" style={{ minHeight: 260 }}>
        {header}
        <div className="pb-ins-skel-bars" aria-hidden="true">
          {[52, 34, 70, 48, 62, 40, 28].map((h, i) => <Skeleton key={i} width="100%" height={`${h}%`} radius="6px 6px 2px 2px" />)}
        </div>
      </section>
    );
  }

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
  // Per day of history, same as the bars. Weekdays are Monday to Friday
  // whichever day the week starts on.
  const perDay = (days: number[]) => {
    const n = days.reduce((a, wd) => a + occurrences[wd], 0);
    return n ? days.reduce((a, wd) => a + totals[wd], 0) / n : 0;
  };
  const weekdayAvg = perDay([1, 2, 3, 4, 5]);
  const weekendAvg = perDay([0, 6]);

  const tag = locale === 'zh' ? 'zh-CN' : 'en-US';
  // 1 January 2023 was a Sunday.
  const dayName = (wd: number, style: 'narrow' | 'short' | 'long') =>
    new Date(2023, 0, 1 + wd).toLocaleDateString(tag, { weekday: style });
  const sentence = ratio >= 1.2
    ? t(d.insights.yourWeekTop, {
      day: dayName(order[topIdx], 'long'),
      // Plural for the opening ('Fridays'); Chinese has no plural form.
      days: locale === 'zh' ? dayName(order[topIdx], 'long') : `${dayName(order[topIdx], 'long')}s`,
      amount: wholeDollars(max), ratio: ratio.toFixed(1),
    })
    : d.insights.yourWeekEven;

  // The typical day: the other six days' average, the same `rest` the
  // sentence's ratio is measured against.
  const restPct = max > 0 ? Math.min(100, (rest / max) * 100) : 0;
  const splitMax = Math.max(weekdayAvg, weekendAvg);

  return (
    <section className="card pb-ins-card pb-ins-week" aria-labelledby="pb-week-title">
      {header}
      {!enough ? (
        <div className="pb-ins-fill-empty"><EmptyState
          compact icon={CalendarRange} title={ux.weekNeedsTitle}
          body={<>{ux.weekNeedsBody}<span className="pb-ins-needs-progress pb-tnum">{t(ux.weekNeedsProgress, { purchases: Math.min(purchases, MIN_PURCHASES), minPurchases: MIN_PURCHASES, days: earliest ? Math.min(historyDays, MIN_DAYS) : 0, minDays: MIN_DAYS })}</span></>}
          action={<AddTransactionAction />}
        /></div>
      ) : (
        <>
          <p className="pb-money pb-ins-week-sentence">{sentence}</p>
          <div
            className="pb-chart-fade pb-ins-week-chart" role="img"
            aria-label={order.map((wd, i) => `${dayName(wd, 'long')}: ${wholeDollars(avg[i])}`).join(', ')}
          >
            <div className="pb-ins-week-amts" aria-hidden="true">
              {avg.map((v, i) => <span key={order[i]} className={`font-mono-tab${i === topIdx ? ' is-top' : ''}`}>{wholeDollars(v)}</span>)}
            </div>
            <div className="pb-ins-week-plot" aria-hidden="true">
              <div className="pb-ins-week-area">
              {avg.map((v, i) => (
                <div key={order[i]} className={`pb-ins-week-col${i === topIdx ? ' is-top' : ''}`}>
                  <span className="pb-ins-week-bar" style={{ height: `${max > 0 ? Math.max(3, (v / max) * 100) : 3}%` }}>
                    {i === topIdx && ratio >= 1.2 && <span className="pb-ins-week-chip pb-tnum">{t(ux.ratioChip, { ratio: ratio.toFixed(1) })}</span>}
                  </span>
                </div>
              ))}
              {rest > 0 && <div className="pb-ins-week-typical" style={{ bottom: `${restPct}%` }} />}
              </div>
            </div>
            <div className="pb-ins-week-days" aria-hidden="true">
              {order.map((wd, i) => (
                <span key={wd} className={i === topIdx ? 'is-top' : undefined}>
                  <span className="pb-ins-wd-short">{dayName(wd, 'short')}</span>
                  <span className="pb-ins-wd-narrow">{dayName(wd, 'narrow')}</span>
                </span>
              ))}
            </div>
            {/* The dashed line's key, under the chart rather than over a bar. */}
            {rest > 0 && (
              <div className="pb-ins-legend pb-ins-week-key" aria-hidden="true">
                <span><i className="pb-ins-key-line is-dashed is-ink" /><span className="font-mono-tab">{t(ux.typicalDay, { amount: wholeDollars(rest) })}</span></span>
              </div>
            )}
          </div>
          <dl className="pb-ins-week-split" aria-label={ux.weekSplit}>
            {[
              { key: 'wd', label: d.insights.yourWeekWeekdays, v: weekdayAvg },
              { key: 'we', label: d.insights.yourWeekWeekends, v: weekendAvg },
            ].map((r) => (
              <div key={r.key} className="pb-ins-week-split-row">
                <dt>{r.label}</dt>
                <dd className="pb-ins-week-split-track pb-chart-fade" aria-hidden="true">
                  <span style={{ width: `${splitMax > 0 ? Math.max(2, (r.v / splitMax) * 100) : 0}%` }} className={r.v === splitMax && splitMax > 0 ? 'is-top' : undefined} />
                </dd>
                <dd className="font-mono-tab pb-ins-week-split-amt">{t(d.insights.yourWeekPerDay, { amount: wholeDollars(r.v) })}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </section>
  );
}
