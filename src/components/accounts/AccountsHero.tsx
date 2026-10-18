'use client';

import { memo, useCallback, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRightLeft, ChevronRight, Plus, Wallet, ReceiptText } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCurrency, formatDate, formatLongDate, splitCents } from '@/lib/format';
import { formatCompactCurrency } from '@/lib/chartFormat';
import { useTranslation } from '@/lib/i18n/useTranslation';
import type { Locale } from '@/lib/i18n/locale';
import { requestShell } from '@/components/layout/shellEvents';
import { PeriodDot } from '@/components/shared/PeriodLink';
import { SegmentedControl } from '@/components/kit/SegmentedControl';
import { DeltaChip } from '@/components/kit/DeltaChip';
import { EmptyState } from '@/components/kit/EmptyState';
import { Skeleton } from '@/components/kit/Skeleton';
import { changeBetween, dateOf, type DayPoint, type PeriodWords, type Range } from './accountMath';
import { useWidth } from './useWidth';

type TipItem = { payload?: { date?: string; total?: number } };
type ChartState = { activeTooltipIndex?: unknown } | null | undefined;

// Narrower than this the chart drops its Y axis (the scrub headline carries
// the value) and shows only its first and last dates.
const NARROW = 520;

/**
 * The page's key figure: the total balance today, how it moved over the
 * range, and the chart of it - one surface, so the figure and the line are
 * connected. Dragging across the chart (or hovering on a Mac) puts that
 * day's balance in the headline, Stocks-style; letting go returns to today.
 *
 * The range control keeps the id the PeriodLink chips jump to
 * (#pb-accounts-range) and its pine PeriodDot.
 */
export function AccountsHero({
  days, hasRecords, hasAccounts, range, onRange, words, selfCount, onReviewSelf,
}: {
  /** Null until the zone-aware today is known (after mount). */
  days: DayPoint[] | null;
  hasRecords: boolean;
  hasAccounts: boolean;
  range: Range;
  onRange: (r: Range) => void;
  words: PeriodWords;
  /** Transfers whose two halves sit on one account (see AccountsClient). */
  selfCount: number;
  onReviewSelf: () => void;
}) {
  const { d, t, locale } = useTranslation();
  const x = d.ux.accounts;
  const [scrub, setScrub] = useState<number | null>(null);

  const ready = !!days && days.length > 0;
  const first = ready ? days[0].total : 0;
  const last = ready ? days[days.length - 1].total : 0;
  const i = scrub !== null && ready ? Math.min(scrub, days.length - 1) : null;
  const shownTotal = i !== null && days ? days[i].total : last;
  const { whole, cents } = splitCents(formatCurrency(shownTotal));

  // The range's own summary (unchanged wording and colour rule), and while
  // scrubbing, the change from the range's start to the day under the finger.
  const full = changeBetween(first, last);
  const summaryColor = full.change > 0 ? 'var(--pine)' : full.change < 0 ? 'var(--wine)' : 'var(--ink-soft)';
  const summaryText = words.sentence(full.change, full.pct, formatCurrency(Math.abs(full.change)));
  const part = i !== null ? changeBetween(first, shownTotal) : null;

  // Coloured like a stock chart: the range's overall direction, first point
  // to last - up pine, down wine, unchanged grey.
  const trendTone = last > first + 0.004 ? 'var(--pine)' : last < first - 0.004 ? 'var(--wine)' : 'var(--ink-soft)';

  const options = useMemo(() => [
    { value: '1m' as const, label: x.range1m },
    { value: '3m' as const, label: d.accountsPage.range3m },
    { value: '6m' as const, label: d.accountsPage.range6m },
    { value: '1y' as const, label: d.accountsPage.range1y },
    { value: 'all' as const, label: x.rangeAll },
  ], [d, x]);

  const onPick = useCallback((r: Range) => { setScrub(null); onRange(r); }, [onRange]);

  return (
    <section className="card pb-accounts-hero pb-rise" aria-labelledby="pb-accounts-total" style={{ ['--pb-i' as string]: 0 }}>
      {selfCount > 0 && (
        <div className="pb-accounts-self">
          <span className="pb-accounts-self-icon" aria-hidden="true"><ArrowRightLeft size={15} /></span>
          <p>{selfCount === 1 ? d.accountsPage.selfNoticeOne : t(d.accountsPage.selfNotice, { count: selfCount })}</p>
          <button type="button" className="pill" onClick={onReviewSelf}>{d.accountsPage.selfReview}</button>
        </div>
      )}

      <div className="pb-accounts-hero-top">
        <div className="pb-accounts-hero-fig">
          {/* The id names the section, so its text stays put; the scrubbed
              day is laid over it. */}
          <div className={`pb-accounts-hero-label${i !== null ? ' is-scrub' : ''}`}>
            <p id="pb-accounts-total">{d.accountsPage.totalLabel}</p>
            <p aria-hidden="true" className="pb-tnum">{i !== null && days ? formatLongDate(days[i].date, locale) : ' '}</p>
          </div>
          {ready ? (
            // No aria-live: the text changes back to today's total whenever a
            // scrub ends, which would announce it after every hover.
            <p className="font-display hero-balance pb-money pb-accounts-hero-figure">
              {whole}<span className="pb-accounts-cents">{cents}</span>
            </p>
          ) : (
            <p className="font-display hero-balance pb-accounts-hero-figure" aria-hidden="true">
              <Skeleton width="13rem" height="0.82em" radius="0.6rem" style={{ display: 'inline-block', verticalAlign: 'middle', maxWidth: '100%' }} />
            </p>
          )}
          <p className="pb-accounts-hero-change">
            {/* With no accounts there is no change to describe. */}
            {ready && !hasAccounts ? null : !ready ? (
              <Skeleton width="16rem" height="0.9rem" style={{ maxWidth: '100%' }} />
            ) : part ? (
              <>
                <DeltaChip delta={part.change} money good="up" text={`${part.change >= 0 ? '+' : '−'}${formatCurrency(Math.abs(part.change))}${part.pct ? ` · ${part.pct}` : ''}`} />
                <span className="pb-accounts-hero-since">{t(x.changeSince, { date: formatDate(days![0].date, locale) })}</span>
              </>
            ) : (
              <>
                <span className="pb-money pb-accounts-hero-summary" style={{ color: summaryColor }}>{summaryText}</span>
              </>
            )}
          </p>
        </div>

        {/* With no accounts the range controls nothing, so it is hidden -
            but kept in the DOM (and its space), since PeriodLink chips jump
            to its id. */}
        <div
          role="group" id="pb-accounts-range" aria-label={d.accountsPage.rangeLabel}
          className={`pb-accounts-range${ready && !hasAccounts ? ' is-idle' : ''}`}
          aria-hidden={ready && !hasAccounts ? true : undefined} inert={ready && !hasAccounts}
        >
          <PeriodDot />
          <SegmentedControl options={options} value={range} onChange={onPick} ariaLabel={d.accountsPage.rangeLabel} size="sm" className="pb-accounts-seg" />
        </div>
      </div>

      {!days ? (
        <div className="pb-accounts-chart pb-accounts-chart-skel" aria-hidden="true">
          <Skeleton height="100%" radius="0.75rem" />
        </div>
      ) : !hasAccounts ? (
        <div className="pb-accounts-chart-empty">
          <EmptyState
            icon={Wallet} title={x.emptyNoAccountsTitle} body={x.emptyNoAccountsBody}
            action={(
              <Link href="/settings#settings-money" prefetch={false} className="btn-primary pb-accounts-cta">
                <Plus size={15} aria-hidden="true" />{d.noAccounts.action}
              </Link>
            )}
          />
        </div>
      ) : !hasRecords ? (
        <div className="pb-accounts-chart-empty">
          {/* Same message as before ("No records yet."), now with the way out. */}
          <EmptyState
            icon={ReceiptText} title={x.emptyNoRecordsTitle} body={x.emptyNoRecordsBody}
            action={(
              <>
                <button type="button" className="btn-primary pb-accounts-cta" onClick={() => requestShell('addTransaction')}>
                  <Plus size={15} aria-hidden="true" />{d.header.addTransaction}
                </button>
                <span className="pb-accounts-keyhint" aria-hidden="true">{x.pressN}</span>
              </>
            )}
          />
        </div>
      ) : (
        <BalanceChart days={days} range={range} tone={trendTone} label={words.chartLabel} onScrub={setScrub} />
      )}

      <div className="pb-accounts-hero-foot">
        {ready && hasRecords && <p className="pb-accounts-hint">{x.scrubHint}</p>}
        <div className="pb-accounts-hero-actions">
          {hasAccounts && (
            <button type="button" className="pill pb-accounts-transfer" onClick={() => requestShell('transfer')}>
              <ArrowRightLeft size={14} aria-hidden="true" />{d.transfer.title}
            </button>
          )}
          {/* Lands on the accounts section of Settings, not the top of the page. */}
          <Link href="/settings#settings-money" prefetch={false} className="pb-accounts-manage">
            {d.accountsPage.manage}<ChevronRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}

/** Hover/drag readout: the day and its end-of-day total. */
function DayTip({ active, payload, locale }: { active?: boolean; payload?: ReadonlyArray<TipItem>; locale: Locale }) {
  const p = payload?.[0]?.payload;
  if (!active || !p?.date) return null;
  return (
    <div className="pb-accounts-tip">
      <div className="pb-accounts-tip-date">{formatDate(p.date, locale)}</div>
      <div className="font-mono-tab pb-accounts-tip-amount">{formatCurrency(p.total ?? 0)}</div>
    </div>
  );
}

const indexOf = (s: ChartState): number | null => {
  const raw = s?.activeTooltipIndex;
  const n = raw === null || raw === undefined || raw === '' ? NaN : Number(raw);
  return Number.isFinite(n) ? n : null;
};

/**
 * The balance line. Memoised so scrubbing (which re-renders the headline on
 * every move) does not redraw the chart. Still the owner's rule: no grow
 * animation (isAnimationActive off, pb-chart-fade fades it in), remounted per
 * range, gradient and stroke in the range's direction.
 */
const BalanceChart = memo(function BalanceChart({ days, range, tone, label, onScrub }: {
  days: DayPoint[];
  range: Range;
  tone: string;
  label: string;
  onScrub: (i: number | null) => void;
}) {
  const { d, locale } = useTranslation();
  const x = d.ux.accounts;
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref);
  const narrow = width > 0 && width < NARROW;
  const tag = locale === 'zh' ? 'zh-CN' : 'en-US';
  const long = days.length > 400;

  const marks = useMemo(() => {
    let hi = 0;
    let lo = 0;
    for (let k = 1; k < days.length; k++) {
      if (days[k].total > days[hi].total) hi = k;
      if (days[k].total < days[lo].total) lo = k;
    }
    const min = days[lo].total;
    const max = days[hi].total;
    const flat = max - min < 0.005;
    // The Y axis on round steps ($12k, $14k, $16k...): the padded range
    // (room for the High and Low labels) widened out to whole steps of a
    // 1-2-2.5-5 sequence, about four of them.
    const span = Math.max(1, max - min);
    const raw = (span * 1.26) / 4;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const step = ([1, 2, 2.5, 5, 10].find((m) => m * mag >= raw) ?? 10) * mag;
    const y0 = Math.floor((min - span * 0.16) / step) * step;
    const y1 = Math.ceil((max + span * 0.1) / step) * step;
    // No label on the bottom line: it sat on the last date label.
    const ticks: number[] = [];
    for (let v = y0 + step; v <= y1 + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
    return { hi: flat ? null : hi, lo: flat ? null : lo, crossesZero: min < 0 && max > 0, domain: [y0, y1] as [number, number], ticks };
  }, [days]);
  const end = days[days.length - 1];

  const tick = (v: string) => dateOf(v).toLocaleDateString(tag, long ? { month: 'short', year: '2-digit' } : { month: 'short', day: 'numeric' });
  const move = (s: ChartState) => { const k = indexOf(s); if (k !== null) onScrub(k); };
  const leave = () => onScrub(null);


  // Near either end a label above or below the dot would run off the plot,
  // so it sits beside the dot, on the inner side.
  const markLabel = (word: string, k: number, position: 'top' | 'bottom') => ({
    value: `${word} ${formatCompactCurrency(days[k].total)}`,
    position: k > days.length * 0.85 ? 'left' as const : k < days.length * 0.15 ? 'right' as const : position,
    offset: 9, fill: 'var(--ink-soft)', fontSize: 11,
  });

  return (
    <div ref={ref} className="pb-chart-fade pb-chart-fill pb-accounts-chart" role="img" aria-label={label}>
      {width > 0 && (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            key={range} data={days}
            margin={{ top: 22, right: narrow ? 26 : 4, left: narrow ? 26 : 4, bottom: 0 }}
            onMouseMove={move} onMouseLeave={leave}
            onTouchMove={move} onTouchEnd={leave}
          >
            <defs>
              <linearGradient id="balanceGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={tone} stopOpacity={0.24} />
                <stop offset="95%" stopColor={tone} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis
              dataKey="date" tick={{ fontSize: 12, fill: 'var(--ink-soft)' }} axisLine={false} tickLine={false}
              minTickGap={36} tickFormatter={tick}
              {...(narrow ? { ticks: [days[0].date, end.date], interval: 0 as const } : {})}
            />
            <YAxis
              orientation="right" hide={narrow}
              tick={{ fontSize: 12, fill: 'var(--ink-soft)' }} axisLine={false} tickLine={false} width={66}
              // Clear of the end dot, which sits on the plot's right edge.
              tickMargin={12}
              // Padded so the High and Low labels have a band of their own
              // and never sit on the date axis.
              domain={marks.domain} ticks={marks.ticks} allowDataOverflow={false}
              tickFormatter={(v) => formatCompactCurrency(Number(v))}
            />
            {marks.crossesZero && <ReferenceLine y={0} stroke="var(--ink-faint)" strokeDasharray="3 4" />}
            <Tooltip content={<DayTip locale={locale} />} cursor={{ stroke: 'var(--ink-faint)', strokeWidth: 1 }} />
            <Area type="linear" dataKey="total" stroke={tone} strokeWidth={2} strokeLinejoin="round" fill="url(#balanceGrad)" isAnimationActive={false} activeDot={{ r: 4.5, stroke: 'var(--mist)', strokeWidth: 2, fill: tone }} />
            {/* Not within the last few days: the end dot already marks it. */}
            {marks.hi !== null && marks.hi < days.length - 3 && (
              <ReferenceDot x={days[marks.hi].date} y={days[marks.hi].total} r={3} fill="var(--mist)" stroke={tone} strokeWidth={1.5} label={markLabel(x.high, marks.hi, 'top')} />
            )}
            {marks.lo !== null && marks.lo < days.length - 3 && (
              <ReferenceDot x={days[marks.lo].date} y={days[marks.lo].total} r={3} fill="var(--mist)" stroke={tone} strokeWidth={1.5} label={markLabel(x.low, marks.lo, 'bottom')} />
            )}
            {/* Today: the end of the line, ringed in the card's colour. */}
            <ReferenceDot x={end.date} y={end.total} r={4.5} fill={tone} stroke="var(--mist)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
});
