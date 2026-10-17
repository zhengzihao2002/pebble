'use client';

import { ArrowDownRight, ArrowUpRight, ChevronDown, ChevronLeft, ChevronRight, Percent, Wallet } from 'lucide-react';
import { InfoTooltip } from '@/components/shared/InfoTooltip';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { renderTemplate } from '@/lib/i18n/RichText';
import { PeriodDot } from '@/components/shared/PeriodLink';
import { DeltaChip } from '@/components/kit/DeltaChip';
import { Sparkline } from '@/components/kit/Sparkline';
import { ProgressRing } from '@/components/kit/ProgressRing';
import { healthHue } from '@/lib/healthBar';
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
 * period is in progress - see src/lib/periodCompare.ts) and a small trend of
 * the same figure over the last few comparable periods.
 */
export function DashboardStatsCard({
  modes, statsMode, onModeChange, periods, statsPeriod, onPeriodChange,
  rangeLabel, inProgress, inProgressNote, income, spending, savingsRate, saved,
  compare = null, compareLabel = '',
}: DashboardStatsCardProps) {
  const { d, t } = useTranslation();
  const ux = d.ux.dashboard;
  const deltaFor = useDelta();

  // Newest first: "previous" is the next index, "next" the one before.
  const idx = periods.findIndex((p) => p.key === statsPeriod);
  const older = idx >= 0 ? periods[idx + 1] : undefined;
  const newer = idx > 0 ? periods[idx - 1] : undefined;

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
          <span className="pb-dash-select">
            <select value={statsMode} onChange={(e) => onModeChange(e.target.value)} aria-label={ux.periodType}>
              {/* value is the stored mode key; only the text is translated. */}
              {modes.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
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
          const series = compare && compare.series.length > 1 ? compare.series.map((s) => s[c.metric]) : null;
          return (
            <div key={c.key} className="pb-stats-cell pb-dash-tile">
              <div className="pb-stats-label">
                <span className="pb-stats-icon" style={{ color: c.color }} aria-hidden="true"><Icon size={14} /></span>
                <span>{c.label}</span>
                {c.info}
              </div>
              <div className="pb-dash-tile-value">
                <div className="font-mono-tab pb-stats-value">{c.value}</div>
                {c.metric === 'savingsRate' && income > 0 && (
                  // The ring shows the rate too, so it blurs with it in privacy
                  // mode. Full at 50%+, coloured like the health bar.
                  <span className="pb-chart-fill pb-dash-tile-ring">
                    <ProgressRing value={Math.max(0, savingsRate) / 50} size={28} stroke={4} color={`oklch(var(--hp-l) var(--hp-c) ${healthHue(savingsRate)})`} />
                  </span>
                )}
              </div>
              {/* Reserved like the note row, so tiles stay level before the
                  comparison resolves and when there is nothing to compare. */}
              <div className="pb-dash-tile-delta">
                {delta ? (
                  <>
                    <DeltaChip delta={delta.delta} text={delta.text} good={delta.good} label={delta.label} money={delta.money} />
                    <span className="pb-dash-tile-vs">{t(ux.vsRange, { range: compareLabel })}</span>
                  </>
                ) : compare && !compare.previous ? (
                  <span className="pb-dash-tile-vs">{ux.noEarlier}</span>
                ) : '\u00a0'}
              </div>
              {/* Every tile reserves the note row, so a tile without a note
                  matches the height of the one that has it. */}
              <div className="pb-stats-note" aria-hidden={c.note ? undefined : true} style={c.note ? undefined : { visibility: 'hidden' }}>{c.note || '\u00a0'}</div>
              <div className="pb-dash-tile-spark">
                {series && (
                  <Sparkline
                    values={series} height={24} color={c.color} area endDot
                    baseline={c.metric === 'saved' && series.some((v) => v < 0) ? 0 : undefined}
                    label={t(ux.trendLabel, { name: c.label, count: series.length })}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
