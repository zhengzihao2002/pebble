'use client';

import { RollingAmount, RollingMoneyText } from '@/components/shared/RollingAmount';
import { PiggyBank, TrendingDown } from 'lucide-react';
import type { Transaction } from '@/types';
import { isSideCash } from '@/lib/stats';
import { formatCurrency, formatMonthYear } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { ProgressRing } from '@/components/kit/ProgressRing';
import { Sparkline } from '@/components/kit/Sparkline';
import { Skeleton } from '@/components/kit/Skeleton';
import { SectionHeader } from '@/components/kit/SectionHeader';
import { EmptyState } from '@/components/kit/EmptyState';
import { AddTransactionAction } from './AddTransactionAction';

/** The hero's shape while today resolves, so nothing below moves when it lands. */
function HeroSkeleton() {
  return (
    <section className="card pb-ins-card pb-ins-hero" aria-busy="true">
      <div className="pb-ins-hero-skel" aria-hidden="true">
        <Skeleton width={88} height={88} radius="50%" />
        <div style={{ flex: 1, display: 'grid', gap: 10 }}>
          <Skeleton width="42%" height="0.75rem" />
          <Skeleton width="30%" height="2.2rem" />
          <Skeleton width="80%" height="0.9rem" />
          <Skeleton width="100%" height="0.6rem" radius="99px" />
        </div>
      </div>
    </section>
  );
}

/**
 * The hero's stand-in when its figure cannot be worked out: the same card
 * slot, saying why and what to do - so a new account has the same page as a
 * loaded one and nothing below jumps when the figure first appears.
 */
function HeroNeeds({ reason }: { reason: 'none' | 'month' | 'income' }) {
  const { d } = useTranslation();
  const ux = d.ux.insights;
  const text = { none: [ux.heroNeedsDataTitle, ux.heroNeedsDataBody], month: [ux.heroNeedsMonthTitle, ux.heroNeedsMonthBody], income: [ux.heroNeedsIncomeTitle, ux.heroNeedsIncomeBody] }[reason];
  return (
    <section className="card pb-ins-card pb-ins-hero-needs" aria-labelledby="pb-ins-hero-label">
      <SectionHeader id="pb-ins-hero-label" icon={PiggyBank} title={ux.heroNeedsHeader} subtitle={ux.heroNeedsHint} />
      <div className="pb-ins-fill-empty">
        <EmptyState compact icon={PiggyBank} title={text[0]} body={text[1]} action={<AddTransactionAction primary />} />
      </div>
    </section>
  );
}

const MAX_MONTHS = 12;
const wholeDollars = (v: number) => formatCurrency(Math.round(v)).replace(/\.00$/, '');
const monthIndex = (ymd: string) => Number(ymd.slice(0, 4)) * 12 + Number(ymd.slice(5, 7)) - 1;

/**
 * The page's headline: how much of your income you kept over the last
 * complete months (up to 12), with the range spelled out. Complete months
 * only, so the figure does not swing day to day early in a month - which is
 * why it can differ from the Dashboard's "last 12 months", which includes the
 * current month. Same rules as the Dashboard otherwise: income excludes side
 * cash, spending is every negative amount; transfers never reach this list.
 * The first month counts only if the history starts on the 1st. With no
 * complete month or no income the card stays and says what it needs (HeroNeeds). Figure and sentence blur in privacy mode.
 *
 * Redesigned as the page's hero: a ring filled to the share kept (a full
 * wine ring when spending ran over), the income split into spent and kept
 * with the three totals, and what was kept in each of those months. All
 * from the same loop over the same months; the ring, bar and line wear
 * pb-chart-fade and the totals font-mono-tab, so privacy blurs everything.
 * While today resolves it holds its place with a skeleton (it used to
 * render nothing, and every card below jumped down when it appeared).
 */
export function SavingsHeadline({ transactions, today }: { transactions: Transaction[]; today: string | null }) {
  const { d, t, locale } = useTranslation();
  const ux = d.ux.insights;
  if (!today) return <HeroSkeleton />;
  if (transactions.length === 0) return <HeroNeeds reason="none" />;

  const earliest = transactions.reduce((m, x) => (x.date < m ? x.date : m), transactions[0].date);
  const firstComplete = monthIndex(earliest) + (earliest.endsWith('-01') ? 0 : 1);
  const last = monthIndex(today) - 1;
  const first = Math.max(firstComplete, last - (MAX_MONTHS - 1));
  const months = last - first + 1;
  if (months < 1) return <HeroNeeds reason="month" />;

  let income = 0;
  let spending = 0;
  // The same sums, per month, for the kept-each-month line.
  const monthIn = Array<number>(months).fill(0);
  const monthOut = Array<number>(months).fill(0);
  for (const x of transactions) {
    const k = monthIndex(x.date);
    if (k < first || k > last) continue;
    if (x.amount < 0) { spending += -x.amount; monthOut[k - first] += -x.amount; }
    else if (x.type === 'income' && !isSideCash(x)) { income += x.amount; monthIn[k - first] += x.amount; }
  }
  if (income <= 0) return <HeroNeeds reason="income" />;

  const kept = income - spending;
  const good = kept >= 0;
  const span = months === 1 ? d.insights.savedSpanOne : t(d.insights.savedSpanMany, { months: String(months) });
  const sentence = good
    ? t(d.insights.savedKept, { span, pct: `${Math.round((kept / income) * 100)}%`, amount: wholeDollars(kept / months) })
    : t(d.insights.savedOver, { span, amount: wholeDollars(-kept), perMonth: wholeDollars(-kept / months) });

  const toLabel = formatMonthYear(Math.floor(last / 12), last % 12, locale);
  const range = months === 1 ? toLabel : `${formatMonthYear(Math.floor(first / 12), first % 12, locale)} – ${toLabel}`;
  const label = months === 1 ? d.insights.savedLabelOne : t(d.insights.savedLabelMany, { months: String(months) });
  const figure = good ? `${Math.round((kept / income) * 100)}%` : wholeDollars(kept);
  const tone = good ? 'var(--pine)' : 'var(--wine)';

  // Spent | Kept as shares of what was earned. Overspent: the bar is the
  // spending, with a marker where income ran out and the rest hatched.
  const whole = Math.max(income, spending);
  const spentPct = (Math.min(spending, income) / whole) * 100;
  const restPct = 100 - spentPct;
  const incomePct = (income / whole) * 100;
  const keptSeries = monthIn.map((v, i) => v - monthOut[i]);
  const short = (k: number) => new Date(Math.floor(k / 12), k % 12, 1).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', { month: 'short' });
  const RingIcon = good ? PiggyBank : TrendingDown;

  return (
    <section className="card pb-ins-card pb-ins-hero" data-tone={good ? 'good' : 'over'} style={{ ['--pb-tone' as string]: tone }} aria-labelledby="pb-ins-hero-label">
      <div className="pb-ins-hero-ring pb-chart-fade">
        <ProgressRing value={good ? kept / income : 1} size={88} stroke={8} color={tone}>
          <RingIcon size={26} strokeWidth={1.8} aria-hidden="true" style={{ color: tone }} />
        </ProgressRing>
      </div>
      <div className="pb-ins-hero-head">
        <p id="pb-ins-hero-label" className="pb-ins-hero-label">{label} · <span className="pb-tnum">{range}</span></p>
        <span className="font-display pb-money pb-ins-hero-figure"><RollingMoneyText value={figure} /></span>
      </div>
      <p className="pb-money pb-ins-hero-sentence"><RollingMoneyText value={sentence} /></p>
      <div className="pb-ins-hero-split">
        <div className="pb-ins-split-bar pb-chart-fade" role="img" aria-label={ux.splitLabel}>
          <span className="pb-ins-split-spent" style={{ width: `${spentPct}%` }} />
          <span className={`pb-ins-split-rest${good ? '' : ' is-over'}`} style={{ width: `${restPct}%` }} />
          {!good && <span className="pb-ins-split-mark" style={{ left: `${incomePct}%` }} />}
        </div>
        <dl className="pb-ins-split-legend">
          <div><dt><i className="pb-ins-key is-in" />{ux.incomeLabel}</dt><dd className="font-mono-tab"><RollingAmount value={wholeDollars(income)} /></dd></div>
          <div><dt><i className="pb-ins-key is-out" />{ux.spentLabel}</dt><dd className="font-mono-tab"><RollingAmount value={wholeDollars(spending)} /></dd></div>
          <div><dt><i className={`pb-ins-key ${good ? 'is-kept' : 'is-over'}`} />{good ? ux.keptLabel : ux.overLabel}</dt><dd className="font-mono-tab"><RollingAmount value={wholeDollars(Math.abs(kept))} /></dd></div>
        </dl>
      </div>
      {months >= 2 && (
        <div className="pb-ins-hero-trend">
          <p className="pb-ins-hero-trend-label">{ux.keptByMonth}</p>
          <Sparkline values={keptSeries} height={56} color={tone} baseline={0} />
          <div className="pb-ins-hero-trend-axis pb-tnum" aria-hidden="true">
            <span>{short(first)}</span><span>{short(last)}</span>
          </div>
        </div>
      )}
    </section>
  );
}
