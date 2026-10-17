'use client';

import { useId, useMemo } from 'react';
import { Area, AreaChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { LineChart as LineChartIcon } from 'lucide-react';
import { formatCurrency, formatDate, formatFullDate } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { renderTemplate } from '@/lib/i18n/RichText';
import { SectionHeader } from '@/components/kit/SectionHeader';
import { Skeleton } from '@/components/kit/Skeleton';
import type { DayPoint } from './statementMath';

interface MonthBalanceChartProps {
  /** From daySeries(): point 0 is the opening, then one point per day up to today. */
  points: DayPoint[] | null;
  opening: number;
  /** Whether the month has any rows in this view. */
  hasActivity: boolean;
  /** Scroll the statement to a day ('YYYY-MM-DD'). */
  onPickDay: (date: string) => void;
  subtitle?: string;
}

/**
 * The balance through the month: a step line of each day's END balance, from
 * the opening on the left to today (or the month's last day) on the right -
 * never projected forward. It plots the running balance, which only the
 * statement has; Insights' day-by-day view is a spending heatmap, a different
 * question.
 *
 * Steps, not a smooth curve: a balance does not drift between records, it
 * jumps. Dots mark days with activity (bigger for busier days), a dashed line
 * marks the opening, and the month's low point gets a quiet label. Picking a
 * day scrolls the statement to it.
 *
 * Inside .pb-chart-fade: blurred in privacy mode, tap to reveal, fades in
 * rather than growing from zero. points is null until the zone-aware today
 * is known (after mount), so the server and first client render agree.
 */
export function MonthBalanceChart({ points, opening, hasActivity, onPickDay, subtitle }: MonthBalanceChartProps) {
  const { d, t, locale } = useTranslation();
  const x = d.ux.transactions;
  const gradientId = `pb-txn-bal-${useId().replace(/:/g, '')}`;

  const low = useMemo(() => {
    if (!points || points.length < 3 || !hasActivity) return null;
    let best = points[1];
    for (const p of points.slice(1)) if (p.balance < best.balance) best = p;
    // Only worth a label when it is actually below where the month began.
    return best.balance < opening - 0.005 ? best : null;
  }, [points, opening, hasActivity]);

  const lastDay = points ? points[points.length - 1].day : 0;
  const yPad = useMemo(() => {
    if (!points) return { span: 1 };
    const vals = points.map((p) => p.balance);
    return { span: Math.max(...vals) - Math.min(...vals) };
  }, [points]);
  const maxCount = points ? Math.max(1, ...points.map((p) => p.count)) : 1;

  return (
    <section className="card pb-txn-chart-card">
      <SectionHeader
        title={x.balanceChart}
        subtitle={subtitle}
        icon={LineChartIcon}
      />
      <div className="pb-txn-chart pb-chart-fade">
        {!points ? (
          <Skeleton height="100%" radius="0.75rem" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={points}
              margin={{ top: 12, right: 26, bottom: 0, left: 14 }}
              onClick={(state) => {
                const i = typeof state?.activeTooltipIndex === 'number' ? state.activeTooltipIndex : Number(state?.activeTooltipIndex);
                const p = Number.isFinite(i) ? points[i] : undefined;
                if (p?.date) onPickDay(p.date);
              }}
              style={{ cursor: hasActivity ? 'pointer' : 'default' }}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--pine)" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="var(--pine)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="day" type="number" domain={[0, Math.max(1, lastDay)]}
                ticks={lastDay > 1 ? [1, lastDay] : [1]}
                tickLine={false} axisLine={{ stroke: 'var(--line)' }}
                tick={{ fill: 'var(--ink-soft)', fontSize: 11 }}
                tickFormatter={(v: number) => (points[v]?.date ? formatDate(points[v].date as string, locale) : '')}
              />
              {/* Padded below so the line never sits on the axis and the low
                  label has a band of its own under the line. */}
              <YAxis
                hide
                domain={[(min: number) => min - Math.max(1, yPad.span) * 0.3, (max: number) => max + Math.max(1, yPad.span) * 0.08]}
              />
              <ReferenceLine y={opening} stroke="var(--ink-faint)" strokeDasharray="3 4" />
              {low && low.date && (
                <ReferenceDot
                  x={low.day} y={low.balance} r={0}
                  // Under the dot, in the padded band below the line.
                  label={{ value: t(x.low, { date: formatDate(low.date, locale) }), position: 'bottom', fill: 'var(--ink-soft)', fontSize: 11, offset: 7 }}
                />
              )}
              <Tooltip
                cursor={{ stroke: 'var(--line)' }}
                content={({ active, payload }) => {
                  const p = active && payload && payload[0] ? (payload[0].payload as DayPoint) : null;
                  if (!p || !p.date) return null;
                  return (
                    <div className="recharts-default-tooltip pb-txn-chart-tip">
                      <p className="pb-txn-chart-tip-date">{formatFullDate(p.date, locale)}</p>
                      <p>{renderTemplate(x.endOfDay, { amount: <span className="font-mono-tab">{formatCurrency(p.balance)}</span> })}</p>
                      {p.count > 0 && (
                        <>
                          <p className="pb-txn-chart-tip-soft">
                            {renderTemplate(x.inAmount, { amount: <span className="font-mono-tab">{formatCurrency(p.inflow)}</span> })}
                            {' · '}
                            {renderTemplate(x.outAmount, { amount: <span className="font-mono-tab">{formatCurrency(p.outflow)}</span> })}
                          </p>
                          <p className="pb-txn-chart-tip-soft pb-tnum">{p.count === 1 ? x.countOne : t(x.countOther, { count: p.count })}</p>
                        </>
                      )}
                    </div>
                  );
                }}
              />
              <Area
                type="stepAfter" dataKey="balance" isAnimationActive={false}
                stroke="var(--pine)" strokeWidth={2} strokeLinejoin="round" fill={`url(#${gradientId})`}
                dot={(props: { cx?: number; cy?: number; index?: number }) => {
                  const p = props.index !== undefined ? points[props.index] : undefined;
                  if (!p || p.count === 0 || props.cx === undefined || props.cy === undefined) return <g key={`d${props.index}`} />;
                  const r = 2 + (p.count / maxCount) * 2;
                  return <circle key={`d${props.index}`} cx={props.cx} cy={props.cy} r={r} className="pb-txn-chart-dot" />;
                }}
                activeDot={{ r: 4, stroke: 'var(--mist)', strokeWidth: 2, fill: 'var(--pine)' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
      <p className="pb-txn-chart-foot">
        {hasActivity
          ? x.chartHint
          : renderTemplate(d.transactions.carriedForward, {
            amount: <span className="font-mono-tab">{formatCurrency(opening)}</span>,
          })}
      </p>
    </section>
  );
}
