'use client';

import { RollingAmount, RollingMoneyText } from '@/components/shared/RollingAmount';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { CategoryMeta, Transaction } from '@/types';
import { formatCurrency, formatDate, formatMonthYear } from '@/lib/format';
import { categoryLabel } from '@/lib/i18n/enumLabels';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { SectionHeader } from '@/components/kit/SectionHeader';
import { SegmentedControl } from '@/components/kit/SegmentedControl';
import { EmptyState } from '@/components/kit/EmptyState';
import { Skeleton } from '@/components/kit/Skeleton';
import { ChargeRow } from './ChargeRow';
import { AddTransactionAction } from './AddTransactionAction';
import { DayHeatmapYear } from './DayHeatmapYear';
import { useCoarsePointer } from './hooks';
import { SHADES, makeLevel, pad } from './shared';

type View = 'month' | 'year';

interface DayByDayProps {
  transactions: Transaction[];
  categoryMeta: CategoryMeta;
  /** Zone-aware 'YYYY-MM-DD', or null for the first frame. */
  today: string | null;
  onOpen: (txn: Transaction) => void;
}

/**
 * A month calendar of spending. Each day is shaded by how much was spent,
 * relative to a high-but-typical day (90th percentile of spending days, square
 * root), so one big payment does not flatten every other day; days with nothing spent are hollow; future days
 * are faded. Spending only - income does not shade a day. Tap a day for its
 * transactions. Amounts appear only in text, so privacy mode can blur them.
 *
 * Day by day 2.0 (same rules, more ways in):
 * - On a wide card the picked day opens in a panel BESIDE the calendar (a
 *   month summary sits there until a day is picked), so picking no longer
 *   grows the card; on a narrow card it opens underneath as before.
 * - A quiet Week column with each row's total, when there is room.
 * - Today is a pine dot and a soft ring (it was a heavy ink outline that
 *   hid the gold "picked" outline); picked keeps the gold outline, and both
 *   now show at once.
 * - Keyboard: one Tab stop; arrows move by a day or a week, Home/End to the
 *   row's ends, Page Up/Down change month. Phone: swipe sideways for the
 *   previous or next month, within the same bounds as the arrows.
 * - A Year view: the last 12 months as a heatmap; a square opens its month
 *   with that day picked.
 */
export function DayByDay({ transactions, categoryMeta, today, onOpen }: DayByDayProps) {
  const { d, t, locale } = useTranslation();
  const ux = d.ux.insights;
  const coarse = useCoarsePointer();
  const [offset, setOffset] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [view, setView] = useState<View>('month');
  // The day holding the calendar's one Tab stop, once one has been chosen.
  const [focusDay, setFocusDay] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const wantFocus = useRef(false);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);

  const earliest = useMemo(
    () => transactions.reduce<string | null>((m, x) => (m === null || x.date < m ? x.date : m), null),
    [transactions],
  );

  // Keyboard moves: focus the new day once it is rendered (it may be in
  // another month).
  useEffect(() => {
    if (!wantFocus.current || !focusDay) return;
    wantFocus.current = false;
    gridRef.current?.querySelector<HTMLElement>(`[data-day="${focusDay}"]`)?.focus();
  }, [focusDay, offset, view]);

  const viewControl = (
    <SegmentedControl<View>
      size="sm" ariaLabel={ux.viewLabel} value={view} onChange={setView}
      options={[{ value: 'month', label: ux.viewMonth }, { value: 'year', label: ux.viewYear }]}
    />
  );
  const hint = view === 'year' ? ux.yearHint : coarse ? d.insights.dayHint : ux.dayHintClick;
  const header = <SectionHeader id="pb-daybyday-title" icon={CalendarDays} title={d.insights.dayTitle} subtitle={hint} actions={viewControl} />;

  if (!today) {
    return (
      <section className="card pb-ins-card pb-ins-day" aria-labelledby="pb-daybyday-title" aria-busy="true" style={{ minHeight: 360 }}>
        <SectionHeader id="pb-daybyday-title" icon={CalendarDays} title={d.insights.dayTitle} subtitle={d.insights.dayHint} />
        <div className="pb-ins-skel-cal" aria-hidden="true">
          {Array.from({ length: 35 }, (_, i) => <Skeleton key={i} width="100%" height="auto" radius="10px" style={{ aspectRatio: '1 / 1' }} />)}
        </div>
      </section>
    );
  }

  const ty = Number(today.slice(0, 4));
  const tm = Number(today.slice(5, 7)) - 1;
  const first = new Date(ty, tm - offset, 1);
  const y = first.getFullYear();
  const m = first.getMonth();
  const prefix = `${y}-${pad(m + 1)}-`;
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  // At most 12 months back (this October to last October), never before the first record.
  const maxOffset = earliest ? Math.min(12, Math.max(0, (ty - Number(earliest.slice(0, 4))) * 12 + (tm - (Number(earliest.slice(5, 7)) - 1)))) : 0;

  const byDay = new Map<string, { spent: number; items: Transaction[] }>();
  for (const x of transactions) {
    if (x.type !== 'expense' || x.amount >= 0 || !x.date.startsWith(prefix)) continue;
    const e = byDay.get(x.date) ?? { spent: 0, items: [] };
    e.spent += Math.abs(x.amount);
    e.items.push(x);
    byDay.set(x.date, e);
  }
  let max = 0;
  let busiest: string | null = null;
  let total = 0;
  const byCategory = new Map<string, number>();
  byDay.forEach((v, k) => {
    total += v.spent;
    if (v.spent > max) { max = v.spent; busiest = k; }
    for (const x of v.items) byCategory.set(x.category, (byCategory.get(x.category) ?? 0) + Math.abs(x.amount));
  });
  // Shade against a high-but-typical day (90th percentile of spending days), not
  // the single biggest, so one large scheduled payment does not wash out every
  // ordinary day. Days above it take the darkest shade. Few spending days: use max.
  const level = makeLevel([...byDay.values()].map((v) => v.spent));

  const tag = locale === 'zh' ? 'zh-CN' : 'en-US';
  const weekStart = locale === 'zh' ? 1 : 0;
  const lead = (new Date(y, m, 1).getDay() - weekStart + 7) % 7;
  // 1 January 2023 was a Sunday.
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Date(2023, 0, 1 + ((weekStart + i) % 7)).toLocaleDateString(tag, { weekday: 'narrow' }));

  // The last day that can be picked: today in the current month.
  const lastDay = offset === 0 ? Number(today.slice(8, 10)) : daysInMonth;
  const cells: (number | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const rows = Array.from({ length: cells.length / 7 }, (_, r) => cells.slice(r * 7, r * 7 + 7));

  const go = (delta: number) => { setOffset((o) => Math.min(maxOffset, Math.max(0, o + delta))); setPicked(null); };
  const pickedDay = picked ? byDay.get(picked) : undefined;
  const tabDay = focusDay && focusDay.startsWith(prefix) && Number(focusDay.slice(8, 10)) <= lastDay ? focusDay
    : picked && picked.startsWith(prefix) ? picked
    : today.startsWith(prefix) ? today : `${prefix}01`;

  const onKey = (e: React.KeyboardEvent, day: number) => {
    const col = (lead + day - 1) % 7;
    let target: number | null = null;
    let monthStep = 0;
    switch (e.key) {
      case 'ArrowLeft': target = day - 1; break;
      case 'ArrowRight': target = day + 1; break;
      case 'ArrowUp': target = day - 7; break;
      case 'ArrowDown': target = day + 7; break;
      case 'Home': target = day - col; break;
      case 'End': target = day + (6 - col); break;
      case 'PageUp': monthStep = 1; break;
      case 'PageDown': monthStep = -1; break;
      default: return;
    }
    e.preventDefault();
    if (monthStep) {
      const next = Math.min(maxOffset, Math.max(0, offset + monthStep));
      if (next === offset) return;
      const nf = new Date(ty, tm - next, 1);
      const nLast = next === 0 ? Number(today.slice(8, 10)) : new Date(nf.getFullYear(), nf.getMonth() + 1, 0).getDate();
      go(monthStep);
      wantFocus.current = true;
      setFocusDay(`${nf.getFullYear()}-${pad(nf.getMonth() + 1)}-${pad(Math.min(day, nLast))}`);
      return;
    }
    wantFocus.current = true;
    setFocusDay(`${prefix}${pad(Math.min(lastDay, Math.max(1, target ?? day)))}`);
  };

  // Sideways swipe on the calendar (touch and pen): previous / next month.
  // The grid takes horizontal pans itself (touch-action: pan-y), and a tap
  // that ends a swipe is not also a pick.
  const swipeHandlers = {
    onPointerDown: (e: React.PointerEvent) => {
      swiped.current = false;
      swipe.current = e.pointerType === 'mouse' ? null : { x: e.clientX, y: e.clientY };
    },
    onPointerUp: (e: React.PointerEvent) => {
      const s = swipe.current;
      swipe.current = null;
      if (!s) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        swiped.current = true;
        go(dx < 0 ? -1 : 1);
      }
    },
    onPointerCancel: () => { swipe.current = null; },
    onClickCapture: (e: React.MouseEvent) => {
      if (!swiped.current) return;
      swiped.current = false;
      e.stopPropagation();
      e.preventDefault();
    },
  };

  const pickFromYear = (ymd: string) => {
    const off = (ty - Number(ymd.slice(0, 4))) * 12 + (tm - (Number(ymd.slice(5, 7)) - 1));
    setOffset(Math.min(maxOffset, Math.max(0, off)));
    setPicked(ymd);
    wantFocus.current = true;
    setFocusDay(ymd);
    setView('month');
  };

  const legend = (
    <div className="pb-ins-cal-legend" aria-hidden="true">
      <span className="pb-ins-cal-legend-scale">
        {d.insights.less}
        {SHADES.map((s, i) => <i key={s} className="pb-ins-swatch" data-level={i + 1} />)}
        {d.insights.more}
      </span>
      <span className="pb-ins-cal-legend-scale">
        <i className="pb-ins-swatch is-empty" />
        {d.insights.nothingSpent}
      </span>
    </div>
  );

  if (view === 'year') {
    return (
      <section className="card pb-ins-card pb-ins-day" aria-labelledby="pb-daybyday-title">
        {header}
        <DayHeatmapYear transactions={transactions} today={today} earliest={earliest} onPick={pickFromYear} />
        {legend}
      </section>
    );
  }

  // Any spending at all, in any month: without it the summary below is empty.
  const hasSpending = transactions.some((x) => x.type === 'expense' && x.amount < 0);
  // The month at a glance, for the side panel before a day is picked.
  const spendDays = [...byDay.keys()].filter((k) => k <= today).length;
  const noSpend = Math.max(0, lastDay - spendDays);
  const topCat = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0];
  const topMeta = topCat ? categoryMeta[topCat[0]] : undefined;
  const TopIcon = topMeta?.icon;

  return (
    <section className="card pb-ins-card pb-ins-day" aria-labelledby="pb-daybyday-title">
      {header}
      <div className="pb-ins-day-body">
        <div className="pb-ins-cal">
          <div className="pb-ins-cal-nav">
            <button type="button" className="icon-btn pb-ins-nav-btn" onClick={() => go(1)} disabled={offset >= maxOffset} aria-label={d.insights.prevMonth}>
              <ChevronLeft size={20} />
            </button>
            <div className="pb-ins-cal-title">
              <span className="pb-ins-cal-month">{formatMonthYear(y, m, locale)}</span>
              <span className="pb-ins-cal-totals">
                <span className="font-mono-tab"><RollingMoneyText value={t(d.insights.monthTotal, { amount: formatCurrency(total) })} /></span>
                {busiest && (
                  <>{' · '}<span className="font-mono-tab"><RollingMoneyText value={t(d.insights.busiest, { date: formatDate(busiest, locale), amount: formatCurrency(max) })} /></span></>
                )}
              </span>
            </div>
            <button type="button" className="icon-btn pb-ins-nav-btn" onClick={() => go(-1)} disabled={offset <= 0} aria-label={d.insights.nextMonth}>
              <ChevronRight size={20} />
            </button>
          </div>

          <div ref={gridRef} key={prefix} className="pb-ins-cal-grid" {...swipeHandlers}>
            <div className="pb-ins-cal-row is-head" aria-hidden="true">
              {weekdays.map((w, i) => <span key={i}>{w}</span>)}
              <span className="pb-ins-cal-wk">{ux.weekCol}</span>
            </div>
            {rows.map((row, r) => {
              let weekTotal = 0;
              for (const day of row) if (day !== null) weekTotal += byDay.get(`${prefix}${pad(day)}`)?.spent ?? 0;
              return (
                <div key={r} className="pb-ins-cal-row">
                  {row.map((day, i) => {
                    if (day === null) return <span key={`b${i}`} className="pb-ins-cal-blank" />;
                    const ymd = `${prefix}${pad(day)}`;
                    const future = ymd > today;
                    const spent = byDay.get(ymd)?.spent ?? 0;
                    const lvl = future ? 0 : level(spent);
                    const isPicked = picked === ymd;
                    const isToday = ymd === today;
                    return (
                      <button
                        key={ymd} type="button" disabled={future} data-day={ymd} data-level={lvl || undefined}
                        className={`pb-ins-day-cell${lvl === 0 && !future ? ' is-empty' : ''}${future ? ' is-future' : ''}${isToday ? ' is-today' : ''}${isPicked ? ' is-picked' : ''}`}
                        tabIndex={ymd === tabDay ? 0 : -1}
                        onClick={() => { setPicked(isPicked ? null : ymd); setFocusDay(ymd); }}
                        onKeyDown={(e) => onKey(e, day)}
                        aria-pressed={isPicked}
                        aria-current={isToday ? 'date' : undefined}
                        aria-label={`${formatDate(ymd, locale)}: ${spent > 0 ? t(d.insights.daySpent, { amount: formatCurrency(spent) }) : d.insights.nothingSpent}`}
                      >
                        <span className="pb-ins-day-n pb-tnum">{day}</span>
                        {isToday && <span className="pb-ins-day-dot" aria-hidden="true" />}
                      </button>
                    );
                  })}
                  <span className="pb-ins-cal-wk">
                    <span className="pb-ins-sr">{ux.weekTotal}: </span>
                    {weekTotal > 0 ? <span className="font-mono-tab">{formatCurrency(Math.round(weekTotal)).replace(/\.00$/, '')}</span> : <span aria-hidden="true">–</span>}
                  </span>
                </div>
              );
            })}
          </div>
          {legend}
        </div>

        {picked ? (
          <aside key={picked} className="pb-ins-day-panel is-day goal-step" aria-label={formatDate(picked, locale)}>
            <div className="pb-ins-panel-head">
              <div style={{ minWidth: 0 }}>
                <p className="pb-ins-panel-date">{formatDate(picked, locale)}</p>
                {pickedDay && (
                  <p className="pb-ins-panel-sub">
                    <span className="pb-tnum">{pickedDay.items.length === 1 ? ux.dayItemsOne : t(ux.dayItems, { count: pickedDay.items.length })}</span>
                    {' · '}<span className="font-mono-tab"><RollingAmount value={formatCurrency(pickedDay.spent)} /></span>
                  </p>
                )}
              </div>
              <button type="button" className="icon-btn pb-ins-panel-close" onClick={() => setPicked(null)} aria-label={ux.closeDay}>
                <X size={16} />
              </button>
            </div>
            {!pickedDay ? (
              <p className="pb-ins-quiet">{d.insights.dayNothing}</p>
            ) : (
              <ul className="pb-ins-charges">
                {[...pickedDay.items].sort((a, b) => a.amount - b.amount).map((x) => (
                  <li key={x.id}><ChargeRow txn={x} categoryMeta={categoryMeta} onOpen={onOpen} /></li>
                ))}
              </ul>
            )}
          </aside>
        ) : !hasSpending ? (
          // A new account: "0 spending days, 23 no-spend days" would read as
          // a result. Say what is missing instead, keeping the card's place.
          <aside className="pb-ins-day-panel is-summary is-needs" aria-label={ux.monthSummary}>
            <EmptyState compact icon={CalendarDays} title={ux.calNeedsTitle} body={ux.calNeedsBody} action={<AddTransactionAction />} />
          </aside>
        ) : (
          <aside className="pb-ins-day-panel is-summary" aria-label={offset === 0 ? ux.monthSummary : formatMonthYear(y, m, locale)}>
            <p className="pb-ins-mini-head">{offset === 0 ? ux.monthSummary : formatMonthYear(y, m, locale)}</p>
            <p className="pb-ins-panel-total font-mono-tab"><RollingAmount value={formatCurrency(total)} /></p>
            <dl className="pb-ins-facts">
              {busiest && (
                <div>
                  <dt>{ux.busiestDay}</dt>
                  <dd><span className="pb-tnum">{formatDate(busiest, locale)}</span><span className="pb-ins-sep" aria-hidden="true">·</span><span className="font-mono-tab"><RollingAmount value={formatCurrency(max)} /></span></dd>
                </div>
              )}
              <div><dt>{ux.noSpendCount}</dt><dd className="pb-tnum">{noSpend}</dd></div>
              <div><dt>{ux.spendDays}</dt><dd className="pb-tnum">{spendDays}</dd></div>
              {topCat && (
                <div>
                  <dt>{ux.topCategory}</dt>
                  <dd className="pb-ins-fact-cat">
                    <span className="pb-ins-tile is-sm" aria-hidden="true" style={{ ['--pb-ins-cat' as string]: topMeta ? topMeta.color : 'var(--ink-soft)' }}>{TopIcon && <TopIcon size={13} />}</span>
                    <span className="pb-ins-fact-cat-name">{categoryLabel(d, topCat[0])}</span>
                    <span className="font-mono-tab"><RollingAmount value={formatCurrency(topCat[1])} /></span>
                  </dd>
                </div>
              )}
            </dl>
            <p className="pb-ins-quiet">{coarse ? d.insights.dayHint : ux.pickDayHint}</p>
          </aside>
        )}
      </div>
    </section>
  );
}
