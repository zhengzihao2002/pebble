'use client';

import { Bar, BarChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { MonthlyDeduction } from '@/lib/analysis/income';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { ChartTooltip } from './ChartTooltip';

// A theme token, not hex: var() resolves in these SVG attributes (the tick
// text has always used it), so the line follows the theme and dark mode.
const GOLD = 'var(--gold)';
const PINE = 'var(--pine)';
const CURSOR = 'color-mix(in srgb, var(--pine) 8%, transparent)';

export type DeductionView = 'rate' | 'paycheck';

type PayRow = MonthlyDeduction & { withheld: number };

/** Gross, take-home, withheld and the month's rate, for the paycheck view. */
function PayTip({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload?: PayRow }> }) {
  const { d } = useTranslation();
  const x = d.ux.analysis;
  const m = payload?.[0]?.payload;
  if (!active || !m) return null;
  if (m.rate === null) return <ChartTooltip title={m.label} rows={[]} foot={x.noPay} />;
  return (
    <ChartTooltip
      title={m.label}
      rows={[
        { name: x.gross, value: formatCurrency(m.gross) },
        { name: x.takeHome, value: formatCurrency(m.net), color: PINE },
        { name: x.withheld, value: formatCurrency(m.withheld), color: GOLD },
        { name: d.analysis.income.rateSeriesName, value: `${m.rate.toFixed(1)}%`, money: false, strong: true },
      ]}
    />
  );
}

/** Deduction rate per month. Months with no gross income are gaps, not zeroes -
 *  connectNulls stays false so a break in pay is visible as a break.
 *
 *  'paycheck' (optional, off by default) shows the money behind the rate
 *  instead: each month's gross as take-home (pine) stacked under withheld
 *  (gold). One scale, no Y axis - the amounts are in the tooltip - rather
 *  than a second axis beside the rate's. A month with no pay has no bar. */
export function DeductionChart({ data, view = 'rate' }: { data: MonthlyDeduction[]; view?: DeductionView }) {
  const { d: dict } = useTranslation();
  if (view === 'paycheck') {
    const rows: PayRow[] = data.map((m) => ({ ...m, withheld: Math.max(0, m.gross - m.net) }));
    return (
      <div className="pb-chart-fade pb-ana-chart">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 14, bottom: 0, left: 14 }}>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: 'var(--ink-soft)' }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={16}
            />
            <Tooltip cursor={{ fill: CURSOR }} content={<PayTip />} />
            <Bar dataKey="net" stackId="pay" name={dict.ux.analysis.takeHome} fill={PINE} maxBarSize={24} isAnimationActive={false} />
            <Bar dataKey="withheld" stackId="pay" name={dict.ux.analysis.withheld} fill={GOLD} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }
  return (
    <div className="pb-chart-fade pb-ana-chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 18, bottom: 0, left: 0 }}>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: 'var(--ink-soft)' }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={16}
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--ink-soft)' }}
            axisLine={false}
            tickLine={false}
            width={40}
            tickFormatter={(v) => `${Number(v).toFixed(0)}%`}
          />
          {/* Colours, border and size come from the global
              .recharts-default-tooltip rule in globals.css. */}
          <Tooltip formatter={(v) => `${Number(v).toFixed(1)}%`} cursor={{ stroke: 'var(--line)' }} />
          <Line
            type="monotone"
            dataKey="rate"
            name={dict.analysis.income.rateSeriesName}
            stroke={GOLD}
            strokeWidth={2}
            dot={{ r: 3, fill: GOLD }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
