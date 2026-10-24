'use client';

import { useEffect, useMemo, useRef } from 'react';
import { ArrowDownRight, ArrowUpRight, Repeat } from 'lucide-react';
import type { RecurringRule, Transaction } from '@/types';
import { usePebbleStore } from '@/store/usePebbleStore';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { renderTemplate } from '@/lib/i18n/RichText';
import { INTL_LOCALE } from '@/lib/i18n/locale';
import { ymdOf } from '@/lib/periodCompare';
import { detectRecurring, type RecurringCandidate } from '@/lib/recurring/detect';

/** Rows shown at once (the detector returns up to five). */
const MAX_ROWS = 3;

interface LooksRecurringNoticeProps {
  transactions: Transaction[];
  rules: RecurringRule[];
  /** Zone-aware today from DashboardClient; null until resolved. */
  today: Date | null;
  onSchedule: (candidate: RecurringCandidate) => void;
}

/**
 * Payments that repeat on a schedule in the history but have no recurring rule
 * (see detectRecurring), for the top notice area. "Schedule it" opens the
 * schedule dialog with the details filled in; "Not recurring" hides the
 * candidate for good. Once a rule covers the place the candidate stops
 * appearing by itself, because the rules prop updates when the dialog saves.
 *
 * Renders nothing - no card, no gap - when there are none, and until `today`
 * resolves (so the server render and first client render agree).
 */
export function LooksRecurringNotice({ transactions, rules, today, onSchedule }: LooksRecurringNoticeProps) {
  const { d, t, locale } = useTranslation();
  const ux = d.ux.dashboard;
  const dismissed = usePebbleStore((s) => s.insightsDismissed);
  const dismiss = usePebbleStore((s) => s.dismissInsight);
  const todayYmd = today ? ymdOf(today) : null;
  // Dismissed candidates go to the detector so they do not use up its cap of five.
  const skip = useMemo(
    () => new Set((dismissed ?? []).filter((id) => id.startsWith('rec:')).map((id) => id.slice(4).replace(':', '|'))),
    [dismissed],
  );
  const found = useMemo(
    () => (todayYmd === null ? [] : detectRecurring(transactions, rules, todayYmd, skip)),
    [transactions, rules, todayYmd, skip],
  );
  const idOf = (c: RecurringCandidate) => `rec:${c.kind}:${c.key}`;
  const rows = found.slice(0, MAX_ROWS);

  // Focus moves to the next row's button when a row is dismissed.
  const root = useRef<HTMLElement>(null);
  const focusAfter = useRef<string | null>(null);
  const shown = rows.map(idOf).join('\n');
  useEffect(() => {
    const id = focusAfter.current;
    if (!id) return;
    focusAfter.current = null;
    root.current?.querySelector<HTMLElement>(`[data-rec-id="${CSS.escape(id)}"] .pb-dash-quiet-btn`)?.focus();
  }, [shown]);

  if (rows.length === 0) return null;

  const onNot = (c: RecurringCandidate) => {
    const i = rows.findIndex((x) => idOf(x) === idOf(c));
    const neighbour = rows[i + 1] ?? rows[i - 1];
    focusAfter.current = neighbour ? idOf(neighbour) : null;
    dismiss(idOf(c));
  };

  const phrase = { weekly: ux.recWeekly, biweekly: ux.recBiweekly, monthly: ux.recMonthly, yearly: ux.recYearly };
  const dateText = (ymd: string) =>
    new Date(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10)).toLocaleDateString(INTL_LOCALE[locale], { month: 'short', day: 'numeric' });

  return (
    <section ref={root} className="card pb-dash-notice pb-dash-recurring" aria-labelledby="pb-dash-rec-title">
      <div className="pb-dash-notice-head">
        <h3 id="pb-dash-rec-title" className="pb-dash-notice-title"><Repeat size={15} aria-hidden="true" />{ux.recTitle}</h3>
        <p className="pb-dash-notice-sub">{ux.recSub}</p>
      </div>
      <ul className="pb-dash-notice-list">
        {rows.map((c) => {
          const income = c.kind === 'income';
          const Icon = income ? ArrowUpRight : ArrowDownRight;
          return (
            <li key={idOf(c)} data-rec-id={idOf(c)} className="pb-dash-notice-row pb-dash-rec">
              {/* The arrow's direction is the kind; the colour only echoes it. */}
              <span className="pb-dash-tile-icon" style={{ backgroundColor: `color-mix(in srgb, var(--${income ? 'pine' : 'wine'}) 13%, transparent)` }}>
                <Icon size={16} style={{ color: income ? 'var(--pine)' : 'var(--wine)' }} aria-hidden="true" />
                <span className="pb-dash-sr">{d.enums.kind[c.kind]}</span>
              </span>
              <div className="pb-dash-notice-main">
                {/* The title is USER DATA. */}
                <p className="pb-dash-rec-title">{c.title}</p>
                <p className="pb-dash-rec-sub">
                  {renderTemplate(phrase[c.frequency], { amount: <span className="font-mono-tab">{formatCurrency(Math.abs(c.amount))}</span> })}
                  <span aria-hidden="true"> · </span>
                  {renderTemplate(ux.recSeen, { count: <span className="pb-tnum">{c.occurrences}</span> })}
                  <span aria-hidden="true"> · </span>
                  {renderTemplate(ux.recNext, { date: <span className="pb-tnum">{dateText(c.nextDate)}</span> })}
                </p>
              </div>
              <div className="pb-dash-notice-actions">
                <button type="button" className="btn-primary pb-dash-rec-go" aria-label={t(ux.recScheduleAria, { name: c.title })} onClick={() => onSchedule(c)}>
                  {ux.recSchedule}
                </button>
                <button type="button" className="pb-dash-quiet-btn" aria-label={t(ux.recNotAria, { name: c.title })} onClick={() => onNot(c)}>
                  {ux.recNot}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
