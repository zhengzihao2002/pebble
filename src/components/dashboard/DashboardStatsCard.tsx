'use client';

import { ArrowDownRight, ArrowUpRight, ChevronDown, ChevronLeft, ChevronRight, Percent, Wallet } from 'lucide-react';
import { InfoTooltip } from '@/components/shared/InfoTooltip';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { renderTemplate } from '@/lib/i18n/RichText';
import { PeriodDot } from '@/components/shared/PeriodLink';
import { DeltaChip } from '@/components/kit/DeltaChip';
import { CompareTip } from './CompareTip';
import { ProgressRing } from '@/components/kit/ProgressRing';
import type { PeriodComparison, RangeStats } from '@/lib/periodCompare';

interface ModeOption { value: string; label: string }
interface PeriodOption { key: string; label: string }

interface DashboardStatsCardProps {
  modes: ModeOption[];
  statsMode: string;
  onModeChange: (mode: string) => void;
  periods: PeriodOption[];
  statsPeriod: string | null;
  onPeriodChange: (key: string) => void;
  rangeLabel: string;
  inProgress: boolean;
  /** The in-progress note for this mode ("· includes this month so far"). */
  inProgressNote?: string;
  /** Computed by computeStatsForPeriod - never recomputed here. */
  income: number;
  spending: number;
  savingsRate: number;
  saved: number;
  /** Like-for-like change and the last few comparable periods; null until today resolves. */
  compare?: PeriodComparison | null;
  /** The previous comparable window in words, e.g. "Sep 1 – 16". */
  compareLabel?: string;
}

type Metric = 'income' | 'spending' | 'savingsRate' | 'saved';

/**
 * A period's name in fewer characters, for a narrow phone: "Oct 2026" for
 * "October 2026", "2026 Q4" for "2026年第4季度". Read from the stored key
 * (getAvailablePeriods: "2026-9" for October, "2026-Q4", "2026"), never from
 * the translated label; anything unrecognised keeps its full label.
 */
function shortPeriodLabel(p: PeriodOption, locale: string, format: (year: string, q: string) => string): string {
  const month = /^(\d{4})-(\d{1,2})$/.exec(p.key);
  if (month) {
    if (locale === 'zh') return p.label;
    return new Date(Number(month[1]), Number(month[2]), 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }
  const quarter = /^(\d{4})-Q([1-4])$/.exec(p.key);
  if (quarter) return locale === 'zh' ? format(quarter[1], quarter[2]) : p.label;
  return p.label;
}

/** The rate as the tip says it: the tile's own figure (a negative rate is
    said as "more than you earned", so without its sign). */
const ratePct = (rate: number) => `${Math.abs(rate).toFixed(2)}%`;

const RATE_TARGET = 20;
const RING = 28;
const RING_STROKE = 4;

/**
 * The savings rate as a ring: the share of income kept, so 53% fills about
 * half of it (it used to fill at 50%, which read as "full" for anyone saving
 * half their pay). Negative is an empty ring in wine. Colour keeps its
 * meaning - pine at 20% and up, gold below, wine under zero - and a small
 * tick marks 20%, the healthy line. Theme tokens only, which fade with a
 * light/dark switch (the health bar's --hp-l/--hp-c swap in one frame and
 * would make the ring jump). The ring shows the rate, so it sits in
 * pb-chart-fill and blurs with the figure in privacy mode.
 */
function RateRing({ rate }: { rate: number }) {
  const color = rate >= RATE_TARGET ? 'var(--pine)' : rate >= 0 ? 'var(--gold)' : 'var(--wine)';
  // The tick: across the ring's band at 20% of the way round from the top.
  const a = (RATE_TARGET / 100) * 2 * Math.PI;
  const c = RING / 2;
  const r = (RING - RING_STROKE) / 2;
  const at = (rr: number) => ({ x: c + rr * Math.sin(a), y: c - rr * Math.cos(a) });
  const p1 = at(r - RING_STROKE / 2 - 1);
  const p2 = at(r + RING_STROKE / 2 + 1);
  return (
    <span className="pb-chart-fill pb-dash-tile-ring">
      <ProgressRing value={Math.min(1, Math.max(0, rate / 100))} size={RING} stroke={RING_STROKE} color={color}>
        <svg className="pb-dash-rate-tick" width={RING} height={RING} viewBox={`0 0 ${RING} ${RING}`} aria-hidden="true" focusable="false">
          <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} />
        </svg>
      </ProgressRing>
    </span>
  );
}

/** A change chip's text, tone direction and hover label. Labels carry no amounts. */
function useDelta() {
  const { d, t } = useTranslation();
  const ux = d.ux.dashboard;
  return (metric: Metric, cur: RangeStats, prev: RangeStats, range: string) => {
    if (metric === 'savingsRate') {
      // Points, not percent of a percent. Only meaningful with income on both sides.
      if (cur.income <= 0 || prev.income <= 0) return null;
      const diff = Math.round((cur.savingsRate - prev.savingsRate) * 10) / 10;
      const pts = `${diff > 0 ? '+' : diff < 0 ? '−' : ''}${Math.abs(diff).toFixed(1)}`;
      return {
        delta: diff, good: 'up' as const, money: false,
        text: t(ux.ptsText, { pts }),
        label: diff === 0 ? t(ux.deltaSame, { range }) : t(diff > 0 ? ux.ptsHigher : ux.ptsLower, { pts: Math.abs(diff).toFixed(1), range }),
      };
    }
    if (metric === 'saved') {
      // Saved can be negative on either side, so a percentage would mislead:
      // the change is shown in dollars (blurred in privacy mode).
      const diff = Math.round((cur.saved - prev.saved) * 100) / 100;
      return {
        delta: diff, good: 'up' as const, money: true,
        text: `${diff > 0 ? '+' : ''}${formatCurrency(diff)}`,
        label: diff === 0 ? t(ux.deltaSame, { range }) : t(diff > 0 ? ux.savedMore : ux.savedLess, { range }),
      };
    }
    const c = cur[metric];
    const p = prev[metric];
    if (p <= 0) return c === 0 ? { delta: 0, good: 'neutral' as const, money: false, text: '0%', label: t(ux.deltaSame, { range }) } : null;
    const pct = ((c - p) / p) * 100;
    const shown = Math.round(Math.abs(pct));
    const delta = shown === 0 ? 0 : pct;
    return {
      delta, good: metric === 'spending' ? 'down' as const : 'up' as const, money: false,
      text: `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${shown}%`,
      label: delta === 0 ? t(ux.deltaSame, { range }) : t(delta > 0 ? ux.deltaMore : ux.deltaLess, { pct: `${shown}%`, range }),
    };
  };
}

/**
 * The four period figures in one card, separated by hairlines, with the
 * period controls and range line in its header. The controls here are the
 * Dashboard's ONE period control: Income vs spending, Where it went and
 * Spending pace follow them too. Dashboard only: the shared StatTab /
 * .stat-tabs used by other pages are untouched.
 *
 * COMMAND BAR. The mode stays a native <select> (iOS keeps its wheel picker,
 * and AppShell's single-key shortcuts already ignore a focused select), styled
 * as a pill. The sub-period is a ‹ period › stepper whose centre is still the
 * native period <select>: the arrows only ever move through the options that
 * select lists (newest first, this data-year only), so stepping can never reach
 * a period the list would not offer.
 *
 * TILES. Each keeps its label, (i), value and reserved note row, and adds the
 * change against the previous comparable period (like-for-like while the
 * period is in progress - see src/lib/periodCompare.ts). The change explains
 * itself: hovering or tapping it shows the two figures being compared. (The
 * tiles once carried a small trend line each too; with the period's charts
 * just below they were one set of graphs too many, so they went.)
 */
export function DashboardStatsCard({
  modes, statsMode, onModeChange, periods, statsPeriod, onPeriodChange,
  rangeLabel, inProgress, inProgressNote, income, spending, savingsRate, saved,
  compare = null, compareLabel = '',
}: DashboardStatsCardProps) {
  const { d, t, locale } = useTranslation();
  const ux = d.ux.dashboard;
  const deltaFor = useDelta();

  // Newest first: "previous" is the next index, "next" the one before.
  const idx = periods.findIndex((p) => p.key === statsPeriod);
  const current = idx >= 0 ? periods[idx] : undefined;
  const older = idx >= 0 ? periods[idx + 1] : undefined;
  const newer = idx > 0 ? periods[idx - 1] : undefined;

  // A tile's figure for one side of the comparison, written as the tile writes it.
  const figure = (metric: Metric, r: RangeStats) =>
    metric === 'savingsRate' ? `${r.savingsRate.toFixed(2)}%` : formatCurrency(r[metric]);

  const cells = [
    {
      key: 'income', metric: 'income' as Metric, icon: ArrowUpRight, color: 'var(--pine)', label: d.dashboard.income,
      value: formatCurrency(income), note: d.dashboard.standardIncomeOnly,
      info: (
        <InfoTooltip label={d.dashboard.incomeTooltipLabel}>
          {renderTemplate(d.dashboard.incomeTooltip, { emphasis: <strong>{d.dashboard.incomeEmphasis}</strong> })}
        </InfoTooltip>
      ),
    },
    {
      key: 'spending', metric: 'spending' as Metric, icon: ArrowDownRight, color: 'var(--wine)', label: d.dashboard.spending,
      value: formatCurrency(spending), note: '',
      info: <InfoTooltip label={d.dashboard.spendingTooltipLabel}>{d.dashboard.spendingTooltip}</InfoTooltip>,
    },
    {
      key: 'rate', metric: 'savingsRate' as Metric, icon: Percent, color: 'var(--gold)', label: d.dashboard.savingsRate,
      value: `${savingsRate.toFixed(2)}%`, note: '',
      info: (
        <InfoTooltip label={d.dashboard.savingsTooltipLabel}>
          {renderTemplate(d.dashboard.savingsTooltip, { emphasis: <strong>{d.dashboard.savingsEmphasis}</strong> })}
        </InfoTooltip>
      ),
    },
    {
      key: 'saved', metric: 'saved' as Metric, icon: Wallet, color: 'var(--pine)', label: d.dashboard.saved,
      value: formatCurrency(saved), note: '',
      info: <InfoTooltip label={d.dashboard.savedTooltipLabel}>{d.dashboard.savedTooltip}</InfoTooltip>,
    },
  ];

  return (
    <div className="card pb-stats-card pb-dash-stats">
      <div className="pb-stats-head">
        <h3 className="pb-stats-title" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}><PeriodDot />{d.dashboard.periodTitle}</h3>
        {/* The ONE element carrying this id: PeriodLink scrolls to and pulses it. */}
        <div className="pb-stats-controls pb-dash-period" id="pb-period-control">
          <span className="pb-dash-select is-mode">
            <select value={statsMode} onChange={(e) => onModeChange(e.target.value)} aria-label={ux.periodType}>
              {/* value is the stored mode key; only the text is translated. */}
              {modes.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            {/* Phone only (dashboard.css): the visible face of the select,
                showing the CHOSEN option, with the native select laid over it
                transparently (so the iOS wheel still opens). The face sizes
                the control, rather than the select's own width, which is its
                longest option and which Safari will not let CSS override - the
                two controls then could not share one row. Hidden from
                assistive tech: the select itself is what is announced. */}
            <span className="pb-dash-select-sizer" aria-hidden="true">{modes.find((m) => m.value === statsMode)?.label}</span>
            <ChevronDown size={14} aria-hidden="true" />
          </span>
          {periods.length > 0 && (
            <span className="pb-dash-stepper">
              <button
                type="button" className="pb-dash-step" aria-label={ux.prevPeriod}
                disabled={!older} onClick={() => older && onPeriodChange(older.key)}
              >
                <ChevronLeft size={16} aria-hidden="true" />
              </button>
              <span className="pb-dash-select is-period">
                <select value={statsPeriod || ''} onChange={(e) => onPeriodChange(e.target.value)} aria-label={ux.periodPick}>
                  {periods.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>
                {/* Phone only, like the mode's face: the full name, and a
                    shorter one the card switches to when the stepper is too
                    narrow for it ("Oct 2026"), so the row never wraps. */}
                {current && (
                  <span className="pb-dash-select-face" aria-hidden="true">
                    <span className="pb-dash-face-full">{current.label}</span>
                    <span className="pb-dash-face-short">{shortPeriodLabel(current, locale, (year, q) => t(ux.quarterShort, { year, q }))}</span>
                  </span>
                )}
              </span>
              <button
                type="button" className="pb-dash-step" aria-label={ux.nextPeriod}
                disabled={!newer} onClick={() => newer && onPeriodChange(newer.key)}
              >
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </span>
          )}
        </div>
      </div>
      <p className="pb-stats-range">
        {/* A date range, not money: tabular but never blurred. */}
        <span className="pb-tnum">{rangeLabel}</span>
        {inProgress && <span>&nbsp;{inProgressNote ?? d.dashboard.inProgressNote}</span>}
        <InfoTooltip label={d.dashboard.periodTooltipLabel}>
          {renderTemplate(d.dashboard.periodCover, { emphasis: <strong>{d.dashboard.periodCoverEmphasis}</strong> })}
          {inProgress && (
            <>
              {' '}{renderTemplate(d.dashboard.periodInProgress, { emphasis: <strong>{d.dashboard.periodInProgressEmphasis}</strong> })}
            </>
          )}
          {' '}{renderTemplate(d.dashboard.periodAnalysis, { emphasis: <strong>{d.dashboard.periodAnalysisEmphasis}</strong> })}
        </InfoTooltip>
      </p>
      <div className="pb-stats-grid">
        {cells.map((c) => {
          const Icon = c.icon;
          const delta = compare?.previous ? deltaFor(c.metric, compare.current, compare.previous, compareLabel) : null;
          return (
            <div key={c.key} className="pb-stats-cell pb-dash-tile">
              <div className="pb-stats-label">
                <span className="pb-stats-icon" style={{ color: c.color }} aria-hidden="true"><Icon size={14} /></span>
                <span>{c.label}</span>
                {c.info}
              </div>
              <div className="pb-dash-tile-value">
                {c.metric === 'savingsRate' && income > 0 ? (
                  // The figure and its ring explain themselves: hover (Mac),
                  // focus or tap (phone) says what the ring shows, in the
                  // change chip's popover. In privacy mode a tap on the
                  // blurred figure or ring reveals it first, as everywhere.
                  <CompareTip
                    className="pb-dash-rate-btn" hint={ux.rateOpen} closeOnPanelTap
                    panel={(
                      <>
                        <p className="pb-dash-cmp-title">{d.dashboard.savingsRate}</p>
                        <p className="pb-dash-rate-says">
                          {renderTemplate(savingsRate < 0 ? ux.rateOver : ux.rateKept, {
                            rate: <span className="font-mono-tab">{ratePct(savingsRate)}</span>,
                          })}
                        </p>
                        <p className="pb-dash-cmp-says">{ux.rateHealthy}</p>
                      </>
                    )}
                  >
                    <span className="font-mono-tab pb-stats-value">{c.value}</span>
                    <RateRing rate={savingsRate} />
                  </CompareTip>
                ) : (
                  <div className="font-mono-tab pb-stats-value">{c.value}</div>
                )}
              </div>
              {/* Reserved like the note row, so tiles stay level before the
                  comparison resolves and when there is nothing to compare. */}
              <div className="pb-dash-tile-delta">
                {delta && compare?.previous ? (
                  <CompareTip
                    hint={ux.compareOpen}
                    panel={(
                      <>
                        <p className="pb-dash-cmp-title">{t(ux.compareTitle, { range: compareLabel })}</p>
                        <p className="pb-dash-cmp-row">
                          <span>{inProgress ? ux.compareNow : ux.compareNowDone}</span>
                          <span className="font-mono-tab">{figure(c.metric, compare.current)}</span>
                        </p>
                        <p className="pb-dash-cmp-row">
                          <span className="pb-tnum">{compareLabel}</span>
                          <span className="font-mono-tab">{figure(c.metric, compare.previous)}</span>
                        </p>
                        <p className="pb-dash-cmp-says">{delta.label}</p>
                      </>
                    )}
                  >
                    <DeltaChip delta={delta.delta} text={delta.text} good={delta.good} money={delta.money} />
                    <span className="pb-dash-tile-vs">{t(ux.vsRange, { range: compareLabel })}</span>
                  </CompareTip>
                ) : compare && !compare.previous ? (
                  <span className="pb-dash-tile-vs">{ux.noEarlier}</span>
                ) : '\u00a0'}
              </div>
              {/* Every tile reserves the note row, so a tile without a note
                  matches the height of the one that has it. */}
              <div className="pb-stats-note" aria-hidden={c.note ? undefined : true} style={c.note ? undefined : { visibility: 'hidden' }}>{c.note || '\u00a0'}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
