'use client';

import { RollingAmount } from '@/components/shared/RollingAmount';
import { ArrowDownRight, ArrowUpRight, CalendarClock } from 'lucide-react';
import { computeCommitments } from '@/lib/analysis/cashflow';
import { formatCurrency, formatDate, splitCents } from '@/lib/format';
import { addDays } from '@/lib/recurring/occurrences';
import { descriptionTitle } from '@/lib/transactionDescription';
import { renderTemplate } from '@/lib/i18n/RichText';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { SectionHeader } from '@/components/kit/SectionHeader';
import { Sparkline } from '@/components/kit/Sparkline';
import { Skeleton } from '@/components/kit/Skeleton';
import { InfoTooltip } from '@/components/shared/InfoTooltip';
import type { RecurringRule, UpcomingOccurrence } from '@/types';
import { cumulativeNet, daysBetween } from './schedulePlan';

interface ScheduleSummaryProps {
  rules: RecurringRule[];
  upcoming: UpcomingOccurrence[];
  previewDays: number;
  /** Zone-aware today, null until mounted. */
  today: string | null;
}

/**
 * The Scheduled page's hero: what the schedules add up to each month (the
 * same normalisation as Analysis' commitments - active, repeating, not yet
 * finished), the next window's totals summed from the very occurrences Coming
 * up lists, the next item due, and a sparkline of the running scheduled net
 * across the window. These are the rules' own amounts, never a projected
 * balance. Money carries font-mono-tab / pb-money and the sparkline wears
 * pb-chart-fade, so privacy mode blurs all of it.
 */
export function ScheduleSummary({ rules, upcoming, previewDays, today }: ScheduleSummaryProps) {
  const { d, t, locale } = useTranslation();
  const x = d.ux.scheduled;
  const { incomeMonthly, expenseMonthly } = computeCommitments(rules);
  const net = incomeMonthly - expenseMonthly;
  const { whole, cents } = splitCents(formatCurrency(net));

  const windowIn = upcoming.reduce((s, it) => (it.kind === 'income' ? s + it.amount : s), 0);
  const windowOut = upcoming.reduce((s, it) => (it.kind === 'income' ? s : s + Math.abs(it.amount)), 0);

  const series = today ? cumulativeNet(upcoming, today, previewDays) : [];
  const end = series.length > 0 ? series[series.length - 1] : 0;
  const horizon = today ? addDays(today, previewDays) : null;

  const next = today ? upcoming.find((it) => it.date >= today) : upcoming[0];
  const rel = (date: string) => {
    if (!today) return formatDate(date, locale);
    const n = daysBetween(today, date);
    return n === 0 ? d.upcomingCard.today : n === 1 ? d.upcomingCard.tomorrow : `${formatDate(date, locale)} · ${t(x.inDays, { count: n })}`;
  };

  return (
    <section className="card pb-sched-hero" aria-labelledby="pb-sched-hero-title">
      <SectionHeader
        id="pb-sched-hero-title"
        title={(
          <span className="pb-sched-hero-title">
            {x.heroTitle}
            <InfoTooltip label={x.aboutHero}>{x.heroNote}</InfoTooltip>
          </span>
        )}
        subtitle={(
          <span>
            {renderTemplate(x.windowTotals, {
              days: <span className="pb-tnum">{previewDays}</span>,
              in: <span className="font-mono-tab" style={{ color: 'var(--pine)' }}>+<RollingAmount value={formatCurrency(windowIn)} /></span>,
              out: <span className="font-mono-tab" style={{ color: 'var(--wine)' }}><RollingAmount value={formatCurrency(-windowOut)} /></span>,
            })}
          </span>
        )}
      />

      <div className="pb-sched-hero-top">
        <div className="pb-sched-hero-main">
          <p className="pb-sched-hero-label">{x.perMonthNet}</p>
          {/* formatCurrency stays en-US in every locale: real dollars. */}
          <p className="font-display pb-money pb-sched-hero-num">
            <RollingAmount value={`${net > 0 ? '+' : ''}${whole}${cents}`} fractionClassName="pb-hero-cents" />
          </p>
          <dl className="pb-sched-hero-split">
            <div className="pb-sched-hero-cell">
              <dt><span className="pb-sched-kind-dot is-in" aria-hidden="true"><ArrowUpRight size={11} strokeWidth={2.6} /></span>{x.perMonthIn}</dt>
              <dd className="font-mono-tab" style={{ color: 'var(--pine)' }}>+<RollingAmount value={formatCurrency(incomeMonthly)} /></dd>
            </div>
            <div className="pb-sched-hero-cell">
              <dt><span className="pb-sched-kind-dot is-out" aria-hidden="true"><ArrowDownRight size={11} strokeWidth={2.6} /></span>{x.perMonthOut}</dt>
              <dd className="font-mono-tab" style={{ color: 'var(--wine)' }}><RollingAmount value={formatCurrency(-expenseMonthly)} /></dd>
            </div>
          </dl>
        </div>

        <div className="pb-sched-hero-trend">
          <div className="pb-sched-hero-trend-head">
            <span>{horizon ? t(x.netBy, { date: formatDate(horizon, locale) }) : ' '}</span>
            {today && (
              <span className="font-mono-tab" style={{ color: end > 0 ? 'var(--pine)' : end < 0 ? 'var(--wine)' : 'var(--ink)' }}>
                {end > 0 ? '+' : ''}<RollingAmount value={formatCurrency(end)} />
              </span>
            )}
          </div>
          {today ? (
            <Sparkline
              values={series} height={64} baseline={0} area endDot
              color={end < 0 ? 'var(--wine)' : 'var(--pine)'}
              label={t(x.cumulativeLabel, { days: previewDays })}
            />
          ) : (
            <Skeleton height={64} radius="0.6rem" />
          )}
        </div>
      </div>

      {next && (
        <div className="pb-sched-hero-next">
          <span className="pb-sched-hero-next-tag"><CalendarClock size={13} aria-hidden="true" />{x.nextUp}</span>
          {/* USER DATA: the rule's own description. */}
          <span className="pb-sched-hero-next-title">{descriptionTitle(next.description)}</span>
          <span className="pb-sched-hero-next-when pb-tnum">{rel(next.date)}</span>
          <span className="font-mono-tab pb-sched-hero-next-amt" style={{ color: next.kind === 'income' ? 'var(--pine)' : 'var(--ink)' }}>
            {next.kind === 'income' ? '+' : ''}<RollingAmount value={formatCurrency(next.amount)} />
          </span>
        </div>
      )}
    </section>
  );
}
