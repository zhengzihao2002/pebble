'use client';

import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import type { YearStats } from '@/lib/analysis/projection';

// Hex literals, not var(): Recharts renders SVG attributes that do not resolve
// CSS custom properties in every context. Matches the dashboard charts.
const PINE = '#1F5A45';
const WINE = '#8C3A46';

export function YearOverYearChart({ data }: { data: YearStats[] }) {
  const { d: dict } = useTranslation();
  // 'Income'/'Spending' stay as the row PROPERTY NAMES (dataKey below reads
  // them) - internal plumbing, never displayed. The `name` prop on each <Bar>
  // is what the Legend actually shows, and that is translated. Reuses
  // d.dashboard.income/spending rather than adding new keys - identical
  // words, already localized.
  //
  // yoySoFar reuses the same key AnalysisClient uses for the list below the
  // chart, rather than a second hardcoded ' (so far)' - the two were
  // previously independent copies of the same fact.
  const rows = data.map((d) => ({
    label: d.isCurrent ? `${d.year}${dict.analysis.outlook.yoySoFar}` : String(d.year),
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
            contentStyle={{ borderRadius: 10, fontSize: 13 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="Income" name={dict.dashboard.income} fill={PINE} radius={[6, 6, 0, 0]} />
          <Bar dataKey="Spending" name={dict.dashboard.spending} fill={WINE} radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
