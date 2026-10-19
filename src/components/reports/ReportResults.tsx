'use client';

import { useState, type ReactNode } from 'react';
import { ArrowDownLeft, ArrowUpRight, CalendarX2, SearchX, SlidersHorizontal } from 'lucide-react';
import type { CategoryMeta, Transaction } from '@/types';
import { formatCurrency, parseLocalDate } from '@/lib/format';
import { INTL_LOCALE } from '@/lib/i18n/locale';
import { TransactionRow } from '@/components/shared/TransactionRow';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { EmptyState } from '@/components/kit/EmptyState';
import type { ReportPeriodGroup, CategoryGroupMode, SortDir, SortField } from './types';
import { ReportCategoryRow } from './ReportCategoryRow';
import { sectionByDay } from './daySections';

// Mixed (both types shown): every income group or row sits on a 9% pine
// band and every expense one on a 9% wine band - the owner's light green and
// light red, mixed from the theme colours so they follow every palette and
// dark mode. The bands are now classes (pb-rep-tint-in / -out in
// reports.css), so a row's HOVER can deepen its own tint instead of painting
// the theme hover colour over it (owner-reported: the light-green hover
// vanished on green rows and turned red rows muddy).
//
// The bands run edge to edge and touch: red-red reads as one red block,
// green-green as one green, and the switch between the two is a clean line.
// The period title stays on the plain card.

/** More rows than this in one ungrouped period render behind "Show all". */
const ROW_CAP = 250;

export interface ReportEmptyInfo {
  /** none: no type selected; period: the period itself has no rows; filtered: filters hide them. */
  kind: 'none' | 'period' | 'filtered';
  period: string;
  onShowBoth: () => void;
  onClearFilters: (() => void) | null;
  onGoCurrent: (() => void) | null;
  onAllTime: (() => void) | null;
}

interface ReportResultsProps {
  periodGroups: ReportPeriodGroup[];
  periodFilteredCount: number;
  /** True when expenses and income show together: groups and rows are tinted. */
  tinted: boolean;
  categoryGroup: CategoryGroupMode;
  showPeriodHeaders: boolean;
  expandedCategoryGroups: Set<string>;
  onToggleCategoryGroup: (key: string) => void;
  categoryMeta: CategoryMeta;
  onOpenDetail: (txn: Transaction) => void;
  sortField: SortField;
  sortDir: SortDir;
  /** Column-header sorting: writes the same sortField / sortDir as the Sort select. */
  onSort: (field: SortField) => void;
  /** Category -> monthly totals for the trend column; null when not grouped. */
  series: Map<string, number[]> | null;
  empty: ReportEmptyInfo;
}

const sideOf = (t: Transaction) => (t.type === 'income' ? 'in' : 'out');

export function ReportResults({
  periodGroups, periodFilteredCount, tinted, categoryGroup, showPeriodHeaders,
  expandedCategoryGroups, onToggleCategoryGroup, categoryMeta, onOpenDetail,
  sortField, sortDir, onSort, series, empty,
}: ReportResultsProps) {
  // dict/tr: `t` is the transaction parameter in the map callbacks below.
  const { d: dict, t: tr, locale } = useTranslation();
  const x = dict.ux.reports;
  const amt = (t: Transaction) => (tinted ? t.amount : Math.abs(t.amount));

  // Collapsed groups do not mount their rows until first opened, so a long
  // report costs nothing for the groups nobody opens. Once opened they stay
  // mounted, so closing still slides. Derived during render (React's
  // "adjusting state when a prop changes" pattern), not in an effect, so a
  // group's rows exist in the very render that opens it.
  const [mountedGroups, setMountedGroups] = useState<Set<string>>(() => new Set(expandedCategoryGroups));
  const unseen = [...expandedCategoryGroups].filter((k) => !mountedGroups.has(k));
  if (unseen.length > 0) setMountedGroups(new Set([...mountedGroups, ...unseen]));
  // Ungrouped periods above ROW_CAP rows the person chose to show in full.
  const [uncapped, setUncapped] = useState<Set<string>>(new Set());

  if (periodGroups.length === 0 || periodFilteredCount === 0) {
    // Same condition as before; the kit empty state now says which period
    // and offers the way out instead of a bare "try adjusting your filters".
    const Icon = empty.kind === 'filtered' ? SearchX : empty.kind === 'none' ? SlidersHorizontal : CalendarX2;
    const body = empty.kind === 'none' ? x.emptyNoType
      : empty.kind === 'filtered' ? tr(x.emptyFiltered, { period: empty.period })
      : tr(x.emptyPeriod, { period: empty.period });
    return (
      <div className="card pb-rep-empty pb-rise">
        <EmptyState
          icon={Icon}
          title={dict.reports.noMatch}
          body={<><p style={{ margin: 0 }}>{body}</p>{empty.kind === 'filtered' && <p style={{ margin: '0.15rem 0 0' }}>{dict.reports.noMatchHint}</p>}</>}
          action={(
            <>
              {empty.kind === 'none' && <button type="button" className="pill active" onClick={empty.onShowBoth}>{x.showBoth}</button>}
              {empty.onClearFilters && <button type="button" className="pill active" onClick={empty.onClearFilters}>{x.clearFilters}</button>}
              {empty.onGoCurrent && <button type="button" className="pill" onClick={empty.onGoCurrent}>{x.goCurrent}</button>}
              {empty.onAllTime && <button type="button" className="pill" onClick={empty.onAllTime}>{x.tryAllTime}</button>}
            </>
          )}
        />
      </div>
    );
  }

  const sideLabel = (side: 'in' | 'out') => (
    <div className={`pb-rep-side pb-rep-tint-${side}`}>
      {side === 'in' ? <ArrowDownLeft size={13} aria-hidden="true" /> : <ArrowUpRight size={13} aria-hidden="true" />}
      <span>{side === 'in' ? x.moneyIn : x.moneyOut}</span>
    </div>
  );
  const signed = (v: number) => `${tinted && v > 0 ? '+' : ''}${formatCurrency(v)}`;
  const tone = (v: number) => (!tinted ? '' : Math.round(v * 100) > 0 ? ' is-in' : Math.round(v * 100) < 0 ? ' is-out' : '');
  const dayLabel = (ymd: string) => {
    const dt = parseLocalDate(ymd);
    const loc = INTL_LOCALE[locale];
    return {
      weekday: dt.toLocaleDateString(loc, { weekday: 'short' }),
      date: dt.toLocaleDateString(loc, { month: 'short', day: 'numeric', ...(showPeriodHeaders && periodGroups.length > 0 ? {} : { year: 'numeric' }) }),
    };
  };
  const row = (t: Transaction, lead?: ReactNode) => (
    <TransactionRow
      key={t.id} txn={t} onOpenDetail={onOpenDetail} categoryMeta={categoryMeta}
      focusable silent lead={lead} className="pb-rep-row"
    />
  );
  const colHead = (field: SortField | null, text: string, cls: string) => {
    if (!field) return <span className={cls}>{text}</span>;
    const on = sortField === field;
    return (
      <button
        type="button" className={`${cls} pb-rep-th-btn${on ? ' is-on' : ''}`} onClick={() => onSort(field)}
        aria-label={tr(x.sortBy, { column: text })} aria-pressed={on}
      >
        {text}{on && <span aria-hidden="true">{sortDir === 'desc' ? ' ↓' : ' ↑'}</span>}
      </button>
    );
  };

  return (
    <div className="pb-rep-results">
      {periodGroups.map((pg, pi) => {
        // Mixed: each side's own total, so shares sum to 100% within it.
        const sideIn = tinted ? (pg.subGroups ?? []).reduce((s, sg) => s + Math.max(0, sg.total), 0) : 0;
        const sideOut = tinted ? (pg.subGroups ?? []).reduce((s, sg) => s + Math.max(0, -sg.total), 0) : 0;
        const allItems = pg.items ?? [];
        const inSum = tinted ? (categoryGroup === 'category' ? sideIn : allItems.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0)) : 0;
        const outSum = tinted ? (categoryGroup === 'category' ? sideOut : allItems.filter((t) => t.amount < 0).reduce((s, t) => s - t.amount, 0)) : 0;
        return (
          <section
            key={pg.key}
            className={`card pb-rep-period pb-rise${tinted ? ' is-tinted' : ''}${showPeriodHeaders ? ' has-head' : ''}`}
            style={{ ['--pb-i' as string]: Math.min(pi, 6) }}
            aria-label={pg.label || undefined}
          >
            {showPeriodHeaders && (
              <header className="pb-rep-phead">
                <h3 className="font-display">{pg.label}</h3>
                <span className="pb-rep-phead-figs">
                  {tinted && (
                    <span className="pb-rep-phead-split">
                      <span className="font-mono-tab is-in">+{formatCurrency(inSum)}</span>
                      <span className="font-mono-tab is-out">{formatCurrency(-outSum)}</span>
                    </span>
                  )}
                  <span className={`font-mono-tab pb-rep-phead-total${tone(pg.total)}`}>{signed(pg.total)}</span>
                </span>
              </header>
            )}

            {categoryGroup === 'category' ? (
              <>
                <div className="pb-rep-thead">
                  {colHead(null, x.colCategory, 'pb-rep-th-cat')}
                  {colHead(null, x.colCount, 'pb-rep-th-count')}
                  {colHead(null, x.colShare, 'pb-rep-th-share')}
                  {colHead(null, x.colTrend, 'pb-rep-th-trend')}
                  {colHead('amount', x.colTotal, 'pb-rep-th-total')}
                </div>
                {(pg.subGroups ?? []).map((sg, i, all) => {
                  const groupKey = `${pg.key}::${sg.key}`;
                  const isGroupExpanded = expandedCategoryGroups.has(groupKey);
                  const side = sg.items[0]?.type === 'income' ? 'in' : 'out';
                  const firstOfSide = tinted && (i === 0 || (all[i - 1].items[0]?.type === 'income' ? 'in' : 'out') !== side);
                  const share = tinted
                    ? Math.abs(sg.total) / ((side === 'in' ? sideIn : sideOut) || 1)
                    : Math.abs(sg.total) / (Math.abs(pg.total) || 1);
                  const panelId = `pb-rep-g-${pi}-${i}`;
                  return (
                    <div key={sg.key} className={`pb-rep-group${tinted ? ` pb-rep-tint-${side}` : ''}`}>
                      {firstOfSide && sideLabel(side)}
                      <ReportCategoryRow
                        category={sg.key} total={sg.total} count={sg.items.length} share={share}
                        series={series?.get(sg.key)}
                        expanded={isGroupExpanded} controls={panelId}
                        onToggle={() => onToggleCategoryGroup(groupKey)}
                        categoryMeta={categoryMeta}
                      />
                      {/* inert while closed: Tab skips rows nobody can see. */}
                      <div id={panelId} className={`collapsible-rows ${isGroupExpanded ? 'expanded' : ''}`} inert={!isGroupExpanded}>
                        <div className="collapsible-rows-inner">
                          {(isGroupExpanded || mountedGroups.has(groupKey)) && (
                            <div className="pb-rep-nested">{sg.items.map((t) => row(t))}</div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            ) : (() => {
              const capped = allItems.length > ROW_CAP && !uncapped.has(pg.key);
              const items = capped ? allItems.slice(0, ROW_CAP) : allItems;
              // Runs of one side (mixed lists lead with income, see typeRank).
              const runs: { side: 'in' | 'out'; items: Transaction[] }[] = [];
              for (const t of items) {
                const s = sideOf(t);
                const last = runs[runs.length - 1];
                if (last && last.side === s) last.items.push(t); else runs.push({ side: s, items: [t] });
              }
              const ranked = sortField === 'amount';
              return (
                <>
                  {ranked && <p className="pb-rep-ranked-title">{x.topTransactions}</p>}
                  {runs.map((run) => (
                    <div key={run.side} className={tinted ? `pb-rep-run pb-rep-tint-${run.side}` : 'pb-rep-run'}>
                      {tinted && sideLabel(run.side)}
                      {ranked ? (
                        run.items.map((t, i) => row(t, (
                          <span className={`pb-rep-rank pb-tnum${i < 3 ? ' is-top' : ''}`} aria-label={tr(x.rankLabel, { n: i + 1 })}>{i + 1}</span>
                        )))
                      ) : (
                        // Day sections: a header at every change of date in
                        // the already-sorted list; nothing is re-ordered.
                        sectionByDay(run.items, amt).map((day) => {
                          const l = dayLabel(day.ymd);
                          return (
                            <div key={day.ymd} className="pb-rep-day" data-rep-day={day.ymd}>
                              <div className="pb-rep-day-head">
                                <span><b>{l.weekday}</b> <span className="pb-tnum">{l.date}</span></span>
                                <span className={`font-mono-tab${tone(day.total)}`}>{signed(day.total)}</span>
                              </div>
                              {day.items.map((t) => row(t))}
                            </div>
                          );
                        })
                      )}
                    </div>
                  ))}
                  {capped && (
                    <div className="pb-rep-more">
                      <button type="button" className="pill" onClick={() => setUncapped((s) => new Set([...s, pg.key]))}>
                        {tr(x.showAll, { count: allItems.length })}
                      </button>
                    </div>
                  )}
                </>
              );
            })()}
          </section>
        );
      })}
    </div>
  );
}
