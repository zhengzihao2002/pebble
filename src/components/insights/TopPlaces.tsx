'use client';

import { useState } from 'react';
import { ChevronDown, Store } from 'lucide-react';
import type { CategoryMeta, Transaction } from '@/types';
import { formatCurrency, formatDate } from '@/lib/format';
import { descriptionTitle } from '@/lib/transactionDescription';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { renderTemplate } from '@/lib/i18n/RichText';
import { SectionHeader } from '@/components/kit/SectionHeader';
import { SegmentedControl } from '@/components/kit/SegmentedControl';
import { EmptyState } from '@/components/kit/EmptyState';
import { Skeleton } from '@/components/kit/Skeleton';
import { AddTransactionAction } from './AddTransactionAction';
import { ChargeRow } from './ChargeRow';
import { pad, placeKey } from './shared';

const TOP = 5;

/** Same place, however the bank wrote it: case, spacing and a trailing store number ignored.
    Now lives in ./shared; re-exported so existing imports keep working. */
export { placeKey };

type Range = 'month' | 'quarter';

interface TopPlacesProps {
  transactions: Transaction[];
  today: string | null;
  /** For each place's tint (its most-used category's colour). Optional: without it the tint is pine. */
  categoryMeta?: CategoryMeta;
  /** Opens a charge; without it a place's charges are listed but not tappable rows. */
  onOpen?: (txn: Transaction) => void;
}

/**
 * Where the money went, by place. Pebble has no merchant field, so places are
 * grouped from transaction titles - the card says so. Spending only, and
 * scheduled payments are left out (a small note on the card says so).
 *
 * A leaderboard now: a letter avatar tinted by the place's most-used
 * category, how often and the average per visit, its share of day-to-day
 * spending in the period, and a bar in that category's colour. Tap a place
 * to see the charges behind its total, newest first, each opening the
 * transaction. The range switch is the kit SegmentedControl: a radiogroup
 * (role=radio / aria-checked, arrow keys) where it was two aria-pressed
 * buttons - the same two choices with the same meaning.
 */
export function TopPlaces({ transactions, today, categoryMeta = {}, onOpen }: TopPlacesProps) {
  const { d, t, locale } = useTranslation();
  const ux = d.ux.insights;
  const [range, setRange] = useState<Range>('month');
  const [open, setOpen] = useState<string | null>(null);

  const control = (
    <SegmentedControl<Range>
      size="sm" ariaLabel={ux.placesRangeLabel} value={range}
      onChange={(v) => { setRange(v); setOpen(null); }}
      options={[{ value: 'month', label: d.insights.thisMonth }, { value: 'quarter', label: d.insights.last3 }]}
    />
  );
  const header = (
    <SectionHeader
      id="pb-places-title" icon={Store} title={d.insights.placesTitle}
      subtitle={<>{d.insights.placesHint}<span className="pb-ins-sep" aria-hidden="true">·</span>{d.insights.placesNoScheduled}</>}
      actions={control}
    />
  );

  if (!today) {
    return (
      <section className="card pb-ins-card pb-ins-places" aria-labelledby="pb-places-title" aria-busy="true" style={{ minHeight: 260 }}>
        {header}
        <div className="pb-ins-skel-rows" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((n) => (
            <div key={n} className="pb-ins-skel-row">
              <Skeleton width={34} height={34} radius="50%" />
              <div style={{ flex: 1, display: 'grid', gap: 6 }}>
                <Skeleton width={`${62 - n * 8}%`} height="0.8rem" />
                <Skeleton width="40%" height="0.65rem" />
              </div>
              <Skeleton width="4rem" height="0.8rem" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  const ty = Number(today.slice(0, 4));
  const tm = Number(today.slice(5, 7)) - 1;
  const td = Number(today.slice(8, 10));
  const startDate = range === 'month' ? new Date(ty, tm, 1) : new Date(ty, tm - 3, td);
  const start = `${startDate.getFullYear()}-${pad(startDate.getMonth() + 1)}-${pad(startDate.getDate())}`;

  const groups = new Map<string, { key: string; total: number; count: number; names: Map<string, number>; cats: Map<string, number>; items: Transaction[] }>();
  let dayToDayTotal = 0;
  for (const x of transactions) {
    if (x.type !== 'expense' || x.amount >= 0 || x.date < start || x.date > today) continue;
    // Scheduled payments (rent, bills) would top the list every month.
    if (x.recurringRuleId) continue;
    const title = descriptionTitle(x.description).trim();
    const key = placeKey(title);
    if (!key) continue;
    dayToDayTotal += Math.abs(x.amount);
    const g = groups.get(key) ?? { key, total: 0, count: 0, names: new Map<string, number>(), cats: new Map<string, number>(), items: [] };
    g.total += Math.abs(x.amount);
    g.count += 1;
    g.names.set(title, (g.names.get(title) ?? 0) + 1);
    g.cats.set(x.category, (g.cats.get(x.category) ?? 0) + 1);
    g.items.push(x);
    groups.set(key, g);
  }
  const top = [...groups.values()]
    .map((g) => ({
      ...g,
      name: [...g.names.entries()].sort((a, b) => b[1] - a[1])[0][0],
      category: [...g.cats.entries()].sort((a, b) => b[1] - a[1])[0][0],
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, TOP);
  const max = top[0]?.total ?? 0;

  return (
    <section className="card pb-ins-card pb-ins-places" aria-labelledby="pb-places-title">
      {header}
      {top.length === 0 ? (
        <div className="pb-ins-fill-empty">
          <EmptyState
            compact icon={Store} title={d.insights.noPlaces} body={range === 'quarter' ? ux.placesNoneQuarter : ux.placesNone}
            action={<AddTransactionAction />}
          />
        </div>
      ) : (
        <ol className="pb-ins-places-list">
          {top.map((p, i) => {
            const color = categoryMeta[p.category]?.color ?? 'var(--pine)';
            const isOpen = open === p.key;
            const share = dayToDayTotal > 0 ? Math.round((p.total / dayToDayTotal) * 100) : 0;
            const panelId = `pb-place-${i}`;
            const initial = Array.from(p.name.trim())[0]?.toUpperCase() ?? '?';
            return (
              <li key={p.key} className={`pb-ins-place${i === 0 ? ' is-first' : ''}${isOpen ? ' is-open' : ''}`} style={{ ['--pb-ins-cat' as string]: color }}>
                <button type="button" className="pb-ins-place-btn" aria-expanded={isOpen} aria-controls={isOpen ? panelId : undefined} onClick={() => setOpen(isOpen ? null : p.key)}>
                  <span className="pb-ins-place-rank pb-tnum" aria-hidden="true">{i + 1}</span>
                  <span className="pb-ins-avatar" aria-hidden="true">{initial}</span>
                  <span className="pb-ins-place-main">
                    {/* Titles are USER DATA and render as stored. */}
                    <span className="pb-ins-place-name">{p.name}</span>
                    <span className="pb-ins-place-meta">
                      <span className="pb-ins-meta-bit">
                        <span className="pb-tnum">{p.count === 1 ? d.insights.once : t(d.insights.times, { count: p.count })}</span>
                        {p.count > 1 && (
                          <><span className="pb-ins-sep" aria-hidden="true">·</span>{renderTemplate(ux.placesAvg, { amount: <span className="font-mono-tab">{formatCurrency(p.total / p.count)}</span> })}</>
                        )}
                      </span>
                      <span className="pb-ins-meta-bit pb-tnum">{t(ux.placesShare, { pct: `${share}%` })}</span>
                    </span>
                    <span className="pb-ins-place-track pb-chart-fade" aria-hidden="true">
                      <span style={{ width: `${max > 0 ? (p.total / max) * 100 : 0}%` }} />
                    </span>
                  </span>
                  <span className="pb-ins-place-total font-mono-tab">{formatCurrency(p.total)}</span>
                  <ChevronDown size={16} aria-hidden="true" className="pb-ins-place-chev" />
                </button>
                {isOpen && (
                  <div id={panelId} className="pb-ins-place-panel goal-step">
                    <p className="pb-ins-mini-head">{t(ux.placesCharges, { name: p.name })}</p>
                    <ul className="pb-ins-charges">
                      {[...p.items].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).map((x) => (
                        <li key={x.id}>
                          {onOpen ? (
                            <ChargeRow txn={x} categoryMeta={categoryMeta} sub={formatDate(x.date, locale)} onOpen={onOpen} />
                          ) : (
                            <span className="pb-ins-charge is-static">
                              <span className="pb-ins-charge-text"><span className="pb-ins-charge-sub">{formatDate(x.date, locale)}</span></span>
                              <span className="font-mono-tab pb-ins-charge-amt is-out">{formatCurrency(x.amount)}</span>
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
