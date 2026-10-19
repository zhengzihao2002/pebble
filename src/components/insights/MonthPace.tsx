'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Gauge } from 'lucide-react';
import type { CategoryMeta, RecurringRule, Transaction } from '@/types';
import { formatCurrency, formatDate } from '@/lib/format';
import { formatCompactCurrency } from '@/lib/chartFormat';
import { descriptionTitle } from '@/lib/transactionDescription';
import { categoryLabel } from '@/lib/i18n/enumLabels';
import { renderTemplate } from '@/lib/i18n/RichText';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { computeUpcoming } from '@/lib/analysis/upcoming';
import { SectionHeader } from '@/components/kit/SectionHeader';
import { EmptyState } from '@/components/kit/EmptyState';
import { DeltaChip } from '@/components/kit/DeltaChip';
import { Skeleton } from '@/components/kit/Skeleton';
import { pad } from './shared';
import { useElementSize } from './hooks';

/** Months before this one that make up "usual". */
const USUAL_MONTHS = 3;
/** Within this many percent of usual reads as "about usual". */
const SAME_BAND = 5;
/** Upcoming payments listed under the chart. */
const DUE_SHOWN = 3;

interface MonthPaceProps {
  transactions: Transaction[];
  rules: RecurringRule[];
  categoryMeta: CategoryMeta;
  today: string | null;
}

/**
 * NEW: "how is this month going?" Cumulative spending this month (solid,
 * to today) over the usual month's curve - the average of up to the last
 * three complete months, each taken day by day (day 16 over day 16, a
 * shorter month holding its total to the end) - with a dotted projection
 * to the month's end: spent so far + scheduled payments still due this
 * month (computeUpcoming, which never re-counts what is already in the
 * ledger) + the usual day-to-day pace for the days left.
 *
 * Spending is every expense, scheduled ones included, so the projection's
 * scheduled part lands on the same footing; the day-to-day pace leaves
 * scheduled payments out so they are not counted twice. Needs one complete
 * month of history. The chart wears pb-chart-fade and every figure is
 * font-mono-tab, so privacy mode blurs them.
 */
export function MonthPace({ transactions, rules, categoryMeta, today }: MonthPaceProps) {
  const { d, t, locale } = useTranslation();
  const ux = d.ux.insights;
  const [hover, setHover] = useState<number | null>(null);
  const [boxRef, box] = useElementSize<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement | null>(null);

  // A touch tap fires pointerleave right after pointerup, so leaving only
  // clears the scrub for a mouse; on touch the tip stays until a tap
  // anywhere outside the chart.
  useEffect(() => {
    if (hover === null) return;
    const onDown = (e: PointerEvent) => {
      const svg = svgRef.current;
      if (svg && e.target instanceof Node && svg.contains(e.target)) return;
      setHover(null);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [hover]);

  const model = useMemo(() => {
    if (!today) return null;
    const ty = Number(today.slice(0, 4));
    const tm = Number(today.slice(5, 7)) - 1;
    const td = Number(today.slice(8, 10));
    const len = new Date(ty, tm + 1, 0).getDate();
    const prefix = today.slice(0, 8);
    const earliest = transactions.reduce<string | null>((m, x) => (m === null || x.date < m ? x.date : m), null);

    // Complete months before this one that the history fully covers.
    const prior: { key: string; len: number }[] = [];
    for (let k = 1; k <= USUAL_MONTHS; k += 1) {
      const dt = new Date(ty, tm - k, 1);
      const key = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}`;
      if (earliest === null || earliest > `${key}-01`) break;
      prior.push({ key, len: new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate() });
    }
    if (prior.length === 0) return { empty: true as const };

    const cur = Array<number>(len).fill(0);
    const past = prior.map((p) => Array<number>(p.len).fill(0));
    let pastDayToDay = 0;
    for (const x of transactions) {
      if (x.type !== 'expense' || x.amount >= 0) continue;
      const v = -x.amount;
      if (x.date.startsWith(prefix)) {
        if (x.date <= today) cur[Number(x.date.slice(8, 10)) - 1] += v;
        continue;
      }
      const i = prior.findIndex((p) => x.date.startsWith(`${p.key}-`));
      if (i < 0) continue;
      past[i][Number(x.date.slice(8, 10)) - 1] += v;
      if (!x.recurringRuleId) pastDayToDay += v;
    }
    const cum = (a: number[]) => { let s = 0; return a.map((v) => (s += v)); };
    const curCum = cum(cur).slice(0, td);
    const pastCum = past.map(cum);
    // Day d of the usual month: each month's running total on day d (its
    // final total once it has ended), averaged.
    const usual = Array.from({ length: len }, (_, i) => pastCum.reduce((s, c) => s + c[Math.min(i, c.length - 1)], 0) / pastCum.length);

    const spent = curCum[td - 1] ?? 0;
    const usualNow = usual[td - 1];
    const pct = usualNow > 0 ? Math.round(((spent - usualNow) / usualNow) * 100) : null;

    const thisKey = today.slice(0, 7);
    const upcoming = computeUpcoming(rules, today, 0, locale).months.find((m) => m.key === thisKey);
    const due = (upcoming?.items ?? []).filter((it) => it.kind === 'expense');
    const dueTotal = due.reduce((s, it) => s + Math.abs(it.amount), 0);
    const pastDays = prior.reduce((s, p) => s + p.len, 0);
    const dailyPace = pastDays > 0 ? pastDayToDay / pastDays : 0;
    const forecast = spent + dueTotal + dailyPace * (len - td);

    return { empty: false as const, len, td, curCum, usual, spent, usualNow, pct, due, forecast, basis: prior.length, ty, tm };
  }, [today, transactions, rules, locale]);

  const header = (
    <SectionHeader
      id="pb-pace-title" icon={Gauge} title={ux.paceTitle}
      subtitle={model && !model.empty ? (model.basis === 1 ? ux.paceUsualBasisOne : t(ux.paceUsualBasis, { count: model.basis })) : ux.paceHint}
    />
  );

  if (!model) {
    return (
      <section className="card pb-ins-card pb-ins-pace" aria-labelledby="pb-pace-title" aria-busy="true">
        {header}
        <div aria-hidden="true" style={{ display: 'grid', gap: 10 }}>
          <Skeleton width="55%" height="1rem" />
          <Skeleton width="100%" height={170} radius="0.75rem" />
          <Skeleton width="40%" height="0.8rem" />
        </div>
      </section>
    );
  }
  if (model.empty) {
    return (
      <section className="card pb-ins-card pb-ins-pace" aria-labelledby="pb-pace-title">
        {header}
        <div className="pb-ins-fill-empty"><EmptyState compact icon={Gauge} title={ux.paceEmpty} body={ux.paceEmptyBody} /></div>
      </section>
    );
  }

  const { len, td, curCum, usual, spent, pct, due, forecast } = model;
  const dateOf = (day: number) => `${model.ty}-${pad(model.tm + 1)}-${pad(day)}`;

  // ---- chart geometry (inline SVG; the box's size comes from CSS) ----
  const W = box.width;
  const H = box.height;
  const L = 44; // room for the axis labels
  const R = 10;
  const T = 10;
  const B = 22;
  const top = Math.max(usual[len - 1], forecast, spent, 1);
  const step = niceStep(top / 3);
  const yMax = Math.ceil(top / step) * step;
  const ticks = Array.from({ length: Math.round(yMax / step) + 1 }, (_, i) => i * step);
  const x = (day: number) => L + ((day - 1) / Math.max(1, len - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - v / yMax) * (H - T - B);
  const line = (vals: number[], startDay = 1) => vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(startDay + i).toFixed(1)} ${y(v).toFixed(1)}`).join('');
  const curPath = line(curCum);
  const areaPath = curCum.length > 0 ? `${curPath}L${x(td).toFixed(1)} ${y(0).toFixed(1)}L${x(1).toFixed(1)} ${y(0).toFixed(1)}Z` : '';
  const usualPath = line(usual);
  const projPath = td < len ? `M${x(td).toFixed(1)} ${y(spent).toFixed(1)}L${x(len).toFixed(1)} ${y(forecast).toFixed(1)}` : '';
  const xTicks = [1, Math.round(len / 2), len];

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const day = Math.round(((px - L) / Math.max(1, W - L - R)) * (len - 1)) + 1;
    setHover(Math.min(len, Math.max(1, day)));
  };
  const hv = hover;
  const tipLeft = hv !== null ? Math.min(Math.max(x(hv), 90), W - 90) : 0;

  const same = pct !== null && Math.abs(pct) < SAME_BAND;
  const pctText = pct === null ? '' : same ? ux.paceUsualSame : `${pct > 0 ? '+' : '−'}${Math.abs(pct)}%`;
  const dueShown = due.slice(0, DUE_SHOWN);

  return (
    <section className="card pb-ins-card pb-ins-pace" aria-labelledby="pb-pace-title">
      {header}
      <div className="pb-ins-pace-head">
        <p className="pb-ins-pace-spent">
          {renderTemplate(ux.paceSoFar, { amount: <strong className="font-mono-tab">{formatCurrency(spent)}</strong> })}
        </p>
        {pct !== null && (
          <DeltaChip
            delta={same ? 0 : pct} good="down"
            text={same ? pctText : t(ux.paceVsUsual, { pct: pctText })}
            label={t(ux.paceVsUsualLabel, { pct: pctText })}
          />
        )}
      </div>

      <div ref={boxRef} className="pb-ins-pace-chart pb-chart-fade" role="img" aria-label={ux.paceChartLabel}>
        {W > 0 && H > 0 && (
          <svg
            ref={svgRef} width={W} height={H} aria-hidden="true" focusable="false"
            onPointerMove={onMove} onPointerDown={onMove}
            onPointerLeave={(e) => { if (e.pointerType === 'mouse') setHover(null); }}
          >
            {ticks.map((v) => (
              <g key={v}>
                <line className="pb-ins-gridline" x1={L} x2={W - R} y1={y(v)} y2={y(v)} />
                <text className="pb-ins-axis" x={L - 8} y={y(v)} dy="0.32em" textAnchor="end">{formatCompactCurrency(v)}</text>
              </g>
            ))}
            {xTicks.map((day, i) => (
              <text key={`${day}-${i}`} className="pb-ins-axis" x={x(day)} y={H - 4} textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}>{day}</text>
            ))}
            <path className="pb-ins-pace-usual" d={usualPath} />
            {areaPath && <path className="pb-ins-pace-area" d={areaPath} />}
            {curPath && <path className="pb-ins-pace-cur" d={curPath} />}
            {projPath && <path className="pb-ins-pace-proj" d={projPath} />}
            {td < len && (
              <>
                <line className="pb-ins-pace-today" x1={x(td)} x2={x(td)} y1={T} y2={H - B} />
                <text className="pb-ins-axis is-strong" x={x(td) + 4} y={T + 8}>{ux.today}</text>
              </>
            )}
            {curCum.length > 0 && <circle className="pb-ins-pace-dot" cx={x(td)} cy={y(spent)} r={3.5} />}
            {td < len && <circle className="pb-ins-pace-end" cx={x(len)} cy={y(forecast)} r={3} />}
            {hv !== null && (
              <g className="pb-ins-pace-hover">
                <line x1={x(hv)} x2={x(hv)} y1={T} y2={H - B} />
                <circle className="is-usual" cx={x(hv)} cy={y(usual[hv - 1])} r={3} />
                {hv <= td && <circle className="is-cur" cx={x(hv)} cy={y(curCum[hv - 1])} r={3.5} />}
              </g>
            )}
          </svg>
        )}
        {hv !== null && W > 0 && (
          <div className="pb-ins-tip pb-ins-pace-tip" style={{ left: tipLeft }}>
            <div className="pb-ins-tip-head">{t(ux.paceDay, { n: hv })} · {formatDate(dateOf(hv), locale)}</div>
            {hv <= td && (
              <div className="pb-ins-tip-row"><span><i className="pb-ins-key is-out" />{ux.paceThisMonth}</span><span className="font-mono-tab">{formatCurrency(curCum[hv - 1])}</span></div>
            )}
            <div className="pb-ins-tip-row"><span><i className="pb-ins-key is-usual" />{ux.paceUsualLine}</span><span className="font-mono-tab">{formatCurrency(usual[hv - 1])}</span></div>
          </div>
        )}
      </div>

      <div className="pb-ins-legend" aria-hidden="true">
        <span><i className="pb-ins-key-line is-cur" />{ux.paceThisMonth}</span>
        <span><i className="pb-ins-key-line is-dashed" />{ux.paceUsualLine}</span>
        {td < len && <span><i className="pb-ins-key-line is-dotted" />{ux.paceProjected}</span>}
      </div>

      {td < len && (
        <p className="pb-ins-pace-forecast">
          <span>{renderTemplate(ux.paceForecast, { amount: <strong className="font-mono-tab">{formatCurrency(forecast)}</strong> })}</span>
          <span className="pb-ins-pace-note">{ux.paceForecastNote}</span>
        </p>
      )}

      {td < len && (
        <div className="pb-ins-pace-due">
          <p className="pb-ins-mini-head">{ux.paceStillDue}</p>
          {dueShown.length === 0 ? (
            <p className="pb-ins-quiet">{ux.paceNothingDue}</p>
          ) : (
            <ul className="pb-ins-due-list">
              {dueShown.map((it) => {
                const meta = categoryMeta[it.category];
                const Icon = meta?.icon;
                const day = Number(it.date.slice(8, 10));
                return (
                  <li key={`${it.ruleId}-${it.date}`} className="pb-ins-due">
                    <span className="pb-ins-due-date pb-tnum" aria-hidden="true">
                      <span>{new Date(Number(it.date.slice(0, 4)), Number(it.date.slice(5, 7)) - 1, 1).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', { month: 'short' })}</span>
                      <strong>{day}</strong>
                    </span>
                    <span className="pb-ins-tile is-sm" aria-hidden="true" style={{ ['--pb-ins-cat' as string]: meta ? meta.color : 'var(--ink-soft)' }}>{Icon && <Icon size={14} />}</span>
                    <span className="pb-ins-due-text">
                      {/* Schedule descriptions are USER DATA. */}
                      <span className="pb-ins-due-name">{descriptionTitle(it.description) || categoryLabel(d, it.category)}</span>
                      <span className="pb-ins-due-sub">{formatDate(it.date, locale)}</span>
                    </span>
                    <span className="font-mono-tab pb-ins-due-amt">{formatCurrency(-Math.abs(it.amount))}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

/** A round step (1, 2 or 5 times a power of ten) near `raw`, for gridlines. */
function niceStep(raw: number): number {
  if (raw <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}
