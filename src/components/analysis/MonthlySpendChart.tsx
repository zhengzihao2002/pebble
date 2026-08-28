'use client';

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import type { MonthlySpend } from '@/lib/analysis/spending';

/**
 * Hex literals, not var(--pine): Recharts renders to SVG attributes that do
 * not resolve CSS custom properties in every context. This matches the
 * existing dashboard charts. VERIFY IN DARK MODE rather than assuming.
 */
const PINE = '#1F5A45';
const GOLD = '#AD7B2E';

export function MonthlySpendChart({ data }: { data: MonthlySpend[] }) {
  // Destructured as `dict`, not `d`: data.map((d) => ...) below uses `d` for
  // the per-bar MonthlySpend entry, and that name must not be shadowed.
  const { d: dict } = useTranslation();
  return (
    <div style={{ width: '100%', height: 220 }}>
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
          <Tooltip
            cursor={{ fill: 'rgba(31,90,69,0.08)' }}
            formatter={(v) => formatCurrency(Number(v))}
            contentStyle={{ borderRadius: 10, fontSize: 13 }}
            // Border/background/text colour come from the global
            // .recharts-default-tooltip rule in globals.css - see Step 28.
            // A hardcoded '#E1E4DD' border here would be dead weight at best
            // and a second source of truth at worst.
          />
          <Bar dataKey="total" name={dict.donutChart.total} radius={[6, 6, 0, 0]}>
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
