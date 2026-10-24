'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDate, formatMonthYear, parseLocalDate } from '@/lib/format';
import { addDays, daysInMonth } from '@/lib/recurring/occurrences';
import { INTL_LOCALE } from '@/lib/i18n/locale';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { SectionHeader } from '@/components/kit/SectionHeader';
import { Skeleton } from '@/components/kit/Skeleton';
import type { UpcomingOccurrence } from '@/types';
import { compactMoney } from './schedulePlan';

const OPEN_KEY = 'pebble-scheduled-calendar';
const MAX_DOTS = 3;

interface ScheduleCalendarProps {
  upcoming: UpcomingOccurrence[];
  previewDays: number;
  today: string | null;
  /** A day with something due was picked: the timeline jumps to it. */
  onPick: (date: string) => void;
}

/**
 * The preview window as month grids. Each day carries one fixed-size dot per
 * item (pine in, wine out - by kind, not by size, so the grid itself gives no
 * amounts away; '+n' past three), today is ringed and days outside the
 * window are faded. Where a month is wide enough the day's net shows in the
 * cell, as a font-mono-tab figure that privacy mode blurs. A day with items is
 * a button that jumps the timeline to that day.
 *
 * Every month of the window sits side by side when the card is wide; on a
 * narrow card one month shows at a time with Previous / Next (never a swipe
 * or a sideways scroll), and the whole calendar folds away behind its header
 * - a choice remembered on this device only.
 */
export function ScheduleCalendar({ upcoming, previewDays, today, onPick }: ScheduleCalendarProps) {
  const { d, t, locale } = useTranslation();
  const x = d.ux.scheduled;
  // The stored fold, read after hydration (the server snapshot is 'open');
  // a toggle in this visit wins over it.
  const stored = useSyncExternalStore(noSubscribe, readFold, () => 'open');
  const [choice, setChoice] = useState<boolean | null>(null);
  const open = choice ?? stored !== 'closed';
  const [page, setPage] = useState(0);
  const toggle = () => {
    const next = !open;
    setChoice(next);
    try { localStorage.setItem(OPEN_KEY, next ? 'open' : 'closed'); } catch { /* not remembered */ }
  };

  // Weeks start on Sunday in English and Monday in Chinese, as each reader's
  // calendar does (the same choice as the Accounts flow calendar).
  const weekStart = locale === 'zh' ? 1 : 0;
  const weekdays = useMemo(() => Array.from({ length: 7 }, (_, k) => {
    const dt = new Date(2026, 0, 4 + ((k + weekStart) % 7)); // 4 Jan 2026 is a Sunday
    return dt.toLocaleDateString(INTL_LOCALE[locale], { weekday: 'narrow' });
  }), [locale, weekStart]);

  const byDay = useMemo(() => {
    const m = new Map<string, UpcomingOccurrence[]>();
    for (const it of upcoming) m.set(it.date, [...(m.get(it.date) ?? []), it]);
    return m;
  }, [upcoming]);

  const horizon = today ? addDays(today, previewDays) : null;
  const months = useMemo(() => {
    if (!today || !horizon) return [];
    const out: { y: number; m: number }[] = [];
    let y = Number(today.slice(0, 4));
    let m = Number(today.slice(5, 7));
    const endKey = horizon.slice(0, 7);
    for (;;) {
      out.push({ y, m });
      if (`${y}-${String(m).padStart(2, '0')}` >= endKey || out.length > 4) break;
      m += 1;
      if (m > 12) { m = 1; y += 1; }
    }
    return out;
  }, [today, horizon]);
  const p = Math.min(page, Math.max(0, months.length - 1));

  const header = (
    <SectionHeader
      id="pb-sched-cal-title"
      icon={CalendarDays}
      title={x.calendar}
      subtitle={x.calendarSub}
      actions={(
        <button
          type="button" className="icon-btn pb-sched-cal-fold" onClick={toggle}
          aria-expanded={open} aria-controls="pb-sched-cal-body"
          aria-label={open ? x.hideCalendar : x.showCalendar}
        >
          <ChevronDown size={16} aria-hidden="true" />
        </button>
      )}
    />
  );

  return (
    <section className={`card pb-sched-card pb-sched-cal${open ? '' : ' is-closed'}`} aria-labelledby="pb-sched-cal-title">
      {header}
      <div id="pb-sched-cal-body" className="pb-sched-cal-body">
        {!today ? (
          <Skeleton height={260} radius="0.9rem" />
        ) : (
          <>
            <div className="pb-sched-cal-pager">
              <button type="button" className="icon-btn" onClick={() => setPage(Math.max(0, p - 1))} disabled={p === 0} aria-label={x.prevMonth}>
                <ChevronLeft size={16} aria-hidden="true" />
              </button>
              <span>{months[p] ? formatMonthYear(months[p].y, months[p].m - 1, locale) : ''}</span>
              <button type="button" className="icon-btn" onClick={() => setPage(Math.min(months.length - 1, p + 1))} disabled={p >= months.length - 1} aria-label={x.nextMonth}>
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </div>
            <div className="pb-sched-months" style={{ ['--pb-months' as string]: months.length }}>
              {months.map(({ y, m }, mi) => {
                const first = `${y}-${String(m).padStart(2, '0')}-01`;
                const lead = (parseLocalDate(first).getDay() - weekStart + 7) % 7;
                const count = daysInMonth(y, m);
                const label = formatMonthYear(y, m - 1, locale);
                return (
                  <div key={first} className={`pb-sched-month${mi === p ? ' is-page' : ''}`} role="group" aria-label={label}>
                    <p className="pb-sched-month-name" aria-hidden="true">{label}</p>
                    <div className="pb-sched-month-grid">
                      {weekdays.map((wd, k) => <span key={`wd${k}`} className="pb-sched-wd" aria-hidden="true">{wd}</span>)}
                      {Array.from({ length: lead }, (_, k) => <span key={`b${k}`} aria-hidden="true" />)}
                      {Array.from({ length: count }, (_, k) => {
                        const ymd = `${y}-${String(m).padStart(2, '0')}-${String(k + 1).padStart(2, '0')}`;
                        const items = byDay.get(ymd) ?? [];
                        const inRange = ymd >= today && ymd <= (horizon ?? ymd);
                        const net = items.reduce((s, it) => s + it.amount, 0);
                        const cls = `pb-sched-day${ymd === today ? ' is-today' : ''}${inRange ? '' : ' is-out-of-range'}${items.length ? ' has-items' : ''}`;
                        const body = (
                          <>
                            <span className="pb-sched-day-n pb-tnum">{k + 1}</span>
                            <span className="pb-sched-day-dots" aria-hidden="true">
                              {items.slice(0, MAX_DOTS).map((it, i) => <i key={i} className={it.kind === 'income' ? 'is-in' : 'is-out'} />)}
                              {items.length > MAX_DOTS && <b className="pb-tnum">+{items.length - MAX_DOTS}</b>}
                            </span>
                            {items.length > 0 && (
                              <span className="font-mono-tab pb-sched-day-net" aria-hidden="true" style={{ color: net > 0 ? 'var(--pine)' : undefined }}>
                                {compactMoney(net)}
                              </span>
                            )}
                          </>
                        );
                        if (items.length === 0) return <span key={ymd} className={cls} aria-hidden="true">{body}</span>;
                        const date = formatDate(ymd, locale);
                        return (
                          <button
                            key={ymd} type="button" className={cls} onClick={() => onPick(ymd)}
                            aria-label={items.length === 1 ? t(x.calDayOne, { date }) : t(x.calDay, { date, count: items.length })}
                          >
                            {body}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="pb-sched-cal-legend" aria-hidden="true">
              <span><i className="is-in" />{x.legendIn}</span>
              <span><i className="is-out" />{x.legendOut}</span>
              <span><i className="is-today" />{d.upcomingCard.today}</span>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function readFold(): string {
  try { return localStorage.getItem(OPEN_KEY) ?? 'open'; } catch { return 'open'; }
}

function noSubscribe(): () => void {
  return () => {};
}
