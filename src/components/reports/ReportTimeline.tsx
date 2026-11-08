'use client';

import { useMemo, useState, type PointerEvent } from 'react';
import { reportScale, reportNetPath } from './reportPlot';
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
          {mode !== 'expense' && row(x.moneyIn, p.bucket.income, 'var(--income)')}
          {mode !== 'income' && row(x.moneyOut, p.bucket.spending, 'var(--expense)')}
          {mode === 'mixed' && row(x.net, p.bucket.net, p.bucket.net < 0 ? 'var(--expense)' : 'var(--ink)')}
        </>
      )}
    </div>
  );
}

/** Percentage geometry resizes in browser layout; labels keep their native
 * font size. The SVG contains only the Net stroke, never text. */
function ReportPlot({ data, avg, todayKey, mode, granularity, today }: {
  data: Point[]; avg: number; todayKey: string | null; mode: TimelineMode; granularity: Granularity; today: string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const { y, ticks, net } = useMemo(() => {
    const scale = reportScale(data.flatMap(p => mode === 'mixed' ? [p.income, p.spending, p.net ?? 0] : [mode === 'income' ? p.income : p.spending, p.ghost])
      .concat(mode === 'mixed' ? -avg : avg));
    return { ...scale, net: reportNetPath(data.map(p => p.net), scale.y) };
  }, [data, avg, mode]);
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const index = Math.max(0, Math.min(data.length - 1, Math.floor((event.clientX - rect.left) / rect.width * data.length)));
    setHovered(index);
  };
  const count = data.length || 1;
  const labels = new Set(Array.from({ length: Math.min(count, 6) }, (_, i) => Math.round(i * (count - 1) / Math.max(1, Math.min(count, 6) - 1))));
  const point = hovered === null ? null : data[hovered];
  return <div className="pb-rep-native-chart">
    <div className="pb-rep-native-y" aria-hidden="true">
      {ticks.map(value => <span key={value} style={{ top: `${y(value)}%` }}>{formatCompactCurrency(value)}</span>)}
    </div>
    <div className="pb-rep-native-plot" role="group" tabIndex={data.length ? 0 : -1}
      onPointerMove={move} onPointerDown={move} onPointerLeave={() => setHovered(null)} onBlur={() => setHovered(null)}
      onKeyDown={event => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        setHovered(index => Math.max(0, Math.min(data.length - 1, (index ?? -1) + (event.key === 'ArrowRight' ? 1 : -1))));
      }}>
      {ticks.map(value => <i key={value} className="pb-rep-native-grid" style={{ top: `${y(value)}%`, opacity: value === 0 ? 1 : .65 }} />)}
      {avg > 0 && <i className="pb-rep-native-average" style={{ top: `${y(mode === 'mixed' ? -avg : avg)}%` }} />}
      {data.map((p, index) => {
        const bar = (value: number, color: string, ghost = false) => <i className={`pb-rep-native-bar${ghost ? ' is-future' : ''}`}
          style={{ top: `${Math.min(y(0), y(value))}%`, height: `${Math.abs(y(value) - y(0))}%`, background: ghost ? 'transparent' : color,
            borderRadius: value < 0 ? '0 0 4px 4px' : '4px 4px 0 0' }} />;
        return <div key={p.key} className="pb-rep-native-bucket" style={{ left: `${index / count * 100}%`, width: `${100 / count}%` }}>
          {hovered === index && <i className="pb-rep-native-cursor" />}
          {mode !== 'expense' && bar(p.income, 'var(--income)')}
          {mode !== 'income' && bar(p.spending, 'var(--expense)')}
          {mode !== 'mixed' && p.future && bar(p.ghost, 'transparent', true)}
          {labels.has(index) && <span className="pb-rep-native-x">{p.label}</span>}
          {p.key === todayKey && count > 1 && <i className="pb-rep-native-today"><span>{today}</span></i>}
        </div>;
      })}
      {mode === 'mixed' && granularity !== 'day' && <svg className="pb-rep-native-net" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
        <path d={net} fill="none" stroke="color-mix(in srgb, var(--ink) 72%, transparent)" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>}
      {point?.net !== null && point?.net !== undefined && hovered !== null && <i className="pb-rep-native-dot" style={{ left: `${(hovered + .5) / count * 100}%`, top: `${y(point.net)}%` }} />}
      {point && hovered !== null && <div className="pb-rep-native-tooltip" style={hovered >= count / 2 ? { right: 0 } : { left: 0 }}>
        <Tip active payload={[{ payload: point }]} mode={mode} />
      </div>}
    </div>
  </div>;
}

interface ReportTimelineProps {
  buckets: ReportBucket[];
  granularity: Granularity;
  mode: TimelineMode;
  /** Spoken summary for the chart as a whole. */
  label: string;
}

/**
 * The report over time: one bar per day, week or month of the bounds.
 * Expenses alone are red bars, income alone green; both are diverging bars
 * (money in up, money out down from a zero hairline) with a thin ink line for
 * the net. A dashed line marks the average; a gold tick marks today; buckets
 * still to come are hollow outlines at the average height, never zero bars,
 * so a month in progress reads as unfinished.
 *
 * Fades in (pb-chart-fade) rather than growing from zero, and blurs as a unit
 * in privacy mode, axis text included.
 *
 * Read-only on purpose: bars used to drill into the month (or scroll to the
 * day), and a stray tap silently changed the period with no obvious way
 * back (owner-reported). Hover and tap show the tooltip; nothing else.
 */
export function ReportTimeline({ buckets, granularity, mode, label }: ReportTimelineProps) {
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

  return (
    <div className="pb-rep-timeline">
      <div className="pb-rep-timeline-legend">
        {mode !== 'expense' && <span><i className="pb-rep-key" style={{ background: 'var(--income)' }} />{x.moneyIn}</span>}
        {mode !== 'income' && <span><i className="pb-rep-key" style={{ background: 'var(--expense)' }} />{x.moneyOut}</span>}
        {mode === 'mixed' && granularity !== 'day' && <span><i className="pb-rep-key is-line" />{x.net}</span>}
        <span className="pb-rep-avg"><i className="pb-rep-key is-dashed" /><span className="font-mono-tab">{avgText}</span></span>
      </div>
      <div className="pb-rep-chart pb-chart-fade" role="img" aria-label={label}>
        <div data-pb-report-plot style={{ position: 'absolute', inset: 0 }}>
          <ReportPlot data={data} avg={avg} todayKey={todayKey} mode={mode} granularity={granularity} today={x.today} />
        </div>
      </div>
    </div>
  );
}
