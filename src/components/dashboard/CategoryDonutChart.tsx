'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { usePebbleStore } from '@/store/usePebbleStore';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import type { CategoryMeta, Transaction } from '@/types';
import { buildCategoryBreakdown, getAvailablePeriods } from '@/lib/stats';
import { formatCurrency, parseLocalDate } from '@/lib/format';
import { TREND_MODES } from '@/data/seed';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { useTimeZoneOverride } from '@/lib/time/TimeZoneOverrideContext';
import { resolveBrowserTimeZone } from '@/lib/time/timeZone';
import { todayInZone } from '@/lib/recurring/occurrences';

interface CategoryDonutChartProps {
  transactions: Transaction[];
  categoryMeta: CategoryMeta;
}

// Legend rows per page. The ring always shows every category; only the list
// is paged, so a long category list cannot stretch the page (and the
// Income vs spending card beside it).
const PAGE_SIZE = 6;

const selectStyle: React.CSSProperties = {
  fontSize: '0.72rem', padding: '0.28rem 0.5rem', borderRadius: '0.5rem',
  border: '1px solid var(--line)', color: 'var(--ink-soft)', backgroundColor: 'var(--mist)',
};

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
 *
 * MOTION. The whole ring glides into place (rotation, scale and fade on the
 * ring's group, in CSS - .pb-donut-ring). Recharts' own sweep is off: it grows
 * each slice from zero, which shows false proportions mid-animation. Starting
 * the animation on the ring itself, not a wrapper, means it begins when the
 * ring is actually drawn.
 */
export function CategoryDonutChart({ transactions, categoryMeta }: CategoryDonutChartProps) {
  const { d, t, locale } = useTranslation();

  // See DashboardClient.tsx for the full rationale behind this pattern -
  // resolved independently here since this component owns its own
  // breakdownMode/breakdownPeriod state already, same as every other
  // dashboardPrefs slice on this page.
  const timeZoneOverride = useTimeZoneOverride();
  const [today, setToday] = useState<Date | null>(null);
  useEffect(() => {
    const zone = timeZoneOverride ?? resolveBrowserTimeZone();
    setToday(parseLocalDate(todayInZone(zone)));
  }, [timeZoneOverride]);
  const modeLabel = (value: string, fallback: string) =>
    (d.statsModes as Record<string, string>)[value] ?? fallback;
  const [breakdownMode, setBreakdownMode] = useState('last6');
  const [breakdownPeriod, setBreakdownPeriod] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [page, setPage] = useState(0);
  // 'bar' only when exactly 'bar'; anything else is the donut.
  const breakdownChart = usePebbleStore((s) => s.breakdownChart) === 'bar' ? 'bar' : 'donut';
  // Recharts animates in JavaScript, so the global CSS reduced-motion block
  // cannot cover it. Read in the restore effect, never during render.
  const [reduceMotion, setReduceMotion] = useState(false);

  // latestYearOnly, matching the stats card above: this year's months, not
  // every month on record.
  const periodsForMode = (mode: string) =>
    (mode === 'month' || mode === 'quarter' || mode === 'year')
      ? getAvailablePeriods(transactions, mode as 'month' | 'quarter' | 'year', true, locale)
      : [];

  const needsSubPeriod = breakdownMode === 'month' || breakdownMode === 'quarter' || breakdownMode === 'year';
  const availablePeriods = needsSubPeriod ? periodsForMode(breakdownMode) : [];

  const handleBreakdownModeChange = (mode: string) => {
    setBreakdownMode(mode);
    setBreakdownPeriod(periodsForMode(mode)[0]?.key ?? null);
    setPage(0);
  };

  const restoreRef = useRef(false);
  useEffect(() => {
    if (restoreRef.current) return;
    restoreRef.current = true;
    const saved = usePebbleStore.getState().dashboardPrefs;
    const mode = saved?.breakdownMode ?? 'last6';
    const avail = periodsForMode(mode);
    const savedPeriod = saved?.breakdownPeriod ?? null;
    setBreakdownMode(mode);
    setBreakdownPeriod(avail.some((p) => p.key === savedPeriod) ? savedPeriod : (avail[0]?.key ?? null));
    setReduceMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    setRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!restored) return;
    usePebbleStore.getState().setDashboardPrefs({ breakdownMode, breakdownPeriod });
  }, [restored, breakdownMode, breakdownPeriod]);

  const donutData = buildCategoryBreakdown(transactions, breakdownMode, categoryMeta, breakdownPeriod, today ?? undefined);
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h3 style={{ fontWeight: 600, fontSize: '0.95rem', margin: 0 }}>{d.donutChart.title}</h3>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          <select value={breakdownMode} onChange={(e) => handleBreakdownModeChange(e.target.value)} style={selectStyle} aria-label={d.donutChart.title}>
            {TREND_MODES.map((m) => <option key={m.value} value={m.value}>{modeLabel(m.value, m.label)}</option>)}
          </select>
          {needsSubPeriod && availablePeriods.length > 0 && (
            <select value={breakdownPeriod || ''} onChange={(e) => { setBreakdownPeriod(e.target.value); setPage(0); }} style={selectStyle} aria-label={d.donutChart.title}>
              {availablePeriods.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          )}
        </div>
      </div>

      {!restored ? (
        // Waits for the saved mode to be restored, so the ring draws once.
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
              <div key={`${breakdownMode}-${breakdownPeriod ?? ''}`} className="pb-bar-track" role="img" aria-label={summary}>
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
                  key={`${breakdownMode}-${breakdownPeriod ?? ''}`}
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
