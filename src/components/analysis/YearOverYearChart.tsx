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

/** Two-line tick: the year, then what was saved that year, under each
 *  group - the figure the old list below the chart repeated. */
function SavedTick({ x, y, payload, savedBy }: {
  x?: number; y?: number; payload?: { value?: string }; savedBy: Map<string, string>;
}) {
  return (
    <g transform={`translate(${x ?? 0},${y ?? 0})`}>
      <text dy={12} textAnchor="middle" fontSize={11} fill="var(--ink)">{payload?.value}</text>
      <text dy={26} textAnchor="middle" fontSize={10.5} fill="var(--ink-soft)">{savedBy.get(payload?.value ?? '')}</text>
    </g>
  );
}

export function YearOverYearChart({ data }: { data: YearStats[] }) {
  const { d: dict, t } = useTranslation();
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
    saved: t(dict.analysis.outlook.yoySaved, { pct: d.savingsRate === null ? '—' : `${(d.savingsRate * 100).toFixed(1)}%` }),
    Income: d.income,
    Spending: d.spending,
  }));
  const savedBy = new Map(rows.map((r) => [r.label, r.saved]));

  return (
    <div className="pb-chart-fade pb-ana-chart is-yoy">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
          <XAxis
            dataKey="label"
            tick={<SavedTick savedBy={savedBy} />}
            height={36}
            axisLine={false}
            tickLine={false}
          />
          {/* Colours, border and size come from the global
              .recharts-default-tooltip rule in globals.css. */}
          <Tooltip cursor={{ fill: CURSOR }} formatter={(v) => formatCurrency(Number(v))} />
          <Legend wrapperStyle={{ fontSize: 12 }} verticalAlign="top" align="right" height={28} iconType="circle" iconSize={8}
            formatter={(value) => <span style={{ color: 'var(--ink)' }}>{value}</span>} />
          <Bar dataKey="Income" name={dict.dashboard.income} fill={PINE} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
          <Bar dataKey="Spending" name={dict.dashboard.spending} fill={WINE} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
