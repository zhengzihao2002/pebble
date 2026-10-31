'use client';

import { RollingAmount } from '@/components/shared/RollingAmount';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarCheck, CalendarClock, ChevronRight, CreditCard } from 'lucide-react';
import type { CategoryMeta, ExpenseTransaction, RecurringRule, Transaction } from '@/types';
import type { Account } from '@/lib/data/mappers';
import { cardStatuses, reminderLevel, type CardStatus } from '@/lib/creditCards';
import { PayOffDialog } from '@/components/accounts/PayOffDialog';
import { computeUpcoming, type UpcomingItem } from '@/lib/analysis/upcoming';
import { todayInZone } from '@/lib/recurring/occurrences';
import { resolveBrowserTimeZone } from '@/lib/time/timeZone';
import { useTimeZoneOverride } from '@/lib/time/TimeZoneOverrideContext';
import { formatCurrency, formatDate, parseLocalDate } from '@/lib/format';
import { descriptionTitle } from '@/lib/transactionDescription';
import { categoryLabel } from '@/lib/i18n/enumLabels';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { renderTemplate } from '@/lib/i18n/RichText';
import { INTL_LOCALE } from '@/lib/i18n/locale';
import { SectionHeader } from '@/components/kit/SectionHeader';
import { EmptyState } from '@/components/kit/EmptyState';
import { InfoTooltip } from '@/components/shared/InfoTooltip';
import { RowsSkeleton } from './DashSkeletons';
import { addDaysYmd, dayHeading, groupByDay } from './dayGroups';

const WINDOW_DAYS = 14;
const MAX_ROWS = 6;

interface UpcomingCardProps {
  rules: RecurringRule[];
  categoryMeta: CategoryMeta;
  /** For credit card payment reminders. */
  accounts?: Account[];
  transactions?: Transaction[];
}

/**
 * The next 14 days of scheduled payments, from the same computeUpcoming() the
 * Scheduled and Analysis pages use - projected dates only, after what catch-up
 * has already recorded, so nothing is counted twice. Amounts are the rules'
 * stored figures, never a projected balance (the footer's totals are those
 * same stored figures, summed, and say so).
 *
 * "Today" is resolved in an effect from the stored zone override or the
 * browser's zone, exactly as DashboardClient does: the server runs on UTC.
 * Until then the card keeps its height so nothing below it moves.
 *
 * A 14-day rail shows how payments spread over the fortnight (dots by kind,
 * not by size, so the rail gives nothing away in privacy mode); tapping a day
 * narrows the agenda to it. The agenda is grouped by day. Card reminders stay
 * pinned first as their own group.
 */
export function UpcomingCard({ rules, categoryMeta, accounts = [], transactions = [] }: UpcomingCardProps) {
  const { d, t, locale } = useTranslation();
  const ux = d.ux.dashboard;
  const timeZoneOverride = useTimeZoneOverride();
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => {
    setToday(todayInZone(timeZoneOverride ?? resolveBrowserTimeZone()));
  }, [timeZoneOverride]);
  // The card being paid off from a reminder row.
  const [payOff, setPayOff] = useState<Account | null>(null);
  // The rail day the agenda is narrowed to, if any.
  const [day, setDay] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const items = useMemo(() => {
    if (!today) return [];
    const last = addDaysYmd(today, WINDOW_DAYS - 1);
    return computeUpcoming(rules, today, 1, locale)
      .months.flatMap((m) => m.items)
      .filter((it) => it.date <= last);
  }, [rules, today, locale]);

  const tomorrow = today ? addDaysYmd(today, 1) : null;
  const dayLabel = (ymd: string) =>
    ymd === today ? d.upcomingCard.today : ymd === tomorrow ? d.upcomingCard.tomorrow : formatDate(ymd, locale);

  // Credit card payments due within 7 days, or missed - pinned above scheduled items.
  const cardRows = today ? cardStatuses(accounts, transactions, today).filter((s) => reminderLevel(s) !== null) : [];
  const chargesOf = (id: string) => transactions.filter((x): x is ExpenseTransaction => x.type === 'expense' && x.accountId === id);

  // The rail: one cell per day, today first.
  const days = today ? Array.from({ length: WINDOW_DAYS }, (_, i) => addDaysYmd(today, i)) : [];
  const byDay = new Map<string, UpcomingItem[]>();
  for (const it of items) byDay.set(it.date, [...(byDay.get(it.date) ?? []), it]);
  // A missed payment is due now, so it sits on today.
  const cardDay = (s: CardStatus) => (reminderLevel(s) === 'overdue' ? today ?? s.next : s.next);

  const filtered = day ? items.filter((it) => it.date === day) : items;
  const cardsShown = day ? cardRows.filter((s) => cardDay(s) === day) : cardRows;
  const shown = day ? filtered : filtered.slice(0, MAX_ROWS);
  const rest = day ? [] : filtered.slice(MAX_ROWS);
  const extra = rest.length;

  const incomeTotal = items.filter((it) => it.kind === 'income').reduce((s, it) => s + it.amount, 0);
  const expenseTotal = items.filter((it) => it.kind !== 'income').reduce((s, it) => s + Math.abs(it.amount), 0);

  const heading = (ymd: string) =>
    dayHeading(ymd, locale, today ?? ymd, ymd === today ? d.upcomingCard.today : ymd === tomorrow ? d.upcomingCard.tomorrow : undefined);

  const itemRow = (it: UpcomingItem) => {
    const meta = categoryMeta[it.category];
    const Icon = meta ? meta.icon : CalendarClock;
    const isIncome = it.kind === 'income';
    return (
      <li key={`${it.ruleId}-${it.date}`} className="pb-dash-up-row">
        <span
          aria-hidden="true" className="pb-dash-tile-icon"
          style={{ backgroundColor: meta ? `${meta.color}20` : 'var(--pine-soft)' }}
        >
          <Icon size={16} style={{ color: meta ? meta.color : 'var(--pine)' }} />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          {/* Description and category are USER DATA; only the two
              income literals get a translated label. */}
          <span className="pb-dash-row-title">
            {descriptionTitle(it.description) || categoryLabel(d, it.category)}
          </span>
          <span className="pb-dash-row-sub">
            {categoryLabel(d, it.category)}
          </span>
        </span>
        <span className="font-mono-tab pb-dash-row-amount" style={{ color: isIncome ? 'var(--pine)' : 'var(--ink)' }}>
          {isIncome ? '+' : ''}<RollingAmount value={formatCurrency(it.amount)} />
        </span>
      </li>
    );
  };

  // Groups by day; `continues` drops the header when the day carries on from
  // the rows above (the expanded part of a capped list). The header's net
  // therefore counts the whole day from `filtered`, not just this slice, or a
  // day straddling the cap would leave its expanded rows out of every total.
  const netOf = (date: string) => filtered.reduce((s, it) => (it.date === date ? s + it.amount : s), 0);
  const groups = (list: UpcomingItem[], continues?: string) => groupByDay(list, (it) => it.date).map((g) => {
    const net = netOf(g.date);
    return (
      <div key={g.date} className="pb-dash-day">
        {g.date !== continues && (
          <div className="pb-dash-day-head">
            <span>{heading(g.date)}</span>
            <span className="font-mono-tab" style={{ color: net > 0 ? 'var(--pine)' : undefined }}>{net > 0 ? '+' : ''}<RollingAmount value={formatCurrency(net)} /></span>
          </div>
        )}
        <ul className="pb-dash-rows">{g.items.map(itemRow)}</ul>
      </div>
    );
  });

  return (
    <section className="card pb-dash-card pb-dash-upcoming" aria-labelledby="pb-upcoming-title">
      <SectionHeader
        id="pb-upcoming-title"
        title={d.upcomingCard.title}
        subtitle={d.upcomingCard.window}
        actions={(
          <Link href="/scheduled" prefetch={false} className="link-btn">
            {d.upcomingCard.seeAll}
            <ChevronRight size={14} aria-hidden="true" />
          </Link>
        )}
      />

      {today === null ? (
        <RowsSkeleton rows={3} minHeight={120} />
      ) : items.length === 0 && cardRows.length === 0 ? (
        <EmptyState compact icon={CalendarCheck} title={d.upcomingCard.empty} />
      ) : (
        <>
          <div className="pb-dash-rail" role="group" aria-label={ux.railLabel}>
            {days.map((ymd) => {
              const its = byDay.get(ymd) ?? [];
              const cards = cardRows.filter((s) => cardDay(s) === ymd);
              const count = its.length + cards.length;
              const dt = parseLocalDate(ymd);
              const weekday = dt.toLocaleDateString(INTL_LOCALE[locale], { weekday: 'narrow' });
              const weekend = dt.getDay() === 0 || dt.getDay() === 6;
              const dateText = formatDate(ymd, locale);
              const label = count === 0 ? t(ux.railDayNone, { date: dateText }) : count === 1 ? t(ux.railDayOne, { date: dateText }) : t(ux.railDay, { date: dateText, count });
              return (
                <button
                  key={ymd} type="button"
                  className={`pb-dash-rail-day${ymd === today ? ' is-today' : ''}${weekend ? ' is-weekend' : ''}${day === ymd ? ' is-on' : ''}`}
                  aria-pressed={day === ymd} aria-label={label} disabled={count === 0}
                  onClick={() => setDay((cur) => (cur === ymd ? null : ymd))}
                >
                  <span className="pb-dash-rail-wd" aria-hidden="true">{weekday}</span>
                  <span className="pb-dash-rail-n pb-tnum" aria-hidden="true">{dt.getDate()}</span>
                  <span className="pb-dash-rail-dots" aria-hidden="true">
                    {its.some((it) => it.kind === 'income') && <i className="is-in" />}
                    {its.some((it) => it.kind !== 'income') && <i className="is-out" />}
                    {cards.some((s) => reminderLevel(s) === 'overdue') ? <i className="is-overdue" /> : cards.length > 0 && <i className="is-card" />}
                  </span>
                </button>
              );
            })}
          </div>

          {day && (
            <div className="pb-dash-filter">
              <span>{heading(day)}</span>
              <button type="button" className="link-btn" onClick={() => setDay(null)}>{ux.showAllDays}</button>
            </div>
          )}

          {/* One block, so the day groups sit at their own spacing rather
              than the card's wider gap between sections. */}
          <div className="pb-dash-agenda">
            {cardsShown.length > 0 && (
              <div className="pb-dash-day">
                <div className="pb-dash-day-head"><span>{ux.cardPayments}</span></div>
                <ul className="pb-dash-rows">
                  {cardsShown.map((s) => {
                    const lvl = reminderLevel(s);
                    const overdue = lvl === 'overdue';
                    const tone = overdue ? 'var(--wine)' : lvl === 'd1' ? 'var(--gold)' : 'var(--ink-soft)';
                    return (
                      <li key={`card-${s.card.id}`} className="pb-dash-up-row is-card">
                        <span aria-hidden="true" className="pb-dash-tile-icon" style={{ backgroundColor: overdue ? 'color-mix(in srgb, var(--wine) 14%, transparent)' : 'color-mix(in srgb, var(--ink) 8%, transparent)' }}>
                          <CreditCard size={16} style={{ color: overdue ? 'var(--wine)' : 'var(--ink-soft)' }} />
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          {/* Card names are USER DATA. */}
                          <span className="pb-dash-row-title">
                            {s.card.name}{s.card.last4 ? ` ····${s.card.last4}` : ''}
                          </span>
                          <span className="pb-dash-row-sub" style={{ color: tone, fontWeight: lvl === 'd7' ? 400 : 600 }}>
                            {/* The group header already says "Card payments", so the
                                due day stands alone (it was cut off on phones). */}
                            {overdue ? t(d.upcomingCard.cardOverdue, { date: formatDate(s.previous, locale) }) : dayLabel(s.next)}
                          </span>
                        </span>
                        <span className="font-mono-tab pb-dash-row-amount"><RollingAmount value={formatCurrency(s.dueNow)} /></span>
                        <button type="button" className="pill pb-dash-payoff" onClick={() => setPayOff(s.card)}>
                          {d.accounts.payOffAction}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {day && shown.length === 0 && cardsShown.length === 0 && (
              <p className="pb-dash-quiet">{ux.nothingThatDay}</p>
            )}
            {groups(shown)}
            {extra > 0 && (
              // The rest of the fortnight expands in place; inert while
              // collapsed so its rows are not in the tab order.
              <div className={`collapsible-rows${expanded ? ' expanded' : ''}`}>
                <div className="collapsible-rows-inner" inert={!expanded}>
                  {groups(rest, shown[shown.length - 1]?.date)}
                </div>
              </div>
            )}
          </div>
          {extra > 0 && (
            <>
              <button type="button" className="link-btn pb-dash-more" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
                {expanded ? ux.showLess : t(d.upcomingCard.more, { count: extra })}
              </button>
            </>
          )}

          {items.length > 0 && (
            <p className="pb-dash-up-foot">
              <span>
                {renderTemplate(ux.upcomingTotals, {
                  income: <span className="font-mono-tab" style={{ color: 'var(--pine)' }}>+<RollingAmount value={formatCurrency(incomeTotal)} /></span>,
                  expense: <span className="font-mono-tab"><RollingAmount value={formatCurrency(-expenseTotal)} /></span>,
                })}
              </span>
              <InfoTooltip label={ux.upcomingTotalsNote}>{ux.upcomingTotalsNote}</InfoTooltip>
            </p>
          )}
        </>
      )}
      {payOff && (
        <PayOffDialog card={payOff} allAccounts={accounts} charges={chargesOf(payOff.id)} onClose={() => setPayOff(null)} />
      )}
    </section>
  );
}
