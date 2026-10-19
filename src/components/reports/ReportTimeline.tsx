'use client';

import { useMemo } from 'react';
import { ComposedChart, Bar, Line, ReferenceLine, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { formatCurrency, parseLocalDate } from '@/lib/format';
import { formatCompactCurrency } from '@/lib/chartFormat';
import { INTL_LOCALE } from '@/lib/i18n/locale';
import { useTranslation } from '@/lib/i18n/useTranslation';
import type { Granularity, ReportBucket } from './reportBuckets';

export type TimelineMode = 'expense' | 'income' | 'mixed';

interface Point {
  key: string;
  label: string;
  tip: string;
  income: number;
  /** Mixed: drawn below zero. */
  spending: number;
  net: number | null;
  /** Single type: the average, drawn hollow over a bucket still to come. */
  ghost: number;
  future: boolean;
  bucket: ReportBucket;
}

function Tip({ active, payload, mode }: { active?: boolean; payload?: ReadonlyArray<{ payload?: Point }>; mode: TimelineMode }) {
  const { d } = useTranslation();
  const x = d.ux.reports;
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  const row = (name: string, value: number, color: string) => (
    <div className="pb-rep-tip-row">
      <span>{name}</span>
      <span className="font-mono-tab" style={{ color }}>{formatCurrency(value)}</span>
    </div>
  );
  return (
    <div className="pb-rep-tip">
      <p className="pb-rep-tip-title">{p.tip}</p>
      {p.future ? <p className="pb-rep-tip-soft">{x.notYet}</p> : (
        <>
          {mode !== 'expense' && row(x.moneyIn, p.bucket.income, 'var(--pine)')}
          {mode !== 'income' && row(x.moneyOut, p.bucket.spending, 'var(--wine)')}
          {mode === 'mixed' && row(x.net, p.bucket.net, p.bucket.net < 0 ? 'var(--wine)' : 'var(--ink)')}
        </>
      )}
    </div>
  );
}

interface ReportTimelineProps {
  buckets: ReportBucket[];
  granularity: Granularity;
  mode: TimelineMode;
  /** Which bars drill down, and to what - decided by the caller. */
  canPick: boolean;
  onPick: (b: ReportBucket) => void;
  hint: string | null;
  /** Spoken summary for the chart as a whole. */
  label: string;
}

/**
 * The report over time: one bar per day, week or month of the bounds.
 * Expenses alone are wine bars, income alone pine; both are diverging bars
 * (money in up, money out down from a zero hairline) with a thin ink line for
 * the net. A dashed line marks the average; a gold tick marks today; buckets
 * still to come are hollow outlines at the average height, never zero bars,
 * so a month in progress reads as unfinished.
 *
 * Fades in (pb-chart-fade) rather than growing from zero, and blurs as a unit
 * in privacy mode, axis text included (#pb-svg-blur).
 */
export function ReportTimeline({ buckets, granularity, mode, canPick, onPick, hint, label }: ReportTimelineProps) {
  const { d, t, locale } = useTranslation();
  const x = d.ux.reports;
  const loc = INTL_LOCALE[locale];

  const { data, avg, todayKey } = useMemo(() => {
    const past = buckets.filter((b) => !b.future);
    const main = (b: ReportBucket) => (mode === 'income' ? b.income : mode === 'expense' ? b.spending : b.spending);
    const avgV = past.length ? past.reduce((s, b) => s + main(b), 0) / past.length : 0;
    const fmt = (ymd: string, o: Intl.DateTimeFormatOptions) => parseLocalDate(ymd).toLocaleDateString(loc, o);
    const yearSpan = buckets.length > 0 && buckets[0].startYmd.slice(0, 4) !== buckets[buckets.length - 1].startYmd.slice(0, 4);
    const pts: Point[] = buckets.map((b) => {
      const lab = granularity === 'month'
        ? fmt(b.startYmd, yearSpan ? { month: 'short', year: '2-digit' } : { month: 'short' })
        : fmt(b.startYmd, granularity === 'day' ? { day: 'numeric' } : { month: 'short', day: 'numeric' });
      const tip = granularity === 'month' ? fmt(b.startYmd, { month: 'long', year: 'numeric' })
        : granularity === 'week' ? t(x.weekOf, { date: fmt(b.startYmd, { month: 'short', day: 'numeric' }) })
        : fmt(b.startYmd, { weekday: 'short', month: 'short', day: 'numeric' });
      return {
        key: b.key, label: lab, tip, bucket: b, future: b.future,
        income: b.future ? 0 : b.income,
        spending: b.future ? 0 : (mode === 'mixed' ? -b.spending : b.spending),
        // The net line only from weekly buckets up: day by day it is noise.
        net: mode === 'mixed' && !b.future && granularity !== 'day' ? b.net : null,
        ghost: b.future && mode !== 'mixed' ? avgV : 0,
      };
    });
    return { data: pts, avg: avgV, todayKey: buckets.find((b) => b.current)?.key ?? null };
  }, [buckets, granularity, mode, loc, t, x.weekOf]);

  // Mixed: the average is of money out, so it says so.
  const avgKey = mode === 'mixed'
    ? (granularity === 'day' ? x.avgOutPerDay : granularity === 'week' ? x.avgOutPerWeek : x.avgOutPerMonth)
    : (granularity === 'day' ? x.avgPerDay : granularity === 'week' ? x.avgPerWeek : x.avgPerMonth);
  const avgText = t(avgKey, { amount: formatCurrency(avg) });
  const pick = (entry: unknown) => {
    const p = (entry as { payload?: Point })?.payload;
    if (canPick && p && !p.future) onPick(p.bucket);
  };

  return (
    <div className="pb-rep-timeline">
      <div className="pb-rep-timeline-legend">
        {mode !== 'expense' && <span><i className="pb-rep-key" style={{ background: 'var(--pine)' }} />{x.moneyIn}</span>}
        {mode !== 'income' && <span><i className="pb-rep-key" style={{ background: 'var(--wine)' }} />{x.moneyOut}</span>}
        {mode === 'mixed' && granularity !== 'day' && <span><i className="pb-rep-key is-line" />{x.net}</span>}
        <span className="pb-rep-avg"><i className="pb-rep-key is-dashed" /><span className="font-mono-tab">{avgText}</span></span>
      </div>
      <div className={`pb-rep-chart pb-chart-fade${canPick ? ' is-pickable' : ''}`} role="img" aria-label={label}>
        <div style={{ position: 'absolute', inset: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 16, right: 14, left: 0, bottom: 0 }} barCategoryGap={granularity === 'day' ? '18%' : '26%'} stackOffset="sign">
              <CartesianGrid stroke="var(--line)" vertical={false} />
              <XAxis dataKey="key" tickFormatter={(k) => data.find((p) => p.key === k)?.label ?? ''} tick={{ fontSize: 11, fill: 'var(--ink-soft)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={10} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--ink-soft)' }} axisLine={false} tickLine={false} tickFormatter={(v) => formatCompactCurrency(Number(v))} width={44} />
              <Tooltip content={<Tip mode={mode} />} cursor={{ fill: 'color-mix(in srgb, var(--ink) 5%, transparent)' }} isAnimationActive={false} />
              {mode === 'mixed' && <ReferenceLine y={0} stroke="var(--ink-faint)" />}
              {mode !== 'expense' && (
                <Bar dataKey="income" stackId={mode === 'mixed' ? 'flow' : 'one'} fill="var(--pine)" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} onClick={pick} />
              )}
              {mode !== 'income' && (
                <Bar dataKey="spending" stackId={mode === 'mixed' ? 'flow' : 'one'} fill="var(--wine)" radius={mode === 'mixed' ? [0, 0, 4, 4] : [4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} onClick={pick} />
              )}
              {mode !== 'mixed' && (
                <Bar dataKey="ghost" stackId="one" fill="transparent" stroke="var(--ink-faint)" strokeOpacity={0.6} strokeDasharray="3 3" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
              )}
              {mode === 'mixed' && granularity !== 'day' && (
                <Line dataKey="net" stroke="color-mix(in srgb, var(--ink) 72%, transparent)" strokeWidth={2} dot={false} activeDot={{ r: 3.5 }} strokeLinejoin="round" connectNulls={false} isAnimationActive={false} />
              )}
              {avg > 0 && (
                <ReferenceLine y={mode === 'mixed' ? -avg : avg} stroke="var(--ink-soft)" strokeDasharray="4 4" strokeOpacity={0.7} ifOverflow="extendDomain" />
              )}
              {todayKey && buckets.length > 1 && (
                <ReferenceLine x={todayKey} stroke="var(--gold)" strokeWidth={1.5} label={{ value: x.today, position: 'top', fill: 'var(--ink-soft)', fontSize: 10 }} />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
      {hint && <p className="pb-rep-timeline-hint">{hint}</p>}
    </div>
  );
}
