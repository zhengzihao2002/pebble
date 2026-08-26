'use client';

import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { formatCurrency } from '@/lib/format';
import type { YearStats } from '@/lib/analysis/projection';

// Hex literals, not var(): Recharts renders SVG attributes that do not resolve
// CSS custom properties in every context. Matches the dashboard charts.
const PINE = '#1F5A45';
const WINE = '#8C3A46';

export function YearOverYearChart({ data }: { data: YearStats[] }) {
  const rows = data.map((d) => ({
    label: d.isCurrent ? `${d.year} (so far)` : String(d.year),
    Income: d.income,
    Spending: d.spending,
  }));

  return (
    <div style={{ width: '100%', height: 240 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: 'var(--ink-soft)' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: 'rgba(31,90,69,0.08)' }}
            formatter={(v) => formatCurrency(Number(v))}
            contentStyle={{ borderRadius: 10, border: '1px solid #E1E4DD', fontSize: 13 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="Income" fill={PINE} radius={[6, 6, 0, 0]} />
          <Bar dataKey="Spending" fill={WINE} radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
