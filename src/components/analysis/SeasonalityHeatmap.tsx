'use client';

import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { CalendarRange } from 'lucide-react';
import { SegmentedControl } from '@/components/kit/SegmentedControl';
import { formatCurrency } from '@/lib/format';
import { INTL_LOCALE } from '@/lib/i18n/locale';
import { useTranslation } from '@/lib/i18n/useTranslation';
import type { MonthlyFlow } from '@/lib/analysis/cashflow';
import { CardHead, ScopeBadge } from './parts';

type Metric = 'net' | 'spending';

interface SeasonalityHeatmapProps {
  /** Every complete month on record (computeCashflow over the 'all' window). */
  months: MonthlyFlow[];
  /** 'YYYY-MM-DD', resolved in the browser's zone. */
  today: string;
  /** The month in progress, e.g. 'October 2026' - shown apart, never coloured. */
  currentLabel: string;
}

type CellState = 'data' | 'empty' | 'progress' | 'future' | 'before';
interface Cell { key: string; label: string; state: CellState; flow?: MonthlyFlow }

/**
 * Every month on record as one square, a row per year: the pattern the
 * seasonally adjusted projection relies on, seen whole. Net (default) is a
 * diverging pine / wine scale; Spending is one hue. Intensity is relative to
 * the largest value in the grid. Colour never stands alone: every square is a
 * button named with its month and figure, and the detail line under the grid
 * spells out the hovered, focused or tapped month.
 *
 * Same complete-months rule as the rest of the page: the month in progress
 * is an outlined square, never coloured. All history - not the period.
 * The grid sits inside pb-chart-fade, so privacy mode blurs it (the first
 * tap reveals it) and the detail amounts are font-mono-tab.
 */
export function SeasonalityHeatmap({ months, today, currentLabel }: SeasonalityHeatmapProps) {
  const { d, t, locale } = useTranslation();
  const x = d.ux.analysis;
  const [metric, setMetric] = useState<Metric>('net');
  const gridRef = useRef<HTMLDivElement>(null);

  const ty = Number(today.slice(0, 4));
  const tm = Number(today.slice(5, 7)) - 1;

  const { years, maxAbs, maxSpend } = useMemo(() => {
    const byKey = new Map(months.map((m) => [m.key, m]));
    const first = months[0] ? Number(months[0].key.slice(0, 4)) : ty;
    const firstKey = months[0]?.key ?? `${ty}-${String(tm + 1).padStart(2, '0')}`;
    const ys: { year: number; cells: Cell[] }[] = [];
    for (let y = first; y <= ty; y++) {
      const cells: Cell[] = [];
      for (let m = 0; m < 12; m++) {
        const key = `${y}-${String(m + 1).padStart(2, '0')}`;
        const label = new Date(y, m, 1).toLocaleDateString(INTL_LOCALE[locale], { month: 'short', year: 'numeric' });
        const flow = byKey.get(key);
        let state: CellState;
        if (y === ty && m === tm) state = 'progress';
        else if (y > ty || (y === ty && m > tm)) state = 'future';
        else if (key < firstKey) state = 'before';
        else if (!flow || (flow.income === 0 && flow.spending === 0)) state = 'empty';
        else state = 'data';
        cells.push({ key, label: state === 'progress' ? currentLabel : label, state, flow });
      }
      ys.push({ year: y, cells });
    }
    let mx = 0;
    let ms = 0;
    for (const m of months) { mx = Math.max(mx, Math.abs(m.net)); ms = Math.max(ms, m.spending); }
    return { years: ys, maxAbs: mx || 1, maxSpend: ms || 1 };
  }, [months, ty, tm, locale, currentLabel]);

  const flat = years.flatMap((y) => y.cells);
  const lastData = [...flat].reverse().find((c) => c.state === 'data');
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const shown = flat.find((c) => c.key === focusKey) ?? lastData ?? null;
  // Roving tabindex: one square in the tab order, arrows move within the grid.
  const tabKey = shown?.key ?? flat.find((c) => c.state !== 'before')?.key;

  const colorOf = (c: Cell): string | undefined => {
    if (c.state !== 'data' || !c.flow) return undefined;
    if (metric === 'spending') {
      const k = 12 + Math.round((c.flow.spending / maxSpend) * 76);
      return `color-mix(in srgb, var(--wine) ${k}%, var(--mist))`;
    }
    const k = 14 + Math.round((Math.abs(c.flow.net) / maxAbs) * 74);
    return `color-mix(in srgb, ${c.flow.net >= 0 ? 'var(--pine)' : 'var(--wine)'} ${k}%, var(--mist))`;
  };

  const nameOf = (c: Cell) => {
    if (c.state === 'progress') return t(x.cellProgress, { month: c.label });
    if (c.state === 'future') return t(x.cellFuture, { month: c.label });
    if (c.state !== 'data' || !c.flow) return t(x.cellEmpty, { month: c.label });
    return metric === 'net'
      ? t(x.cellNet, { month: c.label, amount: formatCurrency(c.flow.net) })
      : t(x.cellSpend, { month: c.label, amount: formatCurrency(c.flow.spending) });
  };

  const monthHead = Array.from({ length: 12 }, (_, m) => (
    locale === 'zh' ? String(m + 1) : new Date(2000, m, 1).toLocaleDateString(INTL_LOCALE[locale], { month: 'narrow' })
  ));

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -12, ArrowDown: 12 };
    if (!(e.key in moves) || !tabKey) return;
    e.preventDefault();
    const usable = flat.filter((c) => c.state !== 'before');
    const i = flat.findIndex((c) => c.key === tabKey);
    let j = i + moves[e.key];
    while (j >= 0 && j < flat.length && flat[j].state === 'before') j += moves[e.key] > 0 ? 1 : -1;
    const next = flat[j] && usable.includes(flat[j]) ? flat[j] : null;
    if (!next) return;
    setFocusKey(next.key);
    gridRef.current?.querySelector<HTMLElement>(`[data-key="${next.key}"]`)?.focus();
  };

  return (
    <section className="card pb-ana-card pb-ana-heat" aria-labelledby="pb-ana-heat-title">
      <CardHead
        id="pb-ana-heat-title"
        icon={<CalendarRange size={15} />}
        title={x.heatTitle}
        tooltipLabel={x.heatTooltipLabel}
        tooltip={x.heatTooltip}
        badge={<ScopeBadge>{x.allHistory}</ScopeBadge>}
        actions={(
          <SegmentedControl<Metric>
            size="sm" ariaLabel={x.chartView} value={metric} onChange={setMetric}
            options={[{ value: 'net', label: x.heatNet }, { value: 'spending', label: x.heatSpending }]}
          />
        )}
      />

      <div className="pb-chart-fade pb-ana-heat-wrap">
        <div
          ref={gridRef} className="pb-ana-heat-grid" role="group"
          aria-label={metric === 'net' ? x.heatGrid : x.heatGridSpend} onKeyDown={onKey}
        >
          <span aria-hidden="true" />
          {monthHead.map((m, i) => <span key={i} className="pb-ana-heat-mh" aria-hidden="true">{m}</span>)}
          {years.map((y) => (
            <div key={y.year} className="pb-ana-heat-row" role="presentation">
              <span className="pb-ana-heat-year pb-tnum" aria-hidden="true">{y.year}</span>
              {y.cells.map((c) => (
                c.state === 'before'
                  ? <span key={c.key} className="pb-ana-heat-cell is-before" aria-hidden="true" />
                  : (
                    <button
                      key={c.key} type="button" data-key={c.key}
                      className={`pb-ana-heat-cell is-${c.state}${shown?.key === c.key ? ' is-on' : ''}`}
                      style={{ backgroundColor: colorOf(c) }}
                      aria-label={nameOf(c)}
                      tabIndex={c.key === tabKey ? 0 : -1}
                      onMouseEnter={() => setFocusKey(c.key)}
                      onFocus={() => setFocusKey(c.key)}
                      onClick={() => setFocusKey(c.key)}
                    />
                  )
              ))}
            </div>
          ))}
        </div>

        <div className="pb-ana-heat-detail" aria-hidden="true">
          {shown ? (
            <>
              <span className="pb-ana-heat-detail-month">{shown.label}</span>
              {shown.state === 'data' && shown.flow ? (
                <>
                  <span>{x.income} <b className="font-mono-tab">{formatCurrency(shown.flow.income)}</b></span>
                  <span>{x.spending} <b className="font-mono-tab">{formatCurrency(shown.flow.spending)}</b></span>
                  <span>{x.net} <b className="font-mono-tab" style={{ color: shown.flow.net >= 0 ? 'var(--pine)' : 'var(--wine)' }}>{formatCurrency(shown.flow.net)}</b></span>
                </>
              ) : (
                <span>{shown.state === 'progress' ? x.inProgress : shown.state === 'future' ? x.notYet : x.noActivity}</span>
              )}
            </>
          ) : <span>{x.heatHint}</span>}
        </div>

        <div className="pb-ana-heat-legend" aria-hidden="true">
          {metric === 'net' ? (
            <>
              <span>{x.keptMore}</span>
              <span className="pb-ana-heat-ramp is-net" />
              <span>{x.spentMore}</span>
            </>
          ) : (
            <>
              <span>{x.lessSpent}</span>
              <span className="pb-ana-heat-ramp is-spend" />
              <span>{x.moreSpent}</span>
            </>
          )}
          <span className="pb-ana-heat-key"><i className="pb-ana-heat-cell is-progress" />{x.inProgress}</span>
          <span className="pb-ana-heat-key"><i className="pb-ana-heat-cell is-empty" />{x.noActivity}</span>
        </div>
      </div>
    </section>
  );
}
