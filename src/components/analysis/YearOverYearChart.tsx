'use client';

import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import type { YearStats } from '@/lib/analysis/projection';

// Theme tokens, not hex: var() resolves in these SVG attributes, so the bars
// and legend swatches follow the theme and dark mode.
const PINE = 'var(--pine)';
const WINE = 'var(--wine)';
const CURSOR = 'color-mix(in srgb, var(--pine) 8%, transparent)';

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
    <div className="pb-chart-fade" style={{ width: '100%', height: 240 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: 'var(--ink-soft)' }}
            axisLine={false}
            tickLine={false}
          />
          {/* Colours, border and size come from the global
              .recharts-default-tooltip rule in globals.css. */}
          <Tooltip cursor={{ fill: CURSOR }} formatter={(v) => formatCurrency(Number(v))} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="Income" name={dict.dashboard.income} fill={PINE} radius={[6, 6, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="Spending" name={dict.dashboard.spending} fill={WINE} radius={[6, 6, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
