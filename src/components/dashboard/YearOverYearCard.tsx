'use client';

import { RollingAmount } from '@/components/shared/RollingAmount';
import { ArrowDownRight, ArrowUpRight, Percent, Wallet } from 'lucide-react';
import type { CategoryMeta } from '@/types';
import { SectionHeader } from '@/components/kit/SectionHeader';
import { DeltaChip } from '@/components/kit/DeltaChip';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { renderTemplate } from '@/lib/i18n/RichText';
import { describeRange, type RangeStats } from '@/lib/periodCompare';
import type { YearOverYear } from '@/lib/yearOverYear';
import { useDelta } from './DashboardStatsCard';
import { CategoryTile } from './CategoryTile';

interface YearOverYearCardProps {
  data: YearOverYear;
  categoryMeta: CategoryMeta;
  /** Zone-aware today, for naming the earlier window. */
  today: Date;
  /** The selected period is unfinished: its side reads "so far" and the earlier window was cut to match. */
  inProgress: boolean;
}

type Metric = 'income' | 'spending' | 'savingsRate' | 'saved';

/**
 * The Dashboard's selected period beside the same window a year earlier:
 * the four period figures, each with a change chip, and the three categories
 * whose spending moved most.
 *
 * Rendered by DashboardClient only when there is something to compare (see
 * compareYearOverYear), so it never shows as an empty card. Income is Standard
 * Income only, as everywhere else on the Dashboard - the figures come from the
 * same statsInRange the period tiles use.
 */
export function YearOverYearCard({ data, categoryMeta, today, inProgress }: YearOverYearCardProps) {
  const { d, t, locale } = useTranslation();
  const ux = d.ux.dashboard;
  const deltaFor = useDelta();
  const earlier = describeRange(data.previousRange, locale, today);

  const figure = (metric: Metric, r: RangeStats) => (metric === 'savingsRate' ? `${r.savingsRate.toFixed(2)}%` : formatCurrency(r[metric]));
  const cells: { metric: Metric; icon: typeof Wallet; color: string; label: string }[] = [
    { metric: 'income', icon: ArrowUpRight, color: 'var(--pine)', label: d.dashboard.income },
    { metric: 'spending', icon: ArrowDownRight, color: 'var(--wine)', label: d.dashboard.spending },
    { metric: 'savingsRate', icon: Percent, color: 'var(--gold)', label: d.dashboard.savingsRate },
    { metric: 'saved', icon: Wallet, color: 'var(--pine)', label: d.dashboard.saved },
  ];

  // Both bars of a mover share one scale across the three, so their lengths compare.
  const scale = Math.max(1, ...data.movers.flatMap((m) => [m.current, m.previous]));

  return (
    <section className="card pb-dash-card pb-dash-yoy" aria-labelledby="pb-dash-yoy-title">
      <SectionHeader id="pb-dash-yoy-title" title={ux.yoyTitle} subtitle={<span className="pb-tnum">{t(ux.yoySub, { range: earlier })}</span>} />
      <div className="pb-dash-yoy-body">
        <dl className="pb-dash-yoy-figs">
          {cells.map((c) => {
            const Icon = c.icon;
            const delta = deltaFor(c.metric, data.current, data.previous, earlier);
            const isRate = c.metric === 'savingsRate';
            return (
              <div key={c.metric} className="pb-dash-yoy-fig">
                <dt className="pb-dash-yoy-label">
                  <span style={{ color: c.color, display: 'inline-flex' }} aria-hidden="true"><Icon size={14} /></span>
                  <span>{c.label}</span>
                </dt>
                <dd className="pb-dash-yoy-now">
                  <span className="pb-dash-yoy-period">{inProgress ? ux.compareNow : ux.compareNowDone}</span>
                  <span className={isRate ? 'pb-tnum' : 'font-mono-tab'}>{figure(c.metric, data.current)}</span>
                </dd>
                <dd className="pb-dash-yoy-was">
                  <span className="pb-dash-yoy-period">{ux.yoyLastYear}</span>
                  <span className={isRate ? 'pb-tnum' : 'font-mono-tab'}>{figure(c.metric, data.previous)}</span>
                </dd>
                <dd className="pb-dash-yoy-chip">
                  {delta ? <DeltaChip delta={delta.delta} text={delta.text} good={delta.good} money={delta.money} label={delta.label} /> : ' '}
                </dd>
              </div>
            );
          })}
        </dl>
        {data.movers.length > 0 && (
          <div className="pb-dash-yoy-movers">
            <h4 className="pb-dash-yoy-movers-title">{ux.yoyMoversTitle}</h4>
            <ul className="pb-dash-rows pb-dash-yoy-list">
              {data.movers.map((m) => {
                const color = categoryMeta[m.category]?.color ?? 'var(--pine)';
                const sign = m.change > 0 ? '+' : '−';
                return (
                  <li key={m.category} className="pb-dash-yoy-mover">
                    <CategoryTile category={m.category} categoryMeta={categoryMeta} />
                    <span className="pb-dash-yoy-mover-main">
                      {/* Category names are USER DATA. */}
                      <span className="pb-dash-row-title">{m.category}</span>
                      <span className="pb-dash-row-sub">
                        {renderTemplate(ux.yoyLastYearAmount, { amount: <span className="font-mono-tab"><RollingAmount value={formatCurrency(m.previous)} /></span> })}
                      </span>
                      {/* Two thin bars on one scale: now over last year. The
                          figures beside them say the same, so the colour is
                          only identity. */}
                      <span className="pb-dash-yoy-bars pb-chart-fill" aria-hidden="true">
                        <i style={{ width: `${(m.current / scale) * 100}%`, backgroundColor: color }} />
                        <i className="is-was" style={{ width: `${(m.previous / scale) * 100}%` }} />
                      </span>
                    </span>
                    <span className="pb-dash-yoy-mover-fig">
                      <span className="pb-dash-row-amount font-mono-tab"><RollingAmount value={formatCurrency(m.current)} /></span>
                      <DeltaChip
                        delta={m.change} good="down" money
                        text={`${sign}${formatCurrency(Math.abs(m.change))}`}
                        label={m.change > 0 ? ux.yoyMoverUp : ux.yoyMoverDown}
                      />
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
