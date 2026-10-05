'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { usePebbleStore } from '@/store/usePebbleStore';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import type { CategoryMeta, Transaction } from '@/types';
import { buildCategoryBreakdown } from '@/lib/stats';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';

interface CategoryDonutChartProps {
  transactions: Transaction[];
  categoryMeta: CategoryMeta;
  /** The Dashboard's shared period, owned by the This period card. */
  mode: string;
  periodKey: string | null;
  /** Zone-aware today from DashboardClient; null until resolved. */
  today: Date | null;
  /** False until the saved period has been restored, so the ring draws once. */
  ready: boolean;
  /** The dates behind the chart, e.g. "Oct 1 – Oct 31". */
  timeFrame: string;
}

// Legend rows per page. The ring always shows every category; only the list
// is paged, so a long category list cannot stretch the page (and the
// Income vs spending card beside it).
const PAGE_SIZE = 6;

/** Share of the total, display only. Tiny non-zero shares read "<0.1%". */
function formatShare(value: number, total: number): string {
  if (total <= 0) return '0.0%';
  const pct = (value / total) * 100;
  return pct > 0 && pct < 0.1 ? '<0.1%' : `${pct.toFixed(1)}%`;
}

/** Whole dollars, for the one-line description only. Display only. */
function formatWholeDollars(n: number): string {
  const sign = n < 0 ? '\u2212' : '';
  return `${sign}$${Math.round(Math.abs(n)).toLocaleString('en-US')}`;
}

/**
 * "Where it went": a thin ring with flat slices in each category's own colour
 * (user data, never altered), a one-line description, and a paged legend.
 * Follows the Dashboard's shared period (the This period card's selectors).
 *
 * MOTION. The whole ring glides into place (rotation, scale and fade on the
 * ring's group, in CSS - .pb-donut-ring). Recharts' own sweep is off: it grows
 * each slice from zero, which shows false proportions mid-animation. Starting
 * the animation on the ring itself, not a wrapper, means it begins when the
 * ring is actually drawn.
 */
export function CategoryDonutChart({ transactions, categoryMeta, mode, periodKey, today, ready, timeFrame }: CategoryDonutChartProps) {
  const { d, t } = useTranslation();
  const [page, setPage] = useState(0);
  // 'bar' only when exactly 'bar'; anything else is the donut.
  const breakdownChart = usePebbleStore((s) => s.breakdownChart) === 'bar' ? 'bar' : 'donut';
  // Recharts animates in JavaScript, so the global CSS reduced-motion block
  // cannot cover it. Read in an effect, never during render.
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    setReduceMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  // A new period starts the legend on its first page.
  useEffect(() => { setPage(0); }, [mode, periodKey]);

  const donutData = ready && today ? buildCategoryBreakdown(transactions, mode, categoryMeta, periodKey, today) : [];
  const donutTotal = donutData.reduce((s, entry) => s + entry.value, 0);

  const pages = Math.max(1, Math.ceil(donutData.length / PAGE_SIZE));
  // Clamped, so a shorter list after new data never points past its end.
  const current = Math.min(page, pages - 1);
  const pageRows = donutData.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);
  // A short page is topped up with invisible rows built like real ones, so
  // every page is the same height and the card never shrinks.
  const fillers = pages > 1 ? PAGE_SIZE - pageRows.length : 0;

  const summary = t(donutData.length === 1 ? d.donutChart.summaryOne : d.donutChart.summaryOther, {
    amount: formatWholeDollars(donutTotal),
    count: donutData.length,
  });

  return (
    <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: '1rem' }}>
        <h3 style={{ fontWeight: 600, fontSize: '0.95rem', margin: 0 }}>{d.donutChart.title}</h3>
        <p style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', margin: '0.2rem 0 0' }}>{timeFrame}</p>
      </div>

      {!ready || !today ? (
        // Waits for the shared period to be restored, so the ring draws once.
        <div style={{ flex: 1, minHeight: 240 }} />
      ) : donutData.length === 0 ? (
        <div style={{ flex: 1, minHeight: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-soft)', fontSize: '0.85rem' }}>
          {d.donutChart.noData}
        </div>
      ) : (
        <>
          {breakdownChart === 'bar' ? (
            <div style={{ margin: '0.75rem 0 0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.6rem' }}>
                <span style={{ fontSize: 'var(--pb-text-sm)', color: 'var(--ink-soft)' }}>{d.donutChart.total}</span>
                <span className="font-mono-tab" style={{ fontSize: '1.15rem', fontWeight: 600 }}>{formatCurrency(donutTotal)}</span>
              </div>
              {/* Segment widths are each category's share of the total - true
                  proportions at every moment; the reveal is a wipe, not growth. */}
              <div key={`${mode}-${periodKey ?? ''}`} className="pb-bar-track" role="img" aria-label={summary}>
                {donutData.map((entry) => (
                  <span
                    key={entry.name} className="pb-bar-seg"
                    style={{ flexGrow: entry.value, backgroundColor: entry.color }}
                    title={`${entry.name}: ${formatCurrency(entry.value)}`}
                  />
                ))}
              </div>
            </div>
          ) : (
          <div className="pb-donut-ring" style={{ position: 'relative' }}>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  key={`${mode}-${periodKey ?? ''}`}
                  data={donutData} dataKey="value" nameKey="name"
                  innerRadius={82} outerRadius={100} paddingAngle={2} cornerRadius={3}
                  strokeWidth={0} isAnimationActive={!reduceMotion} animationDuration={1600} animationEasing="cubic-bezier(0.65, 0, 0.35, 1)"
                >
                  {donutData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                {/* Colours, border and size come from the global
                    .recharts-default-tooltip rule in globals.css. */}
                <Tooltip formatter={(v) => formatCurrency(Number(v))} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pb-donut-center">
              <p style={{ fontSize: 'var(--pb-text-sm)', color: 'var(--ink-soft)', margin: 0 }}>{d.donutChart.total}</p>
              <p className="font-mono-tab" style={{ fontSize: '1.15rem', fontWeight: 600, margin: 0 }}>{formatCurrency(donutTotal)}</p>
            </div>
          </div>
          )}

          <p className="pb-donut-summary">{summary}</p>

          <ul className="pb-donut-legend">
            {pageRows.map((entry) => (
              <li key={entry.name} className="pb-donut-row">
                <span className="pb-donut-dot" style={{ backgroundColor: entry.color }} aria-hidden="true" />
                {/* Category names are user data, shown exactly as stored. */}
                <span className="pb-donut-name">{entry.name}</span>
                <span className="pb-donut-share font-mono-tab">{formatShare(entry.value, donutTotal)}</span>
                <span className="pb-donut-amount font-mono-tab">{formatCurrency(entry.value)}</span>
              </li>
            ))}
            {Array.from({ length: fillers }, (_, i) => (
              <li key={`filler-${i}`} className="pb-donut-row pb-donut-filler" aria-hidden="true">
                <span className="pb-donut-dot" />
                <span className="pb-donut-name">&nbsp;</span>
                <span />
                <span />
              </li>
            ))}
          </ul>

          {pages > 1 && (
            <div className="pb-donut-pager">
              <button
                type="button" className="icon-btn" onClick={() => setPage(current - 1)} disabled={current === 0}
                aria-label={d.donutChart.prevPage} style={{ width: 30, height: 30, borderRadius: '50%', opacity: current === 0 ? 0.4 : 1 }}
              >
                <ChevronLeft size={15} />
              </button>
              <span className="font-mono-tab" aria-live="polite">{current + 1} / {pages}</span>
              <button
                type="button" className="icon-btn" onClick={() => setPage(current + 1)} disabled={current === pages - 1}
                aria-label={d.donutChart.nextPage} style={{ width: 30, height: 30, borderRadius: '50%', opacity: current === pages - 1 ? 0.4 : 1 }}
              >
                <ChevronRight size={15} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
