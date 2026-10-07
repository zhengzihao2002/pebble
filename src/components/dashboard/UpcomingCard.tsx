'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, ChevronRight, CreditCard } from 'lucide-react';
import type { CategoryMeta, ExpenseTransaction, RecurringRule, Transaction } from '@/types';
import type { Account } from '@/lib/data/mappers';
import { cardStatuses, reminderLevel } from '@/lib/creditCards';
import { PayOffDialog } from '@/components/accounts/PayOffDialog';
import { computeUpcoming } from '@/lib/analysis/upcoming';
import { todayInZone } from '@/lib/recurring/occurrences';
import { resolveBrowserTimeZone } from '@/lib/time/timeZone';
import { useTimeZoneOverride } from '@/lib/time/TimeZoneOverrideContext';
import { formatCurrency, formatDate } from '@/lib/format';
import { descriptionTitle } from '@/lib/transactionDescription';
import { categoryLabel } from '@/lib/i18n/enumLabels';
import { useTranslation } from '@/lib/i18n/useTranslation';

const WINDOW_DAYS = 14;
const MAX_ROWS = 6;

/** 'YYYY-MM-DD' plus n days, in local calendar terms. */
function addDaysYmd(ymd: string, n: number): string {
  const dt = new Date(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)) + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

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
 * stored figures, never a projected balance.
 *
 * "Today" is resolved in an effect from the stored zone override or the
 * browser's zone, exactly as DashboardClient does: the server runs on UTC.
 * Until then the card keeps its height so nothing below it moves.
 */
export function UpcomingCard({ rules, categoryMeta, accounts = [], transactions = [] }: UpcomingCardProps) {
  const { d, t, locale } = useTranslation();
  const timeZoneOverride = useTimeZoneOverride();
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => {
    setToday(todayInZone(timeZoneOverride ?? resolveBrowserTimeZone()));
  }, [timeZoneOverride]);
  // The card being paid off from a reminder row.
  const [payOff, setPayOff] = useState<Account | null>(null);

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

  const shown = items.slice(0, MAX_ROWS);
  const extra = items.length - shown.length;

  // Credit card payments due within 7 days, or missed - pinned above scheduled items.
  const cardRows = today ? cardStatuses(accounts, transactions, today).filter((s) => reminderLevel(s) !== null) : [];
  const chargesOf = (id: string) => transactions.filter((x): x is ExpenseTransaction => x.type === 'expense' && x.accountId === id);

  return (
    <section className="card" style={{ padding: '1.25rem 1.5rem' }} aria-labelledby="pb-upcoming-title">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.9rem' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
          <h3 id="pb-upcoming-title" style={{ fontWeight: 600, fontSize: '0.95rem', margin: 0 }}>{d.upcomingCard.title}</h3>
          <span style={{ fontSize: '0.75rem', color: 'var(--ink-soft)' }}>{d.upcomingCard.window}</span>
        </div>
        <Link
          href="/scheduled" prefetch={false}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: '0.8rem', fontWeight: 500, color: 'var(--pine)', textDecoration: 'none' }}
        >
          {d.upcomingCard.seeAll}
          <ChevronRight size={14} aria-hidden="true" />
        </Link>
      </div>

      {today === null ? (
        <div style={{ minHeight: 120 }} />
      ) : shown.length === 0 && cardRows.length === 0 ? (
        <p style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', margin: 0, padding: '0.5rem 0' }}>{d.upcomingCard.empty}</p>
      ) : (
        <>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
            {cardRows.map((s, i) => {
              const lvl = reminderLevel(s);
              const overdue = lvl === 'overdue';
              const tone = overdue ? 'var(--wine)' : lvl === 'd1' ? 'var(--gold)' : 'var(--ink-soft)';
              return (
                <li key={`card-${s.card.id}`} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0', borderTop: i === 0 ? 'none' : '1px solid var(--line)' }}>
                  <span aria-hidden="true" style={{ width: 32, height: 32, borderRadius: '0.6rem', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: overdue ? 'color-mix(in srgb, var(--wine) 14%, transparent)' : 'color-mix(in srgb, var(--ink) 8%, transparent)' }}>
                    <CreditCard size={15} style={{ color: overdue ? 'var(--wine)' : 'var(--ink-soft)' }} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    {/* Card names are USER DATA. */}
                    <span style={{ display: 'block', fontSize: '0.87rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.card.name}{s.card.last4 ? ` ····${s.card.last4}` : ''}
                    </span>
                    <span style={{ display: 'block', fontSize: '0.75rem', color: tone, fontWeight: lvl === 'd7' ? 400 : 600 }}>
                      {overdue ? t(d.upcomingCard.cardOverdue, { date: formatDate(s.previous, locale) }) : `${dayLabel(s.next)} · ${d.upcomingCard.cardPayment}`}
                    </span>
                  </span>
                  <span className="font-mono-tab" style={{ fontSize: '0.87rem', fontWeight: 600, whiteSpace: 'nowrap' }}>{formatCurrency(s.dueNow)}</span>
                  <button type="button" className="pill" onClick={() => setPayOff(s.card)} style={{ padding: '0.3rem 0.7rem', fontSize: '0.75rem', flexShrink: 0 }}>
                    {d.accounts.payOffAction}
                  </button>
                </li>
              );
            })}
            {shown.map((it, i) => {
              const meta = categoryMeta[it.category];
              const Icon = meta ? meta.icon : CalendarClock;
              const isIncome = it.kind === 'income';
              return (
                <li
                  key={`${it.ruleId}-${it.date}`}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0', borderTop: i === 0 && cardRows.length === 0 ? 'none' : '1px solid var(--line)' }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 32, height: 32, borderRadius: '0.6rem', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      backgroundColor: meta ? `${meta.color}20` : 'var(--pine-soft)',
                    }}
                  >
                    <Icon size={15} style={{ color: meta ? meta.color : 'var(--pine)' }} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    {/* Description and category are USER DATA; only the two
                        income literals get a translated label. */}
                    <span style={{ display: 'block', fontSize: '0.87rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {descriptionTitle(it.description) || categoryLabel(d, it.category)}
                    </span>
                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--ink-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {dayLabel(it.date)} · {categoryLabel(d, it.category)}
                    </span>
                  </span>
                  <span className="font-mono-tab" style={{ fontSize: '0.87rem', fontWeight: 600, whiteSpace: 'nowrap', color: isIncome ? 'var(--pine)' : 'var(--ink)' }}>
                    {isIncome ? '+' : ''}{formatCurrency(it.amount)}
                  </span>
                </li>
              );
            })}
          </ul>
          {extra > 0 && (
            <p style={{ fontSize: '0.78rem', color: 'var(--ink-soft)', margin: '0.5rem 0 0' }}>{t(d.upcomingCard.more, { count: extra })}</p>
          )}
        </>
      )}
      {payOff && (
        <PayOffDialog card={payOff} allAccounts={accounts} charges={chargesOf(payOff.id)} onClose={() => setPayOff(null)} />
      )}
    </section>
  );
}
