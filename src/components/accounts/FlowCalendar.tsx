'use client';

import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ExpenseTransaction, IncomeTransaction } from '@/types';
import { formatCurrency, formatDate, formatLongDate } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { SectionHeader } from '@/components/kit/SectionHeader';
import { addDaysYmd, dateOf, flowByDay, type DayFlow, type DayPoint } from './accountMath';
import { useWidth } from './useWidth';
import { mouseOnly, useTapPopover } from './useTapPopover';

const CELL_MAX = 28;
const CELL_MIN = 13;
const GAP = 3;
const LABEL_W = 26;
const MIN_COLS = 13;

/** Five colour steps for each side, by quantile of |net| within the range. */
function steps(values: number[]): number[] {
  if (values.length === 0) return [];
  const s = [...values].sort((a, b) => a - b);
  return [0.2, 0.4, 0.6, 0.8].map((q) => s[Math.min(s.length - 1, Math.floor(q * s.length))]);
}
const levelOf = (v: number, cuts: number[]) => {
  let k = 0;
  while (k < cuts.length && v > cuts[k]) k++;
  return k; // 0..4
};

/**
 * Daily flow: a calendar of money in and out across all accounts for the
 * page's range - weeks as columns, weekdays as rows. Each day is tinted by
 * its net (income minus spending): pine for a net-in day, wine for net-out,
 * five steps each by quantile so one rent day does not wash the rest out.
 * Days with no income or spending are faint; today is outlined.
 *
 * Transfers and corrections are left out (neither earning nor spending).
 * The grid fits its card: on a phone the latest 13 weeks, on a Mac the
 * whole range when it fits; Earlier / Later page back, never a horizontal
 * scroll. role=grid with a roving tab stop; arrows move by day and week.
 * Wears pb-chart-fade, so the pattern blurs in privacy mode until tapped.
 */
export function FlowCalendar({ days, expenses, income, today, periodChip }: {
  days: DayPoint[];
  expenses: ExpenseTransaction[];
  income: IncomeTransaction[];
  today: string;
  periodChip?: ReactNode;
}) {
  const { d, t, locale } = useTranslation();
  const x = d.ux.accounts;
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref);
  // Weeks start on Sunday in English and Monday in Chinese, as each reader's calendar does.
  const weekStart = locale === 'zh' ? 1 : 0;
  const from = days[0]?.date ?? today;
  const flow = useMemo(() => flowByDay(expenses, income, from, today), [expenses, income, from, today]);
  const balanceOf = useMemo(() => new Map(days.map((p) => [p.date, p.total])), [days]);

  // Columns of 7 days, oldest first; the first column starts on the week
  // start on or before the range's first day.
  const weeks = useMemo(() => {
    const startDow = dateOf(from).getDay();
    const lead = (startDow - weekStart + 7) % 7;
    const first = addDaysYmd(from, -lead);
    const out: string[][] = [];
    for (let w = first; w <= today; w = addDaysYmd(w, 7)) {
      out.push(Array.from({ length: 7 }, (_, k) => addDaysYmd(w, k)));
    }
    return out;
  }, [from, today, weekStart]);

  const cuts = useMemo(() => {
    const ins: number[] = [];
    const outs: number[] = [];
    flow.forEach((f) => { const net = f.in - f.out; if (net > 0.004) ins.push(net); else if (net < -0.004) outs.push(-net); });
    return { in: steps(ins), out: steps(outs) };
  }, [flow]);

  // Cells grow to fill the card (up to CELL_MAX) and shrink to CELL_MIN;
  // whatever does not fit at that size pages.
  const cell = width > 0
    ? Math.max(CELL_MIN, Math.min(CELL_MAX, Math.floor((width - LABEL_W) / Math.max(weeks.length, MIN_COLS)) - GAP))
    : CELL_MAX;
  const fit = width > 0 ? Math.floor((width - LABEL_W + GAP) / (cell + GAP)) : weeks.length;
  const cols = Math.min(weeks.length, Math.max(1, fit));
  const pages = Math.max(1, Math.ceil(weeks.length / cols));
  // Page 0 is the latest weeks.
  const [page, setPage] = useState(0);
  const p = Math.min(page, pages - 1);
  const endCol = weeks.length - p * cols;
  const startCol = Math.max(0, endCol - cols);
  const visible = weeks.slice(startCol, endCol);

  const [focus, setFocus] = useState<string>(today);
  const [hover, setHover] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const tapFor = useTapPopover(ref, hover, setHover);
  const inRange = (k: string) => k >= from && k <= today;

  const move = (k: string, by: number) => {
    let n = addDaysYmd(k, by);
    if (n < from) n = from;
    if (n > today) n = today;
    setFocus(n);
    setHover(n);
    // Page to it if it left the visible weeks.
    const col = weeks.findIndex((w) => w.includes(n));
    if (col >= 0 && (col < startCol || col >= endCol)) setPage(Math.floor((weeks.length - 1 - col) / cols));
    requestAnimationFrame(() => gridRef.current?.querySelector<HTMLElement>(`[data-day="${n}"]`)?.focus());
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>, k: string) => {
    const by = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 }[e.key as 'ArrowUp'];
    if (by === undefined) return;
    e.preventDefault();
    move(k, by);
  };

  // Footer facts over the whole range, from the same data.
  const facts = useMemo(() => {
    let low: DayPoint | null = null;
    for (const q of days) if (!low || q.total < low.total) low = q;
    let big: { date: string; out: number } | null = null;
    let noSpend = 0;
    for (const q of days) {
      const f = flow.get(q.date);
      if (!f || f.out <= 0.004) noSpend++;
      if (f && f.out > 0.004 && (!big || f.out > big.out)) big = { date: q.date, out: f.out };
    }
    return { low, big, noSpend, total: days.length };
  }, [days, flow]);

  const tone = (f: DayFlow | undefined) => {
    if (!f) return '';
    const net = f.in - f.out;
    if (net > 0.004) return `is-in is-l${levelOf(net, cuts.in)}`;
    if (net < -0.004) return `is-out is-l${levelOf(-net, cuts.out)}`;
    return '';
  };
  const weekdays = useMemo(() => Array.from({ length: 7 }, (_, k) => {
    const dt = new Date(2026, 0, 4 + ((k + weekStart) % 7)); // 4 Jan 2026 is a Sunday
    return dt.toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', { weekday: 'narrow' });
  }), [locale, weekStart]);
  // A month's name over the week its 1st falls in, and over the first
  // column too - unless a 1st is only a column or two away, where the two
  // names would run together ("JulAug"). No name within 3 columns of the
  // previous one.
  const monthLabels = (() => {
    const hasFirst = (w: string[] | undefined) => !!w?.some((dd) => dd.endsWith('-01'));
    let lastAt = -Infinity;
    return visible.map((w, k) => {
      const firstOfMonth = w.find((dd) => dd.endsWith('-01'));
      if (!firstOfMonth && (k !== 0 || hasFirst(visible[1]) || hasFirst(visible[2]))) return '';
      if (k - lastAt < 3) return '';
      lastAt = k;
      return dateOf(firstOfMonth ?? w[0]).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', { month: 'short' });
    });
  })();

  // The one cell Tab lands on: the focused day when it is on this page,
  // otherwise the page's latest day.
  const lastVisible = [...(visible[visible.length - 1] ?? [])].reverse().find(inRange) ?? today;
  const tabDay = visible.some((w) => w.includes(focus)) && inRange(focus) ? focus : lastVisible;
  const shown = hover && inRange(hover) ? hover : null;
  const shownFlow = shown ? flow.get(shown) : undefined;
  const shownCol = shown ? visible.findIndex((w) => w.includes(shown)) : -1;
  const shownRow = shown && shownCol >= 0 ? visible[shownCol].indexOf(shown) : -1;
  const label = (k: string) => {
    const f = flow.get(k);
    const balance = formatCurrency(balanceOf.get(k) ?? 0);
    return f
      ? t(x.flowCell, { date: formatLongDate(k, locale), in: formatCurrency(f.in), out: formatCurrency(f.out), balance })
      : t(x.flowCellEmpty, { date: formatLongDate(k, locale), balance });
  };

  return (
    <section className="card pb-accounts-flow pb-rise" style={{ ['--pb-i' as string]: 3 }} aria-labelledby="pb-accounts-flow-title">
      <SectionHeader id="pb-accounts-flow-title" icon={CalendarDays} title={x.flowTitle} subtitle={x.flowSub} actions={periodChip} />

      <div ref={ref} className="pb-accounts-flow-frame">
        {pages > 1 && (
          <div className="pb-accounts-flow-pager">
            <button type="button" className="icon-btn" onClick={() => setPage(Math.min(pages - 1, p + 1))} disabled={p >= pages - 1} aria-label={x.flowEarlier}>
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <span className="pb-tnum">{t(x.flowSpan, { from: formatDate(visible[0].find(inRange) ?? visible[0][0], locale), to: formatDate(lastVisible, locale) })}</span>
            <button type="button" className="icon-btn" onClick={() => setPage(Math.max(0, p - 1))} disabled={p === 0} aria-label={x.flowLater}>
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
        )}

        <div className="pb-accounts-flow-chart pb-chart-fade" style={{ ['--pb-cell' as string]: `${cell}px`, ['--pb-cols' as string]: visible.length }} onPointerLeave={mouseOnly(() => setHover(null))}>
          <div className="pb-accounts-flow-months" aria-hidden="true">
            {visible.map((w, k) => <span key={w[0]}>{monthLabels[k]}</span>)}
          </div>
          <div className="pb-accounts-flow-grid" role="grid" aria-label={x.flowGridLabel} ref={gridRef}>
            {weekdays.map((wd, r) => (
              <div role="row" key={r} className="pb-accounts-flow-row">
                <span className="pb-accounts-flow-wd" aria-hidden="true">{r % 2 === 1 ? wd : ''}</span>
                {visible.map((w) => {
                  const k = w[r];
                  if (!inRange(k)) return <span key={k} className="pb-accounts-flow-cell is-out-of-range" aria-hidden="true" />;
                  const f = flow.get(k);
                  const tabStop = k === tabDay;
                  return (
                    <div
                      key={k} role="gridcell" data-day={k} tabIndex={tabStop ? 0 : -1}
                      aria-label={label(k)}
                      className={`pb-accounts-flow-cell ${tone(f)}${f ? '' : ' is-quiet'}${k === today ? ' is-today' : ''}${shown === k ? ' is-active' : ''}`}
                      onPointerEnter={mouseOnly(() => setHover(k))}
                      onFocus={() => { setFocus(k); setHover(k); }}
                      onBlur={() => setHover(null)}
                      {...tapFor(k)}
                      onKeyDown={(e) => onKey(e, k)}
                    />
                  );
                })}
              </div>
            ))}
          </div>
          {shown && shownCol >= 0 && (
            <div
              className={`pb-accounts-pop pb-accounts-flow-pop${shownCol > visible.length / 2 ? ' is-left' : ''}`} aria-hidden="true"
              style={{ left: `calc(${LABEL_W}px + ${shownCol} * (var(--pb-cell) + ${GAP}px) + var(--pb-cell) / 2)`, top: `calc(1.1rem + ${shownRow} * (var(--pb-cell) + ${GAP}px))` }}
            >
              <span className="pb-accounts-pop-title">{formatLongDate(shown, locale)}</span>
              <span className="pb-accounts-flow-pop-row"><span>{x.flowIn}</span><span className="font-mono-tab">{formatCurrency(shownFlow?.in ?? 0)}</span></span>
              <span className="pb-accounts-flow-pop-row"><span>{x.flowOut}</span><span className="font-mono-tab">{formatCurrency(shownFlow?.out ?? 0)}</span></span>
              <span className="pb-accounts-flow-pop-row is-net"><span>{x.flowNet}</span><span className="font-mono-tab">{formatCurrency((shownFlow?.in ?? 0) - (shownFlow?.out ?? 0))}</span></span>
              <span className="pb-accounts-flow-pop-row"><span>{x.flowBalance}</span><span className="font-mono-tab">{formatCurrency(balanceOf.get(shown) ?? 0)}</span></span>
            </div>
          )}
        </div>

        <div className="pb-accounts-flow-legend" aria-hidden="true">
          <span>{x.legendOut}</span>
          {[4, 3, 2, 1, 0].map((l) => <i key={`o${l}`} className={`pb-accounts-flow-cell is-out is-l${l}`} />)}
          <i className="pb-accounts-flow-cell is-quiet" />
          {[0, 1, 2, 3, 4].map((l) => <i key={`i${l}`} className={`pb-accounts-flow-cell is-in is-l${l}`} />)}
          <span>{x.legendIn}</span>
        </div>
      </div>

      <dl className="pb-accounts-flow-facts">
        <div>
          <dt>{x.flowLowest}</dt>
          <dd>{facts.low ? <><span className="font-mono-tab">{formatCurrency(facts.low.total)}</span><span className="pb-tnum"> · {formatDate(facts.low.date, locale)}</span></> : x.flowNone}</dd>
        </div>
        <div>
          <dt>{x.flowBiggest}</dt>
          <dd>{facts.big ? <><span className="font-mono-tab">{formatCurrency(facts.big.out)}</span><span className="pb-tnum"> · {formatDate(facts.big.date, locale)}</span></> : x.flowNone}</dd>
        </div>
        <div>
          <dt>{x.flowNoSpend}</dt>
          <dd className="pb-tnum">{t(x.flowNoSpendValue, { count: facts.noSpend, total: facts.total })}</dd>
        </div>
      </dl>
      <p className="pb-accounts-flow-note">{x.flowExplain}</p>
    </section>
  );
}
