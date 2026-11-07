'use client';

import { useId, useMemo } from 'react';
import {
  ComposedChart, Bar, Line, Cell, ReferenceLine, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import { BarChart3 } from 'lucide-react';
import type { Transaction } from '@/types';
import { formatCurrency } from '@/lib/format';
import { formatCompactCurrency } from '@/lib/chartFormat';
import { buildPeriodTrend } from '@/lib/periodTrend';
import { rangeDays, statsInRange, windowBounds, type RangeStats } from '@/lib/periodCompare';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { PeriodLink } from '@/components/shared/PeriodLink';
import { SectionHeader } from '@/components/kit/SectionHeader';
import { EmptyState } from '@/components/kit/EmptyState';
import { BarsSkeleton } from './DashSkeletons';

// Theme tokens, not hex: the grid and tick text already used var() in these
// SVG attributes, so the series follow the active theme and dark mode too.
// Income is pine and spending is wine - the app's colours for money in and
// money out, the same as the Analysis charts.
const INCOME = 'var(--pine)';
const SPENDING = 'var(--wine)';

// The running "saved so far" line: ink, so it reads as a total rather than a
// third money series competing with pine and wine.
const CUMULATIVE = 'color-mix(in srgb, var(--ink) 70%, transparent)';

type TipItem = { dataKey?: unknown; value?: unknown; payload?: { partial?: boolean; cum?: number | null; exact?: { income: number; spending: number } } };

/** Income, Spending and Saved (their difference) for the hovered bucket, plus the running total. */
function SavedTooltip({ active, payload, label }: { active?: boolean; payload?: ReadonlyArray<TipItem>; label?: unknown }) {
  const { d } = useTranslation();
  if (!active || !payload || payload.length === 0) return null;
  const pick = (key: string) => Number(payload.find((p) => p.dataKey === key)?.value ?? 0);
  const point = payload[0]?.payload;
  // The bucket's exact sums; the bar values are rounded to whole dollars.
  const income = point?.exact ? point.exact.income : pick('income');
  const spending = point?.exact ? point.exact.spending : pick('spending');
  const saved = income - spending;
  const row = (name: string, value: number, color?: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1.25rem' }}>
      <span style={{ color: 'var(--ink-soft)' }}>{name}</span>
      <span className="font-mono-tab" style={{ fontWeight: 600, color: color ?? 'var(--ink)' }}>{formatCurrency(value)}</span>
    </div>
  );
  return (
    <div style={{ backgroundColor: 'var(--mist)', border: '1px solid var(--line)', borderRadius: '0.6rem', padding: '0.55rem 0.75rem', fontSize: '0.8rem', boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column', gap: 3, minWidth: 160 }}>
      <div style={{ fontWeight: 600, marginBottom: 2 }}>
        {String(label ?? '')}
        {point?.partial && <span style={{ fontWeight: 500, color: 'var(--ink-soft)' }}> · {d.ux.dashboard.inProgress}</span>}
      </div>
      {row(d.dashboard.income, income, INCOME)}
      {row(d.dashboard.spending, spending, SPENDING)}
      <div style={{ borderTop: '1px solid var(--line)', marginTop: 2, paddingTop: 3, display: 'grid', gap: 3 }}>
        {row(d.dashboard.saved, saved, saved >= 0 ? INCOME : SPENDING)}
        {typeof point?.cum === 'number' && row(d.ux.dashboard.savedSoFar, point.cum)}
      </div>
    </div>
  );
}

interface IncomeSpendingChartProps {
  transactions: Transaction[];
  /** The Dashboard's shared period, owned by the This period card. */
  mode: string;
  periodKey: string | null;
  /** Zone-aware today from DashboardClient; null until resolved. */
  today: Date | null;
  /** False until the saved period has been restored, so the chart draws once. */
  ready: boolean;
  /** The dates behind the chart, e.g. "Oct 1 – Oct 31". */
  timeFrame: string;
  /** The window runs up to today (describeWindow().inProgress): its last bucket is partial. */
  inProgress?: boolean;
}

/** Modes bucketed by week in buildPeriodTrend; everything else is by month. */
const WEEKLY = new Set(['30d', '90d', 'month']);

/**
 * Income vs spending as what the data actually is: discrete buckets. Each
 * week or month gets a pair of bars (income pine, spending wine) and a thin
 * ink line carries the running "saved so far" across them.
 *
 * The previous version drew two monotone AREAS, which interpolated between
 * buckets - pay landing on the 1st became a slope down to zero, a flow that
 * never happened. Bars show each bucket's total and nothing in between.
 *
 * The bucket still in progress is hatched, so "partial" reads at a glance.
 * Nothing grows from zero: the whole chart fades in (pb-chart-fade, re-keyed
 * per period so the fade runs once per change), the documented rule for
 * charts in globals.css, so there is no Recharts animation to switch off
 * under reduced motion.
 */
export function IncomeSpendingChart({ transactions, mode, periodKey, today, ready, timeFrame, inProgress = false }: IncomeSpendingChartProps) {
  const { d, t, locale } = useTranslation();
  const ux = d.ux.dashboard;
  // Pattern ids are document-global: useId keeps them unique per chart.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');

  const trendData = useMemo(
    () => (ready && today ? buildPeriodTrend(transactions, mode, periodKey, today, locale) : []),
    [ready, today, transactions, mode, periodKey, locale],
  );
  // Each bucket's exact dates and cent-exact sums (statsInRange: the stats
  // card's rules). buildPeriodTrend rounds to whole dollars, which is right
  // for bar heights but not for figures in words: the tooltip and the running
  // "saved so far" line read these, so they agree with the facts row below.
  const data = useMemo(() => {
    if (!today || trendData.length === 0) return [];
    const win = windowBounds(mode, periodKey, today);
    const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const weekly = WEEKLY.has(mode);
    // The bucket holding today is the partial one; buckets after it have not
    // happened yet, so the running line stops there instead of running flat
    // into the future.
    let current = trendData.length - 1;
    if (inProgress) {
      current = weekly
        ? Math.floor((rangeDays({ start: win.start, end: now }) - 1) / 7)
        : (now.getFullYear() - win.start.getFullYear()) * 12 + (now.getMonth() - win.start.getMonth());
    }
    const out: (typeof trendData[number] & {
      cum: number | null; partial: boolean; exact: RangeStats; whole: boolean;
    })[] = [];
    let running = 0;
    for (let i = 0; i < trendData.length; i++) {
      const start = weekly
        ? new Date(win.start.getFullYear(), win.start.getMonth(), win.start.getDate() + i * 7)
        : new Date(win.start.getFullYear(), win.start.getMonth() + i, 1);
      const last = weekly
        ? new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6)
        : new Date(start.getFullYear(), start.getMonth() + 1, 0);
      const end = last > win.end ? win.end : last;
      const exact = statsInRange(transactions, { start, end });
      // "So far" stops at today: in the bucket holding today, only the days
      // up to it count (a future-dated record has not happened yet).
      if (i < current) running += exact.saved;
      else if (i === current) running += inProgress ? statsInRange(transactions, { start, end: end < now ? end : now }).saved : exact.saved;
      out.push({
        ...trendData[i],
        cum: i <= current ? Math.round(running * 100) / 100 : null,
        partial: inProgress && i === current,
        exact,
        // Whole: a full week or month inside the window, over before today began.
        whole: last <= win.end && !(inProgress && last >= now),
      });
    }
    return out;
  }, [trendData, inProgress, today, mode, periodKey, transactions]);
  const goesNegative = data.some((p) => p.cum !== null && p.cum < 0);
  const peak = data.reduce<(typeof data)[number] | null>((best, p) => (p.spending > 0 && (!best || p.spending > best.spending) ? p : best), null);
  const caption = peak ? t(WEEKLY.has(mode) ? ux.mostSpentWeek : ux.mostSpentMonth, { label: peak.month }) : null;
  const hasData = data.some((p) => p.income > 0 || p.spending > 0);

  // Figures along the card's foot (the card stretches to Upcoming's height
  // beside it; these sit at its bottom).
  //
  // The averages count WHOLE weeks or months only: a partial bucket (the one
  // holding today, or a month's 3-day tail week) would drag the average down,
  // and stretching a few days to a whole unit would turn two paydays into a
  // month's pay. With no whole bucket yet, no average is shown.
  //
  // "Saved so far" is the running line's last point: the window up to today
  // (the whole window once it is over), cent-exact. It equals the Saved tile
  // except when records are dated after today - the tile counts the whole
  // calendar window, and those have not happened yet.
  const facts = useMemo(() => {
    if (!hasData) return null;
    let income = 0;
    let spending = 0;
    let whole = 0;
    let saved = 0;
    for (const p of data) {
      if (p.cum !== null) saved = p.cum;
      if (!p.whole) continue;
      income += p.exact.income;
      spending += p.exact.spending;
      whole += 1;
    }
    return { income: whole ? income / whole : null, spending: whole ? spending / whole : null, saved };
  }, [hasData, data]);
  const unit = WEEKLY.has(mode) ? ux.unitWeek : ux.unitMonth;

  const lastIndex = data.reduce((last, p, i) => (p.cum !== null ? i : last), -1);
  const endDot = (props: { cx?: number; cy?: number; index?: number }) => (
    props.index === lastIndex && props.cx !== undefined && props.cy !== undefined
      ? <circle key="end" cx={props.cx} cy={props.cy} r={3.5} fill={CUMULATIVE} stroke="var(--mist)" strokeWidth={2} />
      : <g key={`d${props.index}`} />
  );

  return (
    <section className="card pb-dash-card pb-dash-flow" aria-labelledby={`${uid}-title`}>
      <SectionHeader
        id={`${uid}-title`}
        title={d.trendChart.title}
        subtitle={<PeriodLink label={timeFrame} control="dashboard" />}
      />
      {caption && ready && today && hasData && <p className="pb-dash-caption">{caption}</p>}
      {!ready || !today ? (
        // Waits for the shared period to be restored, so the chart draws once.
        <BarsSkeleton minHeight={220} />
      ) : !hasData ? (
        <div className="pb-dash-fill-empty" style={{ minHeight: 220 }}>
          <EmptyState compact icon={BarChart3} title={d.trendChart.noData} />
        </div>
      ) : (
      // Grows to fill the card when the neighbouring card is taller (the grid
      // stretches both), never shorter than 220px - and only up to a cap
      // (dashboard.css), so a tall neighbour cannot stretch the bars into a
      // giant plot. The absolute inner box gives ResponsiveContainer a
      // definite height to measure.
      <div key={`${mode}-${periodKey ?? ''}`} className="pb-chart-fade pb-chart-fill pb-dash-chart-box is-flow">
      <div style={{ position: 'absolute', inset: 0 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 6, left: 0, bottom: 0 }} barGap={2} barCategoryGap="24%">
          <defs>
            {/* The diagonal hatch idiom the Budgets plan bar uses for "not a solid figure". */}
            <pattern id={`${uid}-inc`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill={INCOME} opacity="0.35" />
              <rect width="3" height="6" fill={INCOME} />
            </pattern>
            <pattern id={`${uid}-spd`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill={SPENDING} opacity="0.35" />
              <rect width="3" height="6" fill={SPENDING} />
            </pattern>
          </defs>
          {/* Solid hairline, horizontal only. */}
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 12, fill: 'var(--ink-soft)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={14} />
          <YAxis tick={{ fontSize: 12, fill: 'var(--ink-soft)' }} axisLine={false} tickLine={false} tickFormatter={(v) => formatCompactCurrency(Number(v))} width={48} />
          <Tooltip content={<SavedTooltip />} cursor={{ fill: 'color-mix(in srgb, var(--ink) 5%, transparent)' }} />
          {goesNegative && <ReferenceLine y={0} stroke="var(--ink-faint)" />}
          <Bar dataKey="income" name={d.dashboard.income} fill={INCOME} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false}>
            {data.map((p, i) => <Cell key={i} fill={p.partial ? `url(#${uid}-inc)` : INCOME} />)}
          </Bar>
          <Bar dataKey="spending" name={d.dashboard.spending} fill={SPENDING} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false}>
            {data.map((p, i) => <Cell key={i} fill={p.partial ? `url(#${uid}-spd)` : SPENDING} />)}
          </Bar>
          <Line dataKey="cum" name={ux.savedSoFar} type="linear" stroke={CUMULATIVE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" dot={endDot} activeDot={{ r: 3.5, fill: CUMULATIVE, stroke: 'var(--mist)', strokeWidth: 2 }} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
      </div>
      </div>
      )}
      <div className="pb-dash-legend">
        <span><i className="pb-dash-key-dot" style={{ backgroundColor: INCOME }} />{d.dashboard.income}</span>
        <span><i className="pb-dash-key-dot" style={{ backgroundColor: SPENDING }} />{d.dashboard.spending}</span>
        <span><i className="pb-dash-key-line" style={{ backgroundColor: CUMULATIVE }} />{ux.savedSoFar}</span>
        {inProgress && <span><i className="pb-dash-key-hatch" />{ux.inProgress}</span>}
      </div>
      {facts && ready && (
        <dl className="pb-dash-facts" aria-label={ux.flowFacts}>
          {facts.income !== null && <div className="pb-dash-fact"><dt>{t(ux.avgIncome, { unit })}</dt><dd><span className="font-mono-tab">{formatCurrency(facts.income)}</span></dd></div>}
          {facts.spending !== null && <div className="pb-dash-fact"><dt>{t(ux.avgSpending, { unit })}</dt><dd><span className="font-mono-tab">{formatCurrency(facts.spending)}</span></dd></div>}
          <div className="pb-dash-fact"><dt>{ux.savedSoFar}</dt><dd><span className="font-mono-tab" style={{ color: facts.saved < 0 ? 'var(--wine)' : undefined }}>{formatCurrency(facts.saved)}</span></dd></div>
        </dl>
      )}
    </section>
  );
}
