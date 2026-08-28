'use client';

import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import type { MonthlyFlow } from '@/lib/analysis/cashflow';

// Hex literals, not var(): Recharts renders SVG attributes that do not resolve
// CSS custom properties in every context. Matches the dashboard charts.
const PINE = '#1F5A45';
const WINE = '#8C3A46';
const GOLD = '#AD7B2E';

/** Net flow per month. Negative bars are wine, so overspending reads instantly. */
export function CashflowChart({ data }: { data: MonthlyFlow[] }) {
  // Destructured as `dict`, not `d`: data.map((d) => ...) below uses `d` for
  // the per-bar MonthlyFlow entry.
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
          <ReferenceLine y={0} stroke="var(--line)" />
          <Tooltip
            cursor={{ fill: 'rgba(31,90,69,0.08)' }}
            formatter={(v) => formatCurrency(Number(v))}
            contentStyle={{ borderRadius: 10, fontSize: 13 }}
            // Border/background/text colour come from the global
            // .recharts-default-tooltip rule in globals.css - see Step 28.
            // A hardcoded '#E1E4DD' border here would be dead weight at best
            // and a second source of truth at worst.
          />
          <Bar dataKey="net" name={dict.analysis.currentMonth.net} radius={[6, 6, 0, 0]}>
            {data.map((d) => (
              <Cell key={d.key} fill={d.isPartial ? GOLD : d.net < 0 ? WINE : PINE} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
