'use client';

import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import type { MonthlySpend } from '@/lib/analysis/spending';
import { ChartTooltip } from './ChartTooltip';
import { wholeDollars } from './parts';

// Theme tokens, not hex: var() resolves in these SVG attributes, so the bars
// follow the theme and dark mode.
const PINE = 'var(--pine)';
const GOLD = 'var(--gold)';
const STRONG = 'var(--pine-strong)';
const CURSOR = 'color-mix(in srgb, var(--pine) 8%, transparent)';

/** The average line's label, drawn past the right end of the line, outside
 *  the plot (the chart keeps a right margin for it), so neither the dash nor
 *  the bars run through it. Two lines ("avg" / amount) keep it narrow.
 *  Classed recharts-label, so privacy mode still blurs the amount. */
function AvgLabel({ viewBox, head, amount }: { viewBox?: { x?: number; y?: number; width?: number }; head?: string; amount?: string }) {
  if (!viewBox || amount === undefined) return null;
  const { x = 0, y = 0, width = 0 } = viewBox;
  const left = x + width + 6;
  return (
    <text className="recharts-label" x={left} y={y - 3} fontSize={11} fill="var(--ink-soft)">
      <tspan x={left} dy={0}>{head}</tspan>
      <tspan x={left} dy={13} className="font-mono-tab">{amount}</tspan>
    </text>
  );
}

/** Total for the month, and how it compares with the period average. */
function SpendTip({ active, payload, average }: {
  active?: boolean; payload?: ReadonlyArray<{ payload?: MonthlySpend }>; average?: number | null;
}) {
  const { d, t } = useTranslation();
  const m = payload?.[0]?.payload;
  if (!active || !m) return null;
  const vs = average ? Math.round(((m.total - average) / average) * 100) : null;
  return (
    <ChartTooltip
      title={m.label}
      rows={[{ name: d.donutChart.total, value: formatCurrency(m.total), color: PINE }]}
      foot={vs === null ? undefined : t(d.ux.analysis.vsAverage, { pct: `${vs > 0 ? '+' : vs < 0 ? '\u2212' : ''}${Math.abs(vs)}%` })}
    />
  );
}

/** `average` (optional): the period's average monthly spend, drawn as a
 *  reference line that gives the bars a scale without a Y axis. The highest
 *  month is a deeper pine, so the peak is found without reading every bar. */
export function MonthlySpendChart({ data, average = null }: { data: MonthlySpend[]; average?: number | null }) {
  // Destructured as `dict`, not `d`: data.map((d) => ...) below uses `d` for
  // the per-bar MonthlySpend entry, and that name must not be shadowed.
  const { d: dict, t } = useTranslation();
  // "avg {amount}" split at the placeholder, so the word and the amount
  // stack in two short lines beside the line's end.
  const avgHead = t(dict.ux.analysis.avgLine, { amount: '' }).trim();
  const peak = data.reduce((best, m) => (m.total > best ? m.total : best), 0);
  return (
    <div className="pb-chart-fade pb-ana-chart is-tall">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 18, right: average !== null && average > 0 ? 58 : 14, bottom: 0, left: 14 }}>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: 'var(--ink-soft)' }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={16}
          />
          {/* No Y axis: at 375px it costs more width than it returns.
              Values are in the hover tooltip and in the tiles above; the
              average line gives the bars their scale. */}
          <Tooltip cursor={{ fill: CURSOR }} content={<SpendTip average={average} />} />
          <Bar dataKey="total" name={dict.donutChart.total} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false}>
            {data.map((d) => (
              // Gold marks the in-progress month, so a part-finished month is
              // not misread as a genuine drop in spending.
              <Cell key={d.key} fill={d.isPartial ? GOLD : d.total === peak && peak > 0 ? STRONG : PINE} />
            ))}
          </Bar>
          {average !== null && average > 0 && (
            // A recharts-label, so privacy mode blurs the amount with the axis.
            <ReferenceLine
              y={average} stroke="var(--ink-soft)" strokeDasharray="4 4" ifOverflow="extendDomain"
              label={<AvgLabel head={avgHead} amount={wholeDollars(average)} />}
            />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
