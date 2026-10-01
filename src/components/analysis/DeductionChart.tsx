'use client';

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { MonthlyDeduction } from '@/lib/analysis/income';
import { useTranslation } from '@/lib/i18n/useTranslation';

// A theme token, not hex: var() resolves in these SVG attributes (the tick
// text has always used it), so the line follows the theme and dark mode.
const GOLD = 'var(--gold)';

/** Deduction rate per month. Months with no gross income are gaps, not zeroes -
 *  connectNulls stays false so a break in pay is visible as a break. */
export function DeductionChart({ data }: { data: MonthlyDeduction[] }) {
  const { d: dict } = useTranslation();
  return (
    <div className="pb-chart-fade" style={{ width: '100%', height: 200 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: 'var(--ink-soft)' }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={8}
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
