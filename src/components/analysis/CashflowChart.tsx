'use client';

import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { formatCurrency } from '@/lib/format';
import type { MonthlyFlow } from '@/lib/analysis/cashflow';

// Hex literals, not var(): Recharts renders SVG attributes that do not resolve
// CSS custom properties in every context. Matches the dashboard charts.
const PINE = '#1F5A45';
const WINE = '#8C3A46';
const GOLD = '#AD7B2E';

/** Net flow per month. Negative bars are wine, so overspending reads instantly. */
export function CashflowChart({ data }: { data: MonthlyFlow[] }) {
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
            contentStyle={{ borderRadius: 10, border: '1px solid #E1E4DD', fontSize: 13 }}
          />
          <Bar dataKey="net" radius={[6, 6, 0, 0]}>
            {data.map((d) => (
              <Cell key={d.key} fill={d.isPartial ? GOLD : d.net < 0 ? WINE : PINE} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
