'use client';

import { ArrowDownRight, ArrowUpRight, CalendarClock, Info } from 'lucide-react';
import { formatCurrency, formatMonthYear } from '@/lib/format';
import { descriptionTitle } from '@/lib/transactionDescription';
import { categoryLabel, paymentMethodLabel } from '@/lib/i18n/enumLabels';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { SectionHeader } from '@/components/kit/SectionHeader';
import { EmptyState } from '@/components/kit/EmptyState';
import { addDaysYmd, dayHeading, groupByDay } from '@/components/dashboard/dayGroups';
import type { UpcomingOccurrence } from '@/types';
import { daysBetween } from './schedulePlan';

/** Rows shown before "Show all"; whole days are kept together. */
const CAP = 12;

interface ScheduleTimelineProps {
  upcoming: UpcomingOccurrence[];
  previewDays: number;
  today: string | null;
  expanded: boolean;
  onToggle: () => void;
}

/** DOM id of a day's group, for the calendar's jump. */
export const dayGroupId = (date: string) => `pb-sched-day-${date}`;

/** How many rows the capped view shows: whole days, at least CAP rows. */
export function cappedCount(upcoming: readonly UpcomingOccurrence[]): number {
  if (upcoming.length <= CAP) return upcoming.length;
  const lastDate = upcoming[CAP - 1].date;
  let n = CAP;
  while (n < upcoming.length && upcoming[n].date === lastDate) n++;
  return n;
}

/**
 * Coming up, grouped: a divider per month carrying that month's in / out,
 * then a header per day ("Today · Mon, Oct 19") that sticks under the glass
 * header while its rows scroll, with the day's net. Each row keeps what the
 * flat list had - title, category · account, amount coloured by kind - the
 * date now being the group it sits in. The server's date order is kept
 * (grouping only folds consecutive dates). Past a dozen rows the rest wait
 * behind "Show all", so the schedules below stay in reach.
 */
export function ScheduleTimeline({ upcoming, previewDays, today, expanded, onToggle }: ScheduleTimelineProps) {
  const { d, t, locale } = useTranslation();
  const x = d.ux.scheduled;
  const limit = cappedCount(upcoming);
  const shown = expanded ? upcoming : upcoming.slice(0, limit);

  const tomorrow = today ? addDaysYmd(today, 1) : null;
  const heading = (ymd: string) => {
    const rel = ymd === today ? d.upcomingCard.today
      : ymd === tomorrow ? d.upcomingCard.tomorrow
      : today && daysBetween(today, ymd) > 1 && daysBetween(today, ymd) < 7 ? t(x.inDays, { count: daysBetween(today, ymd) })
      : undefined;
    return dayHeading(ymd, locale, today ?? ymd, rel);
  };

  // Month blocks over the shown rows; totals count the whole month from the
  // full list, so a capped month still states its true figures.
  const months: { key: string; items: UpcomingOccurrence[] }[] = [];
  for (const it of shown) {
    const key = it.date.slice(0, 7);
    const last = months[months.length - 1];
    if (last && last.key === key) last.items.push(it);
    else months.push({ key, items: [it] });
  }
  const monthTotals = (key: string) => {
    let inc = 0;
    let out = 0;
    for (const it of upcoming) {
      if (it.date.slice(0, 7) !== key) continue;
      if (it.kind === 'income') inc += it.amount; else out += Math.abs(it.amount);
    }
    return { inc, out };
  };

  return (
    <section className="card pb-sched-card pb-sched-timeline" aria-labelledby="pb-sched-up-title">
      <SectionHeader
        id="pb-sched-up-title"
        icon={CalendarClock}
        title={d.scheduled.comingUp}
        subtitle={<span className="pb-tnum">{t(d.scheduled.nextDays, { days: previewDays })}</span>}
      />
      <p className="pb-sched-hint"><Info size={13} aria-hidden="true" />{d.scheduled.upcomingHint}</p>

      {upcoming.length === 0 ? (
        <EmptyState compact icon={CalendarClock} title={t(d.scheduled.nothingDue, { days: previewDays })} />
      ) : (
        <div className="pb-sched-agenda">
          {months.map((m) => {
            const { inc, out } = monthTotals(m.key);
            return (
              <div key={m.key} className="pb-sched-agenda-month">
                <div className="pb-sched-month-divider">
                  <span>{formatMonthYear(Number(m.key.slice(0, 4)), Number(m.key.slice(5, 7)) - 1, locale)}</span>
                  <span className="pb-sched-month-tot">
                    {inc > 0 && <span className="font-mono-tab" style={{ color: 'var(--pine)' }}>+{formatCurrency(inc)}</span>}
                    {out > 0 && <span className="font-mono-tab">{formatCurrency(-out)}</span>}
                  </span>
                </div>
                {groupByDay(m.items, (it) => it.date).map((g) => {
                  const all = upcoming.filter((it) => it.date === g.date);
                  const net = all.reduce((s, it) => s + it.amount, 0);
                  return (
                    <div key={g.date} id={dayGroupId(g.date)} className="pb-sched-day-group">
                      <div className="pb-sched-day-head">
                        <span className="pb-tnum">{heading(g.date)}</span>
                        <span className="font-mono-tab" style={{ color: net > 0 ? 'var(--pine)' : undefined }}>
                          {net > 0 ? '+' : ''}{formatCurrency(net)}
                        </span>
                      </div>
                      <ul className="pb-sched-rows">
                        {g.items.map((item) => {
                          const income = item.kind === 'income';
                          const Icon = income ? ArrowUpRight : ArrowDownRight;
                          return (
                            <li key={`${item.ruleId}-${item.date}`} className="pb-sched-up-row">
                              <span className={`pb-sched-tile ${income ? 'is-in' : 'is-out'}`} aria-hidden="true"><Icon size={16} strokeWidth={2.25} /></span>
                              <span className="pb-sched-up-text">
                                {/* item.description is USER DATA - rendered as stored. */}
                                <span className="pb-sched-row-title">{descriptionTitle(item.description)}</span>
                                <span className="pb-sched-row-sub">
                                  {categoryLabel(d, item.category)} · {paymentMethodLabel(d, item.paymentMethod)}
                                </span>
                              </span>
                              <span className="font-mono-tab pb-sched-row-amt" style={{ color: income ? 'var(--pine)' : 'var(--ink)' }}>
                                {income ? '+' : ''}{formatCurrency(item.amount)}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
            );
          })}
          {upcoming.length > limit && (
            <button type="button" className="link-btn pb-sched-more" aria-expanded={expanded} onClick={onToggle}>
              {expanded ? x.showLess : t(x.showAll, { count: upcoming.length })}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
