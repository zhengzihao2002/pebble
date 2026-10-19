'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Transaction } from '@/types';
import { formatCurrency, formatDate } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { addDaysYmd, fromYmd, makeLevel } from './shared';

interface DayHeatmapYearProps {
  transactions: Transaction[];
  today: string;
  /** The first recorded date; days before it cannot be picked. */
  earliest: string | null;
  /** A day was chosen: open its month with it picked. */
  onPick: (ymd: string) => void;
}

/**
 * NEW: Day by day's Year view - the last 12 months, one square a day, a
 * column per week (in the language's week order). Same spending-only rule
 * and the same shading as the month calendar, with the high-but-typical cap
 * taken over the whole year. Amounts are never drawn in the squares; each
 * square's accessible name carries the date and amount.
 *
 * Arrow keys move a day (up/down) or a week (left/right); Enter picks.
 * Too wide for a phone, so it scrolls sideways there, opened at today.
 */
export function DayHeatmapYear({ transactions, today, earliest, onPick }: DayHeatmapYearProps) {
  const { d, t, locale } = useTranslation();
  const ux = d.ux.insights;
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const wantFocus = useRef(false);
  const weekStart = locale === 'zh' ? 1 : 0;

  const model = useMemo(() => {
    const raw = addDaysYmd(today, -364);
    const back = (fromYmd(raw).getDay() - weekStart + 7) % 7;
    const start = addDaysYmd(raw, -back);
    const byDay = new Map<string, number>();
    for (const x of transactions) {
      if (x.type !== 'expense' || x.amount >= 0 || x.date < start || x.date > today) continue;
      byDay.set(x.date, (byDay.get(x.date) ?? 0) + Math.abs(x.amount));
    }
    const level = makeLevel([...byDay.values()]);
    const days: { ymd: string; spent: number; lvl: number }[] = [];
    for (let ymd = start; ymd <= today; ymd = addDaysYmd(ymd, 1)) {
      const spent = byDay.get(ymd) ?? 0;
      days.push({ ymd, spent, lvl: level(spent) });
    }
    const tag = locale === 'zh' ? 'zh-CN' : 'en-US';
    const months: { col: number; label: string }[] = [];
    days.forEach((x, i) => {
      if (!x.ymd.endsWith('-01')) return;
      const col = Math.floor(i / 7);
      if (months.length && col - months[months.length - 1].col < 3) return;
      months.push({ col, label: fromYmd(x.ymd).toLocaleDateString(tag, { month: 'short' }) });
    });
    return { start, days, cols: Math.ceil(days.length / 7), months };
  }, [transactions, today, weekStart, locale]);

  // Open at today (the right-hand end) when it scrolls sideways.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);

  useEffect(() => {
    if (!wantFocus.current || !focus) return;
    wantFocus.current = false;
    gridRef.current?.querySelector<HTMLElement>(`[data-day="${focus}"]`)?.focus();
  }, [focus]);

  const first = earliest && earliest > model.start ? earliest : model.start;
  const tabDay = focus ?? today;

  const onKey = (e: React.KeyboardEvent, ymd: string) => {
    const step = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' ? -7 : e.key === 'ArrowRight' ? 7 : 0;
    if (!step) return;
    e.preventDefault();
    let next = addDaysYmd(ymd, step);
    if (next > today) next = today;
    if (next < first) next = first;
    wantFocus.current = true;
    setFocus(next);
  };

  return (
    <div className="pb-ins-year">
      <div ref={scrollRef} className="pb-ins-year-scroll">
        <div className="pb-ins-year-inner" style={{ ['--pb-cols' as string]: model.cols }}>
          <div className="pb-ins-year-months" aria-hidden="true">
            {model.months.map((m) => (
              <span key={m.col} style={{ gridColumn: `${m.col + 1} / span 3` }}>{m.label}</span>
            ))}
          </div>
          <div ref={gridRef} className="pb-ins-year-grid" role="group" aria-label={ux.yearLabel}>
            {model.days.map((x, i) => {
              const before = x.ymd < first;
              return (
                <button
                  key={x.ymd} type="button" data-day={x.ymd} data-level={x.lvl || undefined}
                  className={`pb-ins-yday${x.lvl === 0 && !before ? ' is-empty' : ''}${before ? ' is-before' : ''}${x.ymd === today ? ' is-today' : ''}`}
                  style={{ gridColumn: Math.floor(i / 7) + 1, gridRow: (i % 7) + 1 }}
                  disabled={before}
                  tabIndex={x.ymd === tabDay ? 0 : -1}
                  onClick={() => onPick(x.ymd)}
                  onKeyDown={(e) => onKey(e, x.ymd)}
                  onFocus={() => setFocus(x.ymd)}
                  aria-label={`${formatDate(x.ymd, locale)}: ${x.spent > 0 ? t(d.insights.daySpent, { amount: formatCurrency(x.spent) }) : d.insights.nothingSpent}`}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
