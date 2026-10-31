'use client';

import type { ReactNode } from 'react';
import { ArrowDownLeft, ArrowUpRight, Banknote, BarChart3, EyeOff } from 'lucide-react';
import type { CategoryMeta, Transaction } from '@/types';
import { formatCurrency, splitCents } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { categoryLabel } from '@/lib/i18n/enumLabels';
import { descriptionTitle } from '@/lib/transactionDescription';
import { DeltaChip } from '@/components/kit/DeltaChip';
import { RollingAmount } from '@/components/shared/RollingAmount';

export interface ShareSlice {
  /** Stored category name, or '__other__'. */
  key: string;
  value: number;
  /** 0..1 */
  share: number;
}

export interface ReportDelta {
  /** Signed change, money. */
  delta: number;
  /** "12%" or "$320.00", unsigned. */
  text: string;
  money: boolean;
  good: 'up' | 'down';
  /** "September", "Sep 1 – 16". */
  period: string;
}

interface ReportSummaryProps {
  eyebrow: string;
  /** Which figure the hero is: money out, money in, or the net of both. */
  kind: 'spent' | 'received' | 'net' | 'none';
  total: number;
  accent: string;
  count: number;
  inSum: number;
  outSum: number;
  mixed: boolean;
  delta: ReportDelta | null;
  shares: ShareSlice[];
  /** The side the share bar describes, for its label. */
  shareSide: 'in' | 'out';
  isolated: string | null;
  onIsolate: (cat: string) => void;
  dailyAverage: number | null;
  largest: Transaction | null;
  topCategory: { key: string; value: number } | null;
  categoryMeta: CategoryMeta;
  onOpenDetail: (t: Transaction) => void;
  /** The timeline chart, when there is one. */
  timeline: ReactNode;
  showChartToggle: boolean;
  chartHidden: boolean;
  onToggleChart: () => void;
}

const pct = (v: number) => (v > 0 && v < 0.01 ? '<1%' : `${Math.round(v * 100)}%`);

/**
 * The answer first: what this report adds up to.
 *
 * The figure is the same grand total and accent rule the results line always
 * used, now labelled for what it is - Spent, Received, or Net when both types
 * show (it was called "total" while being a signed net). With both types,
 * money in and money out are spelled out beside it with a split bar, arrows
 * naming each side so colour is never the only signal. A delta compares with
 * the previous comparable period (to date when this one is in progress).
 *
 * The category share bar's legend isolates a category through the same
 * setter the Categories filter uses; tapping it again brings all back.
 * Every figure is font-mono-tab / pb-money (blurred in privacy mode) and the
 * bars sit in pb-chart-fill.
 */
export function ReportSummary(p: ReportSummaryProps) {
  const { d, t } = useTranslation();
  const x = d.ux.reports;
  const r = d.reports;
  const label = p.kind === 'spent' ? x.spent : p.kind === 'received' ? x.received : x.net;
  const text = formatCurrency(p.kind === 'net' || p.kind === 'none' ? p.total : Math.abs(p.total));
  const { whole, cents } = splitCents(text);
  const flowMax = p.inSum + p.outSum;
  const color = (k: string) => (k === '__other__' ? 'var(--ink-faint)' : p.categoryMeta[k]?.color ?? 'var(--pine)');
  const name = (k: string) => (k === '__other__' ? x.other : categoryLabel(d, k));
  const deltaWords = p.delta
    ? (Math.round(p.delta.delta * 100) === 0
      ? t(x.vsSame, { period: p.delta.period })
      : t(p.delta.delta > 0 ? x.vsMore : x.vsLess, { value: p.delta.text, period: p.delta.period }))
    : '';

  return (
    <section className="card pb-rep-hero pb-rise" aria-label={`${label}, ${p.eyebrow}`}>
      <div className="pb-rep-hero-main">
        <p className="pb-rep-eyebrow">{p.eyebrow}</p>
        <div className="pb-rep-figure-row">
          <span className="pb-rep-figure-label">{label}</span>
          <p className="pb-rep-figure font-display pb-money" style={{ color: p.accent }}>
            <RollingAmount value={whole + cents} fractionClassName="pb-rep-cents" />
          </p>
        </div>
        <div className="pb-rep-subline">
          <span className="pb-tnum">{t(p.count === 1 ? r.transactionsOne : r.transactionsOther, { count: p.count })}</span>
          {p.delta && (
            <>
              <DeltaChip
                delta={p.delta.delta} good={p.delta.good} money={p.delta.money}
                text={p.delta.text} label={p.delta.money ? undefined : deltaWords}
              />
              {/* Words beside the chip; the amount (money deltas) stays inside
                  the blurred chip, so the sentence names only the period. */}
              <span className="pb-rep-delta-words">
                {p.delta.money
                  ? (Math.round(p.delta.delta * 100) === 0 ? t(x.vsSame, { period: p.delta.period }) : t(x.vsPeriod, { period: p.delta.period }))
                  : deltaWords}
              </span>
            </>
          )}
        </div>

        {p.mixed && (
          <div className="pb-rep-flow">
            <div className="pb-rep-flow-figs">
              <div className="pb-rep-flow-fig is-in">
                <span className="pb-rep-flow-name"><ArrowDownLeft size={14} aria-hidden="true" />{x.moneyIn}</span>
                <span className="font-mono-tab"><RollingAmount value={formatCurrency(p.inSum)} /></span>
              </div>
              <div className="pb-rep-flow-fig is-out">
                <span className="pb-rep-flow-name"><ArrowUpRight size={14} aria-hidden="true" />{x.moneyOut}</span>
                <span className="font-mono-tab"><RollingAmount value={formatCurrency(p.outSum)} /></span>
              </div>
              <div className="pb-rep-flow-fig">
                <span className="pb-rep-flow-name">{x.net}</span>
                <span className="font-mono-tab" style={{ color: p.accent }}><RollingAmount value={`${p.total > 0 ? '+' : ''}${formatCurrency(p.total)}`} /></span>
              </div>
            </div>
            {flowMax > 0 && (
              <div className="pb-rep-split pb-chart-fill" role="img" aria-label={x.inOutSplit}>
                {p.inSum > 0 && <span className="is-in" style={{ flexGrow: p.inSum }} />}
                {p.outSum > 0 && <span className="is-out" style={{ flexGrow: p.outSum }} />}
              </div>
            )}
          </div>
        )}

        <dl className="pb-rep-stats">
          {p.dailyAverage !== null && (
            <div className="pb-rep-stat">
              <dt>{x.dailyAverage}</dt>
              <dd className="font-mono-tab"><RollingAmount value={formatCurrency(p.dailyAverage)} /></dd>
            </div>
          )}
          {p.largest && (
            <div className="pb-rep-stat">
              <dt>{x.largest}</dt>
              <dd>
                <button type="button" className="pb-rep-stat-btn" onClick={() => p.onOpenDetail(p.largest!)}>
                  <span className="font-mono-tab"><RollingAmount value={formatCurrency(Math.abs(p.largest.amount))} /></span>
                  <span className="pb-rep-stat-sub">{descriptionTitle(p.largest.description)}</span>
                </button>
              </dd>
            </div>
          )}
          {p.topCategory && (
            <div className="pb-rep-stat">
              <dt>{x.topCategory}</dt>
              <dd>
                <span className="pb-rep-stat-cat">
                  <span className="pb-rep-dot" style={{ background: color(p.topCategory.key) }} aria-hidden="true" />
                  <span className="pb-rep-stat-sub is-strong">{name(p.topCategory.key)}</span>
                </span>
                <span className="font-mono-tab pb-rep-stat-small"><RollingAmount value={formatCurrency(p.topCategory.value)} /></span>
              </dd>
            </div>
          )}
        </dl>
      </div>

      <div className="pb-rep-hero-side">
        {p.shares.length > 0 && (
          <div className="pb-rep-share">
            <p className="pb-rep-mini-title">{x.categoryShare} · {p.shareSide === 'in' ? x.moneyIn : x.moneyOut}</p>
            <div className="pb-rep-sharebar pb-chart-fill" aria-hidden="true">
              {p.shares.map((s) => (
                <span
                  key={s.key}
                  className={p.isolated && p.isolated !== s.key ? 'is-dim' : undefined}
                  style={{ flexGrow: s.value, background: color(s.key) }}
                />
              ))}
            </div>
            <ul className="pb-rep-legend">
              {p.shares.map((s) => {
                const on = p.isolated === s.key;
                const Icon = p.categoryMeta[s.key]?.icon ?? Banknote;
                const content = (
                  <>
                    <span className="pb-rep-dot" style={{ background: color(s.key) }} aria-hidden="true" />
                    <span className="pb-rep-legend-name">{name(s.key)}</span>
                    <span className="pb-tnum pb-rep-legend-pct">{pct(s.share)}</span>
                  </>
                );
                return (
                  <li key={s.key}>
                    {s.key === '__other__' ? (
                      <span className="pb-rep-legend-key is-static">{content}</span>
                    ) : (
                      <button
                        type="button"
                        className={`pb-rep-legend-key${on ? ' is-on' : ''}${p.isolated && !on ? ' is-dim' : ''}`}
                        aria-pressed={on}
                        aria-label={on ? x.showAllCategories : t(x.isolateCategory, { category: name(s.key) })}
                        onClick={() => p.onIsolate(s.key)}
                      >
                        {on && <Icon size={12} aria-hidden="true" />}
                        {content}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {p.showChartToggle && (
          <div className="pb-rep-chart-head">
            <p className="pb-rep-mini-title">{x.timeline}</p>
            <button type="button" className="pb-rep-link" onClick={p.onToggleChart} aria-expanded={!p.chartHidden}>
              {p.chartHidden ? <BarChart3 size={14} aria-hidden="true" /> : <EyeOff size={14} aria-hidden="true" />}
              {p.chartHidden ? x.showChart : x.hideChart}
            </button>
          </div>
        )}
        {!p.chartHidden && p.timeline}
      </div>
    </section>
  );
}
