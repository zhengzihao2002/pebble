'use client';

import { Area, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { CalendarDays } from 'lucide-react';
import { ProgressRing } from '@/components/kit/ProgressRing';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { renderTemplate } from '@/lib/i18n/RichText';
import type { CurrentMonthSummary } from '@/lib/analysis/currentMonth';
import { CardHead, ScopeBadge, countNote, wholeDollars } from './parts';

interface CurrentMonthCardProps {
  current: CurrentMonthSummary;
  /** Cumulative spend per day, 1..today (computeCurrentMonthDaily). */
  daily: number[];
  /** The period's average monthly spend - the "typical month". Null hides
   *  every comparison: there is nothing honest to compare with. */
  typical: number | null;
}

type Point = { day: number; spent: number | null; typical: number | null };

function DayTip({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload?: Point }> }) {
  const { d, t } = useTranslation();
  const x = d.ux.analysis;
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  return (
    <div className="pb-ana-tip">
      <p className="pb-ana-tip-title pb-tnum">{t(x.dayTick, { day: p.day })}</p>
      {p.spent !== null && (
        <p className="pb-ana-tip-row"><span><i style={{ background: 'var(--wine)' }} />{x.thisMonth}</span><span className="font-mono-tab">{formatCurrency(p.spent)}</span></p>
      )}
      {p.typical !== null && (
        <p className="pb-ana-tip-row"><span><i style={{ background: 'var(--ink-soft)' }} />{x.typicalMonth}</span><span className="font-mono-tab">{formatCurrency(p.typical)}</span></p>
      )}
    </div>
  );
}

/**
 * The month in progress as a live instrument: how far through it you are,
 * what has gone out against what a typical month has spent by this day, and
 * the day-by-day climb against a straight "typical month" line.
 *
 * Still deliberately OUTSIDE every other figure: the comparison reads the
 * period's average, it never mixes the part-month into it. Every comparison
 * is an estimate and says so. Spent, Earned and Net keep their notes.
 */
export function CurrentMonthCard({ current, daily, typical }: CurrentMonthCardProps) {
  const { d, t } = useTranslation();
  const x = d.ux.analysis;
  const cm = d.analysis.currentMonth;

  const byNow = typical !== null ? typical * current.progress : null;
  const gap = byNow !== null ? current.spending - byNow : null;
  // Within 3% of typical (or $5) reads as "about the same".
  const same = gap !== null && byNow !== null && Math.abs(gap) <= Math.max(5, byNow * 0.03);
  const scaleMax = Math.max(current.spending, typical ?? 0, 1);

  const data: Point[] = Array.from({ length: current.daysInMonth }, (_, i) => ({
    day: i + 1,
    spent: i < daily.length ? daily[i] : null,
    typical: typical !== null ? (typical * (i + 1)) / current.daysInMonth : null,
  }));

  return (
    <section className="card pb-ana-card pb-ana-now pb-rise" style={{ ['--pb-i' as string]: 1 }} aria-labelledby="pb-ana-now-title">
      <CardHead
        id="pb-ana-now-title"
        icon={<CalendarDays size={15} />}
        title={t(cm.title, { month: current.label })}
        tooltipLabel={cm.tooltipLabel}
        tooltip={cm.tooltip}
        scope={t(cm.scope, { day: current.dayOfMonth, total: current.daysInMonth })}
      />

      <div className="pb-ana-now-body">
        <ProgressRing value={current.progress} size={88} stroke={8} color="var(--gold)" label={t(x.dayRing, { day: current.dayOfMonth, total: current.daysInMonth })}>
          <span className="pb-ana-now-day pb-tnum">{current.dayOfMonth}</span>
          <span className="pb-ana-now-of pb-tnum">{t(x.dayOf, { total: current.daysInMonth })}</span>
        </ProgressRing>

        <div className="pb-ana-now-figs">
          <div className="pb-ana-now-fig">
            <span className="pb-ana-now-name">{cm.spent}</span>
            <span className="font-mono-tab pb-ana-now-amt">{formatCurrency(current.spending)}</span>
            <span className="pb-ana-now-note pb-tnum">{countNote(current.expenseCount, d, t)}</span>
          </div>
          <div className="pb-ana-now-fig">
            <span className="pb-ana-now-name">{cm.earned}</span>
            <span className="font-mono-tab pb-ana-now-amt">{formatCurrency(current.income)}</span>
            <span className="pb-ana-now-note">{cm.earnedNote}</span>
          </div>
          <div className="pb-ana-now-fig">
            <span className="pb-ana-now-name">{cm.net}</span>
            <span className="font-mono-tab pb-ana-now-amt" style={{ color: current.net >= 0 ? 'var(--pine)' : 'var(--wine)' }}>{formatCurrency(current.net)}</span>
            <span className="pb-ana-now-note">{current.net >= 0 ? d.analysis.puttingAside : d.analysis.drawingDown}</span>
          </div>
        </div>
      </div>

      {byNow !== null && gap !== null && (
        <div className="pb-ana-now-pace">
          <div className="pb-ana-now-pace-head">
            <span>
              {same ? x.aboutUsual : renderTemplate(gap > 0 ? x.moreThanUsual : x.lessThanUsual, {
                amount: <span className="font-mono-tab">{wholeDollars(Math.abs(gap))}</span>,
              })}
            </span>
            <ScopeBadge>{x.estimate}</ScopeBadge>
          </div>
          {/* Spend so far on a scale to the larger of it and a typical month,
              with a tick at "typical by today". */}
          <div className="pb-ana-now-track pb-chart-fill" aria-hidden="true">
            <span className={`pb-ana-now-fill${gap > 0 && !same ? ' is-over' : ''}`} style={{ width: `${(current.spending / scaleMax) * 100}%` }} />
            <span className="pb-ana-now-tick" style={{ left: `${(byNow / scaleMax) * 100}%` }} />
          </div>
          <div className="pb-ana-now-legend">
            <span><i className={`is-spent${gap > 0 && !same ? ' is-over' : ''}`} />{x.thisMonth}</span>
            <span><i className="is-typical" />{x.typicalByNow}</span>
          </div>
        </div>
      )}

      <div className="pb-chart-fade pb-ana-now-chart" role="img" aria-label={x.cumulativeLabel}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: 6 }}>
            <XAxis
              dataKey="day" tick={{ fontSize: 11, fill: 'var(--ink-soft)' }} axisLine={false} tickLine={false}
              ticks={[1, Math.ceil(current.daysInMonth / 2), current.daysInMonth]}
            />
            <Tooltip content={<DayTip />} cursor={{ stroke: 'var(--line)' }} />
            {typical !== null && (
              <Line dataKey="typical" stroke="var(--ink-soft)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} activeDot={false} isAnimationActive={false} />
            )}
            <Area
              dataKey="spent" stroke="var(--wine)" strokeWidth={2} fill="var(--wine)" fillOpacity={0.1}
              connectNulls={false} isAnimationActive={false}
              dot={(props: { cx?: number; cy?: number; index?: number }) => (
                props.index === daily.length - 1 && props.cx != null && props.cy != null
                  ? <circle key="end" cx={props.cx} cy={props.cy} r={4} fill="var(--wine)" stroke="var(--mist)" strokeWidth={2} />
                  : <g key={props.index} />
              )}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
