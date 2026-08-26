'use client';

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { MonthlyDeduction } from '@/lib/analysis/income';

// Hex literal, not var(): Recharts renders SVG attributes that do not resolve
// CSS custom properties in every context. Matches the dashboard charts.
const GOLD = '#AD7B2E';

/** Deduction rate per month. Months with no gross income are gaps, not zeroes -
 *  connectNulls stays false so a break in pay is visible as a break. */
export function DeductionChart({ data }: { data: MonthlyDeduction[] }) {
  return (
    <div style={{ width: '100%', height: 200 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
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
            width={44}
            tickFormatter={(v) => `${Number(v).toFixed(0)}%`}
          />
          <Tooltip
            formatter={(v) => `${Number(v).toFixed(1)}%`}
            contentStyle={{ borderRadius: 10, border: '1px solid #E1E4DD', fontSize: 13 }}
          />
          <Line
            type="monotone"
            dataKey="rate"
            stroke={GOLD}
            strokeWidth={2}
            dot={{ r: 3, fill: GOLD }}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
