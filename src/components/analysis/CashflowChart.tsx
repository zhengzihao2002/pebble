'use client';

import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import type { MonthlyFlow } from '@/lib/analysis/cashflow';

// Theme tokens, not hex: var() resolves in these SVG attributes, so the bars
// follow the theme and dark mode.
const PINE = 'var(--pine)';
const WINE = 'var(--wine)';
const GOLD = 'var(--gold)';
const CURSOR = 'color-mix(in srgb, var(--pine) 8%, transparent)';

/** Net flow per month. Negative bars are wine, so overspending reads instantly.
 *  Bars appear with the wrapper's fade rather than growing from zero, so no
 *  bar ever shows a false value mid-animation. */
export function CashflowChart({ data }: { data: MonthlyFlow[] }) {
  // Destructured as `dict`, not `d`: data.map((d) => ...) below uses `d` for
  // the per-bar MonthlyFlow entry.
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
          <ReferenceLine y={0} stroke="var(--line)" />
          {/* Colours, border and size come from the global
              .recharts-default-tooltip rule in globals.css. */}
          <Tooltip cursor={{ fill: CURSOR }} formatter={(v) => formatCurrency(Number(v))} />
          <Bar dataKey="net" name={dict.analysis.currentMonth.net} radius={[6, 6, 0, 0]} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.key} fill={d.isPartial ? GOLD : d.net < 0 ? WINE : PINE} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
