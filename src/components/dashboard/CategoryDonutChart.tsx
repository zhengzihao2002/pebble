'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type TouchEvent } from 'react';
import { ChevronLeft, ChevronRight, PieChart as PieIcon } from 'lucide-react';
import { usePebbleStore } from '@/store/usePebbleStore';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import type { CategoryMeta, Transaction } from '@/types';
import { buildCategoryBreakdown, UNCATEGORISED_LABEL } from '@/lib/stats';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { renderTemplate } from '@/lib/i18n/RichText';
import { PeriodLink } from '@/components/shared/PeriodLink';
import { SectionHeader } from '@/components/kit/SectionHeader';
import { EmptyState } from '@/components/kit/EmptyState';
import { DeltaChip } from '@/components/kit/DeltaChip';
import { coversHistory, describeRange, earliestDate, shiftedWindow, spendingByCategoryInRange } from '@/lib/periodCompare';
import { RingSkeleton } from './DashSkeletons';

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
  const sign = n < 0 ? '−' : '';
  return `${sign}$${Math.round(Math.abs(n)).toLocaleString('en-US')}`;
}

/**
 * "Where it went": a thin ring with flat slices in each category's own colour
 * (user data, never altered), a one-line description, and a paged legend.
 * Follows the Dashboard's shared period (the This period card's selectors).
 *
 * MOTION. The ring sweeps round with Recharts' own animation (1600ms, the
 * same easing as the bar view's wipe), re-keyed per period so it runs once
 * per change, and switched off under reduced motion (read in an effect -
 * Recharts animates in JavaScript, out of reach of the global CSS rule). Only
 * the centre total fades in, in CSS (.pb-donut-center).
 *
 * LINKED FOCUS. Hovering a slice, a bar segment or a legend row (or tapping
 * one on a phone) singles that category out: the others dim, its row lights
 * and the centre shows its name, amount and share - which also replaces the
 * generic Recharts tooltip, so nothing covers the ring. A tap pins the focus;
 * tapping it again, tapping outside the card or Escape clears it. Rows are
 * buttons with aria-pressed, so the same works from the keyboard.
 *
 * Each row also draws its share as a soft bar in the category's colour and a
 * change chip against the previous comparable period (like-for-like - see
 * src/lib/periodCompare.ts). Spending going DOWN is the good direction.
 */
export function CategoryDonutChart({ transactions, categoryMeta, mode, periodKey, today, ready, timeFrame }: CategoryDonutChartProps) {
  const { d, t, locale } = useTranslation();
  const ux = d.ux.dashboard;
  const [page, setPage] = useState(0);
  // 'bar' only when exactly 'bar'; anything else is the donut.
  const breakdownChart = usePebbleStore((s) => s.breakdownChart) === 'bar' ? 'bar' : 'donut';
  // Recharts animates in JavaScript, so the global CSS reduced-motion block
  // cannot cover it. Read in an effect, never during render.
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    setReduceMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  // Hover follows the pointer; pinned is what a tap or Enter chose.
  const [hover, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const focus = hover ?? pinned;
  const cardRef = useRef<HTMLElement>(null);

  // A new period starts the legend on its first page, with nothing singled out.
  useEffect(() => { setPage(0); setPinned(null); setHover(null); }, [mode, periodKey]);

  // A tap anywhere else lets go of a pinned category.
  useEffect(() => {
    if (!pinned) return;
    const onDown = (e: PointerEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) setPinned(null);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [pinned]);

  const donutData = useMemo(
    () => (ready && today ? buildCategoryBreakdown(transactions, mode, categoryMeta, periodKey, today) : []),
    [ready, today, transactions, mode, categoryMeta, periodKey],
  );
  const donutTotal = donutData.reduce((s, entry) => s + entry.value, 0);

  // Per-category change against the previous comparable period. Both sides
  // are cut at the same point while the period is in progress.
  const change = useMemo(() => {
    if (!ready || !today) return null;
    const cur = shiftedWindow(mode, periodKey, today, 0, true);
    const prev = shiftedWindow(mode, periodKey, today, 1, true);
    // A previous window history only partly covers would show false rises.
    if (!coversHistory(prev, earliestDate(transactions))) return null;
    const curBy = spendingByCategoryInRange(transactions, cur);
    const prevBy = spendingByCategoryInRange(transactions, prev);
    // Names with no category row are pooled, as buildCategoryBreakdown pools them.
    const pool = (by: Record<string, number>) => {
      const out: Record<string, number> = {};
      for (const [name, v] of Object.entries(by)) {
        const key = categoryMeta[name] ? name : UNCATEGORISED_LABEL;
        out[key] = (out[key] || 0) + v;
      }
      return out;
    };
    return { cur: pool(curBy), prev: pool(prevBy), range: describeRange(prev, locale, today) };
  }, [ready, today, mode, periodKey, transactions, categoryMeta, locale]);

  const pages = Math.max(1, Math.ceil(donutData.length / PAGE_SIZE));
  // Clamped, so a shorter list after new data never points past its end.
  const current = Math.min(page, pages - 1);
  const pageRows = donutData.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);
  // A short page is topped up with invisible rows built like real ones, so
  // every page is the same height and the card never shrinks.
  const fillers = pages > 1 ? PAGE_SIZE - pageRows.length : 0;

  // The bucket's name is translated at render only, and only when no real
  // category happens to be called that. The stored value never changes.
  const displayName = (name: string) =>
    name === UNCATEGORISED_LABEL && !categoryMeta[UNCATEGORISED_LABEL] ? ux.uncategorised : name;

  const summaryTemplate = donutData.length === 1 ? d.donutChart.summaryOne : d.donutChart.summaryOther;
  // Plain text for the bar's accessible name; the visible line wraps the
  // amount in pb-money so privacy mode blurs it.
  const summary = t(summaryTemplate, { amount: formatWholeDollars(donutTotal), count: donutData.length });
  const summaryNode = renderTemplate(summaryTemplate, {
    amount: <span className="pb-money">{formatWholeDollars(donutTotal)}</span>,
    count: <span className="pb-tnum">{donutData.length}</span>,
  });

  const focused = focus ? donutData.find((e) => e.name === focus) ?? null : null;
  const toggle = (name: string) => setPinned((p) => (p === name ? null : name));
  // Hover only from a real mouse: a phone's simulated hover would fight the tap.
  const hoverProps = (name: string) => ({
    onPointerEnter: (e: { pointerType: string }) => { if (e.pointerType === 'mouse') setHover(name); },
    onPointerLeave: (e: { pointerType: string }) => { if (e.pointerType === 'mouse') setHover(null); },
  });

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && pinned) { e.stopPropagation(); setPinned(null); }
  };

  // Phones: a horizontal swipe on the legend turns the page.
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: TouchEvent) => { swipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
  const onTouchEnd = (e: TouchEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s || pages < 2) return;
    const dx = e.changedTouches[0].clientX - s.x;
    const dy = e.changedTouches[0].clientY - s.y;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    setPage(dx < 0 ? Math.min(pages - 1, current + 1) : Math.max(0, current - 1));
  };

  const chipFor = (name: string) => {
    if (!change) return null;
    const p = change.prev[name] || 0;
    const c = change.cur[name] || 0;
    if (p <= 0) return null;
    const pct = ((c - p) / p) * 100;
    const shown = Math.round(Math.abs(pct));
    const delta = shown === 0 ? 0 : pct;
    return (
      <DeltaChip
        delta={delta} good="down"
        text={`${delta > 0 ? '+' : delta < 0 ? '−' : ''}${shown}%`}
        label={delta === 0 ? t(ux.deltaSame, { range: change.range }) : t(delta > 0 ? ux.deltaMore : ux.deltaLess, { pct: `${shown}%`, range: change.range })}
      />
    );
  };

  const centre = focused ? (
    <>
      <p className="pb-dash-where-centre-name">{displayName(focused.name)}</p>
      <p className="font-mono-tab" style={{ fontSize: '1.05rem', fontWeight: 600, margin: 0 }}>{formatCurrency(focused.value)}</p>
      <p className="pb-tnum" style={{ fontSize: 'var(--pb-text-sm)', color: 'var(--ink-soft)', margin: 0 }}>{t(ux.shareOfSpending, { share: formatShare(focused.value, donutTotal) })}</p>
    </>
  ) : (
    <>
      <p style={{ fontSize: 'var(--pb-text-sm)', color: 'var(--ink-soft)', margin: 0 }}>{d.donutChart.total}</p>
      <p className="font-mono-tab" style={{ fontSize: '1.15rem', fontWeight: 600, margin: 0 }}>{formatCurrency(donutTotal)}</p>
    </>
  );

  return (
    <section ref={cardRef} className="card pb-dash-card pb-dash-where" onKeyDown={onKeyDown} aria-label={d.donutChart.title}>
      <SectionHeader title={d.donutChart.title} subtitle={<PeriodLink label={timeFrame} control="dashboard" />} />

      {!ready || !today ? (
        // Waits for the shared period to be restored, so the ring draws once.
        <RingSkeleton minHeight={240} />
      ) : donutData.length === 0 ? (
        <div className="pb-dash-fill-empty" style={{ minHeight: 240 }}>
          <EmptyState compact icon={PieIcon} title={d.donutChart.noData} />
        </div>
      ) : (
        <div className={`pb-dash-where-body${focus ? ' has-focus' : ''}`}>
          <div className="pb-dash-where-visual">
            {breakdownChart === 'bar' ? (
              <div style={{ margin: '0.25rem 0 0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.6rem' }}>
                  <span style={{ fontSize: 'var(--pb-text-sm)', color: 'var(--ink-soft)' }}>{focused ? displayName(focused.name) : d.donutChart.total}</span>
                  <span className="font-mono-tab" style={{ fontSize: '1.15rem', fontWeight: 600 }}>{formatCurrency(focused ? focused.value : donutTotal)}</span>
                </div>
                {/* Segment widths are each category's share of the total - true
                    proportions at every moment; the reveal is a wipe, not growth.
                    pb-chart-fill: the proportions blur in privacy mode. The
                    segments carry no native title (it showed amounts on hover in
                    privacy mode); the line above names the focused one instead. */}
                <div key={`${mode}-${periodKey ?? ''}`} className="pb-bar-track pb-chart-fill" role="img" aria-label={summary}>
                  {donutData.map((entry) => (
                    <span
                      key={entry.name}
                      className={`pb-bar-seg pb-dash-seg${focus && focus !== entry.name ? ' is-dim' : ''}`}
                      style={{ flexGrow: entry.value, backgroundColor: entry.color }}
                      onClick={() => toggle(entry.name)}
                      {...hoverProps(entry.name)}
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
                      onClick={(_: unknown, i: number) => { const e = donutData[i]; if (e) toggle(e.name); }}
                      onMouseEnter={(_: unknown, i: number) => { const e = donutData[i]; if (e) setHover(e.name); }}
                      onMouseLeave={() => setHover(null)}
                    >
                      {donutData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} fillOpacity={focus && focus !== entry.name ? 0.3 : 1} style={{ cursor: 'pointer', outline: 'none', transition: 'fill-opacity 160ms ease' }} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                {/* Not a live region: hovering slices would read out every
                    category. The legend rows (aria-pressed) carry the same. */}
                <div className="pb-donut-center">{centre}</div>
              </div>
            )}
            <p className="pb-donut-summary">{summaryNode}</p>
          </div>

          <div className="pb-dash-where-list">
            <ul className="pb-donut-legend" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
              {pageRows.map((entry) => {
                const share = donutTotal > 0 ? (entry.value / donutTotal) * 100 : 0;
                const on = focus === entry.name;
                return (
                  <li key={entry.name} className="pb-donut-row">
                    <button
                      type="button"
                      className={`pb-dash-where-row${on ? ' is-on' : ''}${focus && !on ? ' is-dim' : ''}`}
                      aria-pressed={pinned === entry.name}
                      onClick={() => toggle(entry.name)}
                      {...hoverProps(entry.name)}
                    >
                      {/* Share as length, in the category's own colour, softly. */}
                      <span className="pb-dash-where-bar" aria-hidden="true" style={{ width: `${share}%`, backgroundColor: `color-mix(in srgb, ${entry.color} 14%, transparent)` }} />
                      <span className="pb-donut-dot" style={{ backgroundColor: entry.color }} aria-hidden="true" />
                      {/* Category names are user data, shown exactly as stored. */}
                      <span className="pb-donut-name">{displayName(entry.name)}</span>
                      <span className="pb-dash-where-chip">{chipFor(entry.name)}</span>
                      <span className="pb-donut-share pb-tnum">{formatShare(entry.value, donutTotal)}</span>
                      <span className="pb-donut-amount font-mono-tab">{formatCurrency(entry.value)}</span>
                    </button>
                  </li>
                );
              })}
              {Array.from({ length: fillers }, (_, i) => (
                <li key={`filler-${i}`} className="pb-donut-row pb-donut-filler" aria-hidden="true">
                  <span className="pb-dash-where-row">
                    <span className="pb-donut-dot" />
                    <span className="pb-donut-name">&nbsp;</span>
                    <span />
                    <span />
                    <span />
                  </span>
                </li>
              ))}
            </ul>

            {pages > 1 && (
              <div className="pb-donut-pager">
                <button
                  type="button" className="icon-btn pb-dash-pager-btn" onClick={() => setPage(current - 1)} disabled={current === 0}
                  aria-label={d.donutChart.prevPage} style={{ opacity: current === 0 ? 0.4 : 1 }}
                >
                  <ChevronLeft size={15} />
                </button>
                {/* A page count, not money: tabular but never blurred. */}
                <span className="pb-tnum" aria-live="polite">{current + 1} / {pages}</span>
                <button
                  type="button" className="icon-btn pb-dash-pager-btn" onClick={() => setPage(current + 1)} disabled={current === pages - 1}
                  aria-label={d.donutChart.nextPage} style={{ opacity: current === pages - 1 ? 0.4 : 1 }}
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
