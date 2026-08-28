'use client';

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { MonthlyDeduction } from '@/lib/analysis/income';
import { useTranslation } from '@/lib/i18n/useTranslation';

// Hex literal, not var(): Recharts renders SVG attributes that do not resolve
// CSS custom properties in every context. Matches the dashboard charts.
const GOLD = '#AD7B2E';

/** Deduction rate per month. Months with no gross income are gaps, not zeroes -
 *  connectNulls stays false so a break in pay is visible as a break. */
export function DeductionChart({ data }: { data: MonthlyDeduction[] }) {
  const { d: dict } = useTranslation();
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
            contentStyle={{ borderRadius: 10, fontSize: 13 }}
            // Border/background/text colour come from the global
            // .recharts-default-tooltip rule in globals.css - see Step 28.
            // A hardcoded '#E1E4DD' border here would be dead weight at best
            // and a second source of truth at worst.
          />
          <Line
            type="monotone"
            dataKey="rate"
            name={dict.analysis.income.rateSeriesName}
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
