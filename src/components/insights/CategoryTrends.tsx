'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, TrendingUp } from 'lucide-react';
import type { CategoryMeta, Transaction } from '@/types';
import { formatCurrency } from '@/lib/format';
import { renderTemplate } from '@/lib/i18n/RichText';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { SectionHeader } from '@/components/kit/SectionHeader';
import { EmptyState } from '@/components/kit/EmptyState';
import { DeltaChip } from '@/components/kit/DeltaChip';
import { Skeleton } from '@/components/kit/Skeleton';
import { SparkBars } from './SparkBars';
import { pad } from './shared';

const SHOWN = 6;
/** Within this many percent either way reads as "about the same". */
const SAME_BAND = 5;

/**
 * Each category's spending over the last 6 COMPLETE months, and how the last
 * of them compares with the average of the 3 before it. The comparison is
 * spelled out on the card so the percentage is never ambiguous.
 *
 * Category movers: the same rows, grouped Rising / Easing / Steady (each
 * group keeps the original order: new first, then the biggest change), with
 * the two amounts behind the percentage ("$412 vs $306 avg"), lightweight
 * bars with the average marked, and the change as a chip with an arrow so
 * it never relies on colour alone. "Show all" still shows every row; the
 * rows it adds rise in and focus moves to the first of them.
 */
export function CategoryTrends({ transactions, categoryMeta, today }: {
  transactions: Transaction[];
  categoryMeta: CategoryMeta;
  today: string | null;
}) {
  const { d, t, locale } = useTranslation();
  const ux = d.ux.insights;
  const [showAll, setShowAll] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const focusNew = useRef(false);
  useEffect(() => {
    if (!showAll || !focusNew.current) return;
    focusNew.current = false;
    listRef.current?.querySelector<HTMLElement>('.is-new-row .pb-ins-spark')?.focus();
  }, [showAll]);

  if (!today) {
    return (
      <section className="card pb-ins-card pb-trends" aria-labelledby="pb-trends-title" aria-busy="true" style={{ minHeight: 260 }}>
        <SectionHeader id="pb-trends-title" icon={TrendingUp} title={d.insights.trendsTitle} />
        <div className="pb-ins-skel-rows" aria-hidden="true">
          {[0, 1, 2, 3].map((n) => (
            <div key={n} className="pb-ins-skel-row">
              <Skeleton width={28} height={28} radius="50%" />
              <Skeleton width="28%" height="0.85rem" />
              <Skeleton width="34%" height="1.6rem" radius="4px" style={{ marginLeft: 'auto' }} />
              <Skeleton width="3.2rem" height="1.1rem" radius="99px" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  const tag = locale === 'zh' ? 'zh-CN' : 'en-US';
  const ty = Number(today.slice(0, 4));
  const tm = Number(today.slice(5, 7)) - 1;
  const months: string[] = [];
  for (let i = 6; i >= 1; i--) {
    const dt = new Date(ty, tm - i, 1);
    months.push(`${dt.getFullYear()}-${pad(dt.getMonth() + 1)}`);
  }
  const index = new Map(months.map((k, i) => [k, i]));
  const monthDate = (k: string) => new Date(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, 1);

  const sums: Record<string, number[]> = {};
  for (const x of transactions) {
    if (x.type !== 'expense' || x.amount >= 0) continue;
    const i = index.get(x.date.slice(0, 7));
    if (i === undefined) continue;
    (sums[x.category] ??= Array(6).fill(0))[i] += Math.abs(x.amount);
  }

  const rows = Object.entries(sums)
    .filter(([, s]) => s.slice(2).some((v) => v > 0))
    .map(([name, s]) => {
      const last = s[5];
      const prevAvg = (s[2] + s[3] + s[4]) / 3;
      const change = prevAvg > 0 ? Math.round(((last - prevAvg) / prevAvg) * 100) : null;
      return { name, series: s, change, isNew: prevAvg === 0 && last > 0 };
    })
    .sort((a, b) => (b.isNew ? Infinity : Math.abs(b.change ?? 0)) - (a.isNew ? Infinity : Math.abs(a.change ?? 0)));

  const shown = showAll ? rows : rows.slice(0, SHOWN);
  const lastName = monthDate(months[5]).toLocaleDateString(tag, { month: 'long' });
  const range = `${monthDate(months[2]).toLocaleDateString(tag, { month: 'short' })}–${monthDate(months[4]).toLocaleDateString(tag, { month: 'short' })}`;
  const monthLabels = months.map((k) => monthDate(k).toLocaleDateString(tag, { month: 'long', year: 'numeric' }));
  const whole = (v: number) => formatCurrency(Math.round(v)).replace(/\.00$/, '');

  type Row = (typeof rows)[number];
  const kind = (r: Row) => {
    if (r.isNew) return 'rising';
    if (r.change === null || Math.abs(r.change) < SAME_BAND) return 'steady';
    return r.change > 0 ? 'rising' : 'easing';
  };
  const groups = (['rising', 'easing', 'steady'] as const)
    .map((g) => ({ g, rows: shown.filter((r) => kind(r) === g) }))
    .filter((x) => x.rows.length > 0);
  const label = { rising: ux.rising, easing: ux.easing, steady: ux.steady };
  const firstNew = rows[SHOWN]?.name;

  return (
    <section className="card pb-ins-card pb-trends" aria-labelledby="pb-trends-title">
      <SectionHeader id="pb-trends-title" icon={TrendingUp} title={d.insights.trendsTitle} subtitle={t(d.insights.trendsHint, { last: lastName, range })} />

      {rows.length === 0 ? (
        <div className="pb-ins-fill-empty"><EmptyState compact icon={TrendingUp} title={d.insights.noTrends} /></div>
      ) : (
        <>
          <ul ref={listRef} className="pb-trend-list pb-ins-trend-list">
            {groups.map(({ g, rows: list }) => (
              <li key={g} className="pb-ins-trend-group" data-kind={g}>
                <span>{label[g]}</span>
                <span className="pb-tnum">{list.length}</span>
                {/* The group's rows follow as siblings, so the list stays one aligned grid. */}
              </li>
            )).flatMap((head, gi) => [head, ...groups[gi].rows.map((r) => {
              const meta = categoryMeta[r.name];
              const Icon = meta?.icon;
              const color = meta ? meta.color : 'var(--ink-soft)';
              const same = r.change !== null && Math.abs(r.change) < SAME_BAND;
              const prevAvg = (r.series[2] + r.series[3] + r.series[4]) / 3;
              const wording = r.isNew ? d.insights.newCategory
                : r.change === null || same ? d.insights.same
                : r.change > 0 ? t(d.insights.up, { pct: r.change })
                : t(d.insights.down, { pct: Math.abs(r.change) });
              const isNewRow = showAll && rows.indexOf(r) >= SHOWN;
              return (
                <li key={r.name} className={`pb-trend-row${isNewRow ? ' is-new-row' : ''}${r.name === firstNew && showAll ? ' is-first-new' : ''}`}>
                  <span className="pb-trend-cell pb-trend-name">
                    <span className="pb-ins-tile is-disc" aria-hidden="true" style={{ ['--pb-ins-cat' as string]: color }}>{Icon && <Icon size={14} />}</span>
                    <span className="pb-ins-trend-text">
                      {/* Category names are USER DATA and render as stored. */}
                      <span className="pb-ins-trend-name">{r.name}</span>
                      <span className="pb-ins-trend-vs">
                        {renderTemplate(ux.trendsVs, {
                          last: <span className="font-mono-tab">{whole(r.series[5])}</span>,
                          avg: <span className="font-mono-tab">{whole(prevAvg)}</span>,
                        })}
                      </span>
                    </span>
                  </span>
                  <div className="pb-trend-cell pb-trend-chart-cell">
                    <div className="pb-trend-chart">
                      <SparkBars
                        values={r.series.map((v) => Math.round(v * 100) / 100)} labels={monthLabels} color={color}
                        reference={prevAvg} label={t(ux.trendsBars, { name: r.name })}
                      />
                    </div>
                  </div>
                  <span className="pb-trend-cell pb-trend-badge">
                    {r.isNew ? (
                      <span className="pb-ins-new-chip">{ux.newChip}</span>
                    ) : (
                      <DeltaChip
                        delta={r.change === null || same ? 0 : r.change} good="down" label={wording}
                        text={r.change === null || same ? d.insights.same : `${r.change > 0 ? '+' : '\u2212'}${Math.abs(r.change)}%`}
                      />
                    )}
                  </span>
                </li>
              );
            })])}
          </ul>
          {rows.length > SHOWN && (
            <button
              type="button" className="link-btn pb-ins-more" aria-expanded={showAll}
              onClick={() => { focusNew.current = !showAll; setShowAll((v) => !v); }}
            >
              {showAll ? d.insights.showLess : t(d.insights.showAll, { count: rows.length })}
              <ChevronDown size={14} aria-hidden="true" className={showAll ? 'is-up' : undefined} />
            </button>
          )}
        </>
      )}
    </section>
  );
}
