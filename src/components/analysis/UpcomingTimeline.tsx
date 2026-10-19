'use client';

import { useState } from 'react';
import { CalendarClock } from 'lucide-react';
import type { CategoryMeta } from '@/types';
import { formatCurrency, parseLocalDate } from '@/lib/format';
import { categoryLabel } from '@/lib/i18n/enumLabels';
import { INTL_LOCALE } from '@/lib/i18n/locale';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { parseDescription } from '@/lib/transactionDescription';
import type { UpcomingMonth, UpcomingItem } from '@/lib/analysis/upcoming';

const MAX_ROWS = 6;

/**
 * Coming up as a timeline: one block per month (side by side on a wide card,
 * stacked with headers that stick under the period bar on a phone). Each
 * month header carries its totals and a small in / out proportion bar; each
 * row a date tile with the weekday, the category's icon chip, the title with
 * any note on a softer second line, and the amount (income pine, with +).
 *
 * Every item is still listed: past six in a month, the rest open in place
 * with "Show N more". The description is no longer one run-together line -
 * title and note come from parseDescription, the same split every other list
 * uses. As on the Dashboard, no running or projected balance is shown.
 */
export function UpcomingTimeline({ months, categoryMeta }: { months: UpcomingMonth[]; categoryMeta: CategoryMeta }) {
  const { d, t, locale } = useTranslation();
  const x = d.ux.analysis;
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const row = (it: UpcomingItem, i: number) => {
    const meta = categoryMeta[it.category];
    const Icon = meta?.icon ?? CalendarClock;
    const color = meta?.color ?? 'var(--pine)';
    const dt = parseLocalDate(it.date);
    const { title, description } = parseDescription(it.description);
    const income = it.kind !== 'expense';
    return (
      <li key={`${it.ruleId}-${it.date}-${i}`} className="pb-ana-up-row">
        <span className="pb-ana-up-date" aria-label={dt.toLocaleDateString(INTL_LOCALE[locale], { weekday: 'long', month: 'long', day: 'numeric' })}>
          <span aria-hidden="true">{dt.toLocaleDateString(INTL_LOCALE[locale], { weekday: 'short' })}</span>
          <span className="pb-tnum" aria-hidden="true">{it.date.slice(8, 10)}</span>
        </span>
        <span className="pb-ana-ico" aria-hidden="true" style={{ backgroundColor: `color-mix(in srgb, ${color} 13%, transparent)`, color }}>
          <Icon size={15} />
        </span>
        {/* it.description is USER DATA and renders as stored (title + note). */}
        <span className="pb-ana-up-text">
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title || categoryLabel(d, it.category)}</span>
          <span className="pb-ana-up-note" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {description || categoryLabel(d, it.category)}
          </span>
        </span>
        <span className="font-mono-tab pb-ana-up-amt" style={{ color: income ? 'var(--pine)' : 'var(--ink)' }}>
          {income ? '+' : '−'}{formatCurrency(Math.abs(it.amount))}
        </span>
      </li>
    );
  };

  return (
    <div className="pb-ana-up">
      {months.map((m) => {
        const first = m.items.slice(0, MAX_ROWS);
        const rest = m.items.slice(MAX_ROWS);
        const expanded = !!open[m.key];
        const flow = m.expenseTotal + m.incomeTotal;
        return (
          <div key={m.key} className="pb-ana-up-month">
            <div className="pb-ana-up-head">
              <span className="pb-ana-up-label">{m.label}</span>
              <span className="font-mono-tab pb-ana-up-tot" aria-label={t(x.monthTotals, { label: m.label })}>
                {m.expenseTotal > 0 && `−${formatCurrency(m.expenseTotal)}`}
                {m.expenseTotal > 0 && m.incomeTotal > 0 && ' · '}
                {m.incomeTotal > 0 && <span style={{ color: 'var(--pine)' }}>+{formatCurrency(m.incomeTotal)}</span>}
              </span>
              {flow > 0 && (
                <span className="pb-ana-split pb-chart-fill" aria-hidden="true">
                  {m.expenseTotal > 0 && <span className="is-out" style={{ flexGrow: m.expenseTotal }} />}
                  {m.incomeTotal > 0 && <span className="is-in" style={{ flexGrow: m.incomeTotal }} />}
                </span>
              )}
            </div>
            <ul className="pb-ana-up-rows">{first.map(row)}</ul>
            {rest.length > 0 && (
              <>
                <div className={`collapsible-rows${expanded ? ' expanded' : ''}`}>
                  <div className="collapsible-rows-inner" inert={!expanded}>
                    <ul className="pb-ana-up-rows">{rest.map((it, i) => row(it, i + MAX_ROWS))}</ul>
                  </div>
                </div>
                <button
                  type="button" className="link-btn pb-ana-more" aria-expanded={expanded}
                  onClick={() => setOpen((o) => ({ ...o, [m.key]: !expanded }))}
                >
                  {expanded ? x.showLess : t(x.showMore, { count: rest.length })}
                </button>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
