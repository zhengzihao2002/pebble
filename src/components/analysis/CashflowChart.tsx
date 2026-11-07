'use client';

import { Bar, BarChart, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import type { MonthlyFlow } from '@/lib/analysis/cashflow';
import { ChartTooltip } from './ChartTooltip';

// Theme tokens, not hex: var() resolves in these SVG attributes, so the bars
// follow the theme and dark mode.
const PINE = 'var(--pine)';
const WINE = 'var(--wine)';
const GOLD = 'var(--gold)';
const INK = 'color-mix(in srgb, var(--ink) 75%, transparent)';
const CURSOR = 'color-mix(in srgb, var(--pine) 8%, transparent)';

export type CashflowView = 'net' | 'inout';

type Row = MonthlyFlow & { out: number };

/** Income, spending, net and the month's savings rate, whichever view. */
function FlowTip({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload?: Row }> }) {
  const { d } = useTranslation();
  const x = d.ux.analysis;
  const m = payload?.[0]?.payload;
  if (!active || !m) return null;
  return (
    <ChartTooltip
      title={m.label}
      rows={[
        { name: x.income, value: formatCurrency(m.income), color: PINE },
        { name: x.spending, value: formatCurrency(m.spending), color: WINE },
        { name: x.net, value: formatCurrency(m.net), strong: true },
        { name: x.savingsRate, value: m.savingsRate === null ? '—' : `${(m.savingsRate * 100).toFixed(1)}%`, money: false },
      ]}
    />
  );
}

/** Net flow per month. Negative bars are wine, so overspending reads instantly.
 *  Bars appear with the wrapper's fade rather than growing from zero, so no
 *  bar ever shows a false value mid-animation.
 *
 *  'inout' (optional, off by default) mirrors the month instead: income above
 *  the zero line, spending below it, net as an ink line - so the two sides
 *  behind each net bar are visible. Net stays the default, unchanged. */
export function CashflowChart({ data, view = 'net' }: { data: MonthlyFlow[]; view?: CashflowView }) {
  // Destructured as `dict`, not `d`: data.map((d) => ...) below uses `d` for
  // the per-bar MonthlyFlow entry.
  const { d: dict } = useTranslation();
  const rows: Row[] = data.map((m) => ({ ...m, out: -m.spending }));
  const axis = (
    <XAxis
      dataKey="label"
      tick={{ fontSize: 11, fill: 'var(--ink-soft)' }}
      axisLine={false}
      tickLine={false}
      interval="preserveStartEnd"
      minTickGap={16}
    />
  );
  return (
    <div className="pb-chart-fade pb-ana-chart is-tall">
      <ResponsiveContainer width="100%" height="100%">
        {view === 'net' ? (
          <BarChart data={rows} margin={{ top: 8, right: 14, bottom: 0, left: 14 }}>
            {axis}
            <ReferenceLine y={0} stroke="var(--line)" />
            <Tooltip cursor={{ fill: CURSOR }} content={<FlowTip />} />
            <Bar dataKey="net" name={dict.analysis.currentMonth.net} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false}>
              {rows.map((d) => (
                <Cell key={d.key} fill={d.isPartial ? GOLD : d.net < 0 ? WINE : PINE} />
              ))}
            </Bar>
          </BarChart>
        ) : (
          <ComposedChart data={rows} stackOffset="sign" margin={{ top: 8, right: 14, bottom: 0, left: 14 }}>
            {axis}
            <ReferenceLine y={0} stroke="var(--line)" />
            <Tooltip cursor={{ fill: CURSOR }} content={<FlowTip />} />
            <Bar dataKey="income" stackId="flow" name={dict.dashboard.income} fill={PINE} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
            <Bar dataKey="out" stackId="flow" name={dict.dashboard.spending} fill={WINE} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
            <Line dataKey="net" name={dict.analysis.currentMonth.net} stroke={INK} strokeWidth={2} strokeLinejoin="round" dot={{ r: 2.5, fill: INK, strokeWidth: 0 }} isAnimationActive={false} />
          </ComposedChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
