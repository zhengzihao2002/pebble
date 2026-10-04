'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, ChevronRight } from 'lucide-react';
import type { CategoryMeta, RecurringRule } from '@/types';
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
export function UpcomingCard({ rules, categoryMeta }: UpcomingCardProps) {
  const { d, t, locale } = useTranslation();
  const timeZoneOverride = useTimeZoneOverride();
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => {
    setToday(todayInZone(timeZoneOverride ?? resolveBrowserTimeZone()));
  }, [timeZoneOverride]);

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
      ) : shown.length === 0 ? (
        <p style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', margin: 0, padding: '0.5rem 0' }}>{d.upcomingCard.empty}</p>
      ) : (
        <>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
            {shown.map((it, i) => {
              const meta = categoryMeta[it.category];
              const Icon = meta ? meta.icon : CalendarClock;
              const isIncome = it.kind === 'income';
              return (
                <li
                  key={`${it.ruleId}-${it.date}`}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0', borderTop: i === 0 ? 'none' : '1px solid var(--line)' }}
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
    </section>
  );
}
