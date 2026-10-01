'use client';

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import type { MonthlySpend } from '@/lib/analysis/spending';

// Theme tokens, not hex: var() resolves in these SVG attributes, so the bars
// follow the theme and dark mode.
const PINE = 'var(--pine)';
const GOLD = 'var(--gold)';
const CURSOR = 'color-mix(in srgb, var(--pine) 8%, transparent)';

export function MonthlySpendChart({ data }: { data: MonthlySpend[] }) {
  // Destructured as `dict`, not `d`: data.map((d) => ...) below uses `d` for
  // the per-bar MonthlySpend entry, and that name must not be shadowed.
  const { d: dict } = useTranslation();
  return (
    <div className="pb-chart-fade" style={{ width: '100%', height: 220 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: 'var(--ink-soft)' }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={8}
          />
          {/* No Y axis: at 375px it costs more width than it returns.
              Values are in the hover tooltip and in the tiles above. */}
          {/* Colours, border and size come from the global
              .recharts-default-tooltip rule in globals.css. */}
          <Tooltip cursor={{ fill: CURSOR }} formatter={(v) => formatCurrency(Number(v))} />
          <Bar dataKey="total" name={dict.donutChart.total} radius={[6, 6, 0, 0]} isAnimationActive={false}>
            {data.map((d) => (
              // Gold marks the in-progress month, so a part-finished month is
              // not misread as a genuine drop in spending.
              <Cell key={d.key} fill={d.isPartial ? GOLD : PINE} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
