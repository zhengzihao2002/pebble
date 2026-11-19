'use client';
import { usePartnerView } from '@/components/partner/PartnerViewContext';
import { rankTopPlaces, type TopPlacesRange } from '@/lib/topPlaces';
import { useStoredChoice } from '@/components/analysis/useStoredChoice';

import { RollingAmount } from '@/components/shared/RollingAmount';
import { useMemo, useState } from 'react';
import { ChevronDown, LockKeyhole, Store } from 'lucide-react';
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
import { placeKey } from './shared';

/** Same place, however the bank wrote it: case, spacing and a trailing store number ignored.
    Now lives in ./shared; re-exported so existing imports keep working. */
export { placeKey };

type Range = TopPlacesRange;

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
  const partner = usePartnerView();
  const [range, setRange] = useStoredChoice<Range>('pebble-insights-places-range', ['month', 'quarter'], 'month', false);
  const [open, setOpen] = useState<string | null>(null);
  const summary = useMemo(() => {
    if (partner) return partner.data.topPlaces?.[range];
    if (!today) return;
    const charges = transactions.flatMap(txn => txn.type === 'expense' && !txn.recurringRuleId
      ? [{ id: txn.id, date: txn.date, amount: txn.amount, title: descriptionTitle(txn.description), category: txn.category }] : []);
    return rankTopPlaces(charges, today, range);
  }, [partner, range, today, transactions]);
  const rowsById = useMemo(() => new Map(transactions.map(row => [row.id, row])), [transactions]);

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

  const top = summary?.places ?? [];
  const dayToDayTotal = summary?.total ?? 0;
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
            const placeName = p.name ?? d.partner.censored;
            const initial = Array.from(placeName.trim())[0]?.toUpperCase() ?? '?';
            const detailsAvailable = p.itemIds.length > 0;
            return (
              <li key={p.key} className={`pb-ins-place${i === 0 ? ' is-first' : ''}${isOpen ? ' is-open' : ''}`} style={{ ['--pb-ins-cat' as string]: color }}>
                <button type="button" className="pb-ins-place-btn" disabled={!detailsAvailable} aria-expanded={detailsAvailable ? isOpen : undefined} aria-controls={isOpen ? panelId : undefined} onClick={() => setOpen(isOpen ? null : p.key)}>
                  <span className="pb-ins-place-rank pb-tnum" aria-hidden="true">{i + 1}</span>
                  <span className="pb-ins-avatar" aria-hidden="true">{p.name === null ? <LockKeyhole size={15} /> : initial}</span>
                  <span className="pb-ins-place-main">
                    {/* Titles are USER DATA and render as stored. */}
                    <span className="pb-ins-place-name">{placeName}</span>
                    <span className="pb-ins-place-meta">
                      <span className="pb-ins-meta-bit">
                        <span className="pb-tnum"><RollingAmount value={p.count === 1 ? d.insights.once : t(d.insights.times, { count: p.count })} /></span>
                        {p.count > 1 && (
                          <><span className="pb-ins-sep" aria-hidden="true">·</span>{renderTemplate(ux.placesAvg, { amount: <span className="font-mono-tab"><RollingAmount value={formatCurrency(p.total / p.count)} /></span> })}</>
                        )}
                      </span>
                      <span className="pb-ins-meta-bit pb-tnum"><RollingAmount value={t(ux.placesShare, { pct: `${share}%` })} /></span>
                    </span>
                    <span className="pb-ins-place-track pb-chart-fade" aria-hidden="true">
                      <span style={{ width: `${max > 0 ? (p.total / max) * 100 : 0}%` }} />
                    </span>
                  </span>
                  <span className="pb-ins-place-total font-mono-tab"><RollingAmount value={formatCurrency(p.total)} /></span>
                  {detailsAvailable ? <ChevronDown size={16} aria-hidden="true" className="pb-ins-place-chev" />
                    : <LockKeyhole size={16} aria-hidden="true" className="pb-ins-place-chev" />}
                </button>
                {isOpen && detailsAvailable && (
                  <div id={panelId} className="pb-ins-place-panel goal-step">
                    <p className="pb-ins-mini-head">{t(ux.placesCharges, { name: placeName })}</p>
                    <ul className="pb-ins-charges">
                      {p.itemIds.flatMap(id => {
                        const row = rowsById.get(id);
                        return row ? [row] : [];
                      }).sort((a, b) => b.date.localeCompare(a.date)).map((x) => (
                        <li key={x.id}>
                          {onOpen ? (
                            <ChargeRow txn={x} categoryMeta={categoryMeta} sub={formatDate(x.date, locale)} onOpen={onOpen} />
                          ) : (
                            <span className="pb-ins-charge is-static">
                              <span className="pb-ins-charge-text"><span className="pb-ins-charge-sub">{formatDate(x.date, locale)}</span></span>
                              <span className="font-mono-tab pb-ins-charge-amt is-out"><RollingAmount value={formatCurrency(x.amount)} /></span>
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
