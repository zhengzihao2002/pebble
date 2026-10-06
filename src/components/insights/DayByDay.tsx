'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { CategoryMeta, Transaction } from '@/types';
import { formatCurrency, formatDate, formatMonthYear } from '@/lib/format';
import { descriptionTitle } from '@/lib/transactionDescription';
import { categoryLabel } from '@/lib/i18n/enumLabels';
import { useTranslation } from '@/lib/i18n/useTranslation';

const pad = (n: number) => String(n).padStart(2, '0');
/** Pine at these strengths, Less to More. */
const SHADES = [16, 34, 54, 76, 100];

interface DayByDayProps {
  transactions: Transaction[];
  categoryMeta: CategoryMeta;
  /** Zone-aware 'YYYY-MM-DD', or null for the first frame. */
  today: string | null;
  onOpen: (txn: Transaction) => void;
}

/**
 * A month calendar of spending. Each day is shaded by how much was spent,
 * relative to the month's busiest day (square root, so one big day does not
 * flatten every other one); days with nothing spent are hollow; future days
 * are faded. Spending only - income does not shade a day. Tap a day for its
 * transactions. Amounts appear only in text, so privacy mode can blur them.
 */
export function DayByDay({ transactions, categoryMeta, today, onOpen }: DayByDayProps) {
  const { d, t, locale } = useTranslation();
  const [offset, setOffset] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);

  const earliest = useMemo(
    () => transactions.reduce<string | null>((m, x) => (m === null || x.date < m ? x.date : m), null),
    [transactions],
  );

  if (!today) return <section className="card" style={{ padding: '1.25rem 1.5rem', minHeight: 360 }} aria-busy="true" />;

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
  byDay.forEach((v, k) => {
    total += v.spent;
    if (v.spent > max) { max = v.spent; busiest = k; }
  });
  const level = (v: number) => (v <= 0 || max <= 0 ? 0 : Math.max(1, Math.min(5, Math.ceil(Math.sqrt(v / max) * 5))));

  const tag = locale === 'zh' ? 'zh-CN' : 'en-US';
  const weekStart = locale === 'zh' ? 1 : 0;
  const lead = (new Date(y, m, 1).getDay() - weekStart + 7) % 7;
  // 1 January 2023 was a Sunday.
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Date(2023, 0, 1 + ((weekStart + i) % 7)).toLocaleDateString(tag, { weekday: 'narrow' }));

  const go = (delta: number) => { setOffset((o) => Math.min(maxOffset, Math.max(0, o + delta))); setPicked(null); };
  const pickedDay = picked ? byDay.get(picked) : undefined;

  const navBtn: React.CSSProperties = { width: 32, height: 32, borderRadius: '50%', border: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' };

  return (
    <section className="card" style={{ padding: '1.25rem 1.5rem' }} aria-labelledby="pb-daybyday-title">
      <h3 id="pb-daybyday-title" style={{ fontWeight: 600, fontSize: '0.95rem', margin: 0 }}>{d.insights.dayTitle}</h3>
      <p style={{ margin: '0.2rem 0 0.9rem', fontSize: '0.78rem', color: 'var(--ink-soft)' }}>{d.insights.dayHint}</p>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.4rem' }}>
        <button type="button" className="icon-btn" onClick={() => go(1)} disabled={offset >= maxOffset} aria-label={d.insights.prevMonth} style={{ ...navBtn, opacity: offset >= maxOffset ? 0.35 : 1 }}>
          <ChevronLeft size={16} />
        </button>
        <span style={{ fontWeight: 600, fontSize: '0.92rem' }}>{formatMonthYear(y, m, locale)}</span>
        <button type="button" className="icon-btn" onClick={() => go(-1)} disabled={offset <= 0} aria-label={d.insights.nextMonth} style={{ ...navBtn, opacity: offset <= 0 ? 0.35 : 1 }}>
          <ChevronRight size={16} />
        </button>
      </div>
      <p style={{ margin: '0 0 0.8rem', textAlign: 'center', fontSize: '0.78rem', color: 'var(--ink-soft)' }}>
        <span className="font-mono-tab">{t(d.insights.monthTotal, { amount: formatCurrency(total) })}</span>
        {busiest && (
          <>{' · '}<span className="font-mono-tab">{t(d.insights.busiest, { date: formatDate(busiest, locale), amount: formatCurrency(max) })}</span></>
        )}
      </p>

      <div style={{ maxWidth: 460, margin: '0 auto' }}>
        <div aria-hidden="true" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4, marginBottom: 4 }}>
          {weekdays.map((w, i) => (
            <span key={i} style={{ textAlign: 'center', fontSize: '0.68rem', color: 'var(--ink-soft)' }}>{w}</span>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4 }}>
          {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} />)}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1;
            const ymd = `${prefix}${pad(day)}`;
            const future = ymd > today;
            const spent = byDay.get(ymd)?.spent ?? 0;
            const lvl = future ? 0 : level(spent);
            const isPicked = picked === ymd;
            return (
              <button
                key={ymd} type="button" disabled={future}
                onClick={() => setPicked(isPicked ? null : ymd)}
                aria-pressed={isPicked}
                aria-label={`${formatDate(ymd, locale)}: ${spent > 0 ? t(d.insights.daySpent, { amount: formatCurrency(spent) }) : d.insights.nothingSpent}`}
                style={{
                  aspectRatio: '1 / 1', borderRadius: 8, padding: 4, fontSize: '0.7rem',
                  display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start', cursor: future ? 'default' : 'pointer',
                  border: lvl === 0 && !future ? '1px dashed var(--line)' : '1px solid transparent',
                  backgroundColor: lvl > 0 ? `color-mix(in srgb, var(--pine) ${SHADES[lvl - 1]}%, transparent)` : 'transparent',
                  color: lvl >= 4 ? 'var(--paper)' : 'var(--ink-soft)',
                  opacity: future ? 0.35 : 1,
                  outline: ymd === today ? '2px solid var(--ink)' : isPicked ? '2px solid var(--gold)' : 'none',
                  outlineOffset: 1,
                }}
              >
                {day}
              </button>
            );
          })}
        </div>

        <div aria-hidden="true" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.6rem', marginTop: '0.8rem', fontSize: '0.72rem', color: 'var(--ink-soft)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {d.insights.less}
            {SHADES.map((s) => (
              <span key={s} style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: `color-mix(in srgb, var(--pine) ${s}%, transparent)` }} />
            ))}
            {d.insights.more}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, border: '1px dashed var(--line)' }} />
            {d.insights.nothingSpent}
          </span>
        </div>
      </div>

      {picked && (
        <div className="goal-step" style={{ marginTop: '1rem', borderTop: '1px solid var(--line)', paddingTop: '0.8rem' }}>
          <p style={{ margin: '0 0 0.4rem', fontSize: '0.84rem', fontWeight: 600 }}>{formatDate(picked, locale)}</p>
          {!pickedDay ? (
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--ink-soft)' }}>{d.insights.dayNothing}</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {[...pickedDay.items].sort((a, b) => a.amount - b.amount).map((x) => {
                const meta = categoryMeta[x.category];
                const Icon = meta?.icon;
                return (
                  <li key={x.id}>
                    <button
                      type="button" onClick={() => onOpen(x)}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 0', background: 'none', border: 'none', borderTop: '1px solid var(--line)', cursor: 'pointer', textAlign: 'left', color: 'var(--ink)' }}
                    >
                      <span aria-hidden="true" style={{ width: 16, display: 'inline-flex', flexShrink: 0, color: meta ? meta.color : 'var(--ink-soft)' }}>{Icon && <Icon size={15} />}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        {/* Description and category are USER DATA. */}
                        <span style={{ display: 'block', fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{descriptionTitle(x.description) || categoryLabel(d, x.category)}</span>
                        <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--ink-soft)' }}>{categoryLabel(d, x.category)}</span>
                      </span>
                      <span className="font-mono-tab" style={{ fontSize: '0.85rem', fontWeight: 600 }}>{formatCurrency(x.amount)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
