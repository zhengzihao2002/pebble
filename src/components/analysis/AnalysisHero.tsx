'use client';

import { ProgressRing } from '@/components/kit/ProgressRing';
import { Sparkline } from '@/components/kit/Sparkline';
import { DeltaChip } from '@/components/kit/DeltaChip';
import { InfoTooltip } from '@/components/shared/InfoTooltip';
import { formatCurrency, splitCents } from '@/lib/format';
import { renderTemplate } from '@/lib/i18n/RichText';
import { useTranslation } from '@/lib/i18n/useTranslation';
import type { CashflowSummary, MonthlyFlow } from '@/lib/analysis/cashflow';
import { PeriodChip, pct, wholeDollars } from './parts';

interface AnalysisHeroProps {
  cashflow: CashflowSummary;
  range: string;
}

/** Last complete month against the period average, or null when that month
 *  was dormant (nothing recorded) or there is no average to compare with. */
function lastVsAvg(months: MonthlyFlow[], pick: (m: MonthlyFlow) => number, avg: number | null) {
  const last = months[months.length - 1];
  if (!last || avg === null || months.length < 2) return null;
  if (last.income === 0 && last.spending === 0) return null;
  return { month: last.label, value: pick(last), delta: pick(last) - avg };
}

/**
 * The period at a glance: the savings rate as a ring with a sentence that
 * says what it means in money, then the four monthly figures that make it up,
 * each with its month-by-month shape and how the last complete month compares
 * with the period's average.
 *
 * Savings rate and Average monthly net LIVE HERE now (they were the first two
 * Cash flow tiles): same labels, exact values, notes and explanations - only
 * placed where the page opens. The sentence's money is rounded to whole
 * dollars because it is an estimate; the exact figures sit beside it.
 *
 * Gradient and its dark-mode fade come from the shared .pb-hero (one formula
 * driven by --pb-hero-dark, so the switch fades). The ring shows a share,
 * not an amount, so it stays readable in privacy mode (like the rate in the
 * sentence beside it); the sparklines are inside pb-chart-fade (kit), so
 * privacy mode blurs them.
 */
export function AnalysisHero({ cashflow, range }: AnalysisHeroProps) {
  const { d, t } = useTranslation();
  const x = d.ux.analysis;
  const cf = d.analysis.cashflow;
  const rate = cashflow.savingsRate;
  const net = cashflow.avgMonthlyNet;
  const months = cashflow.months;

  const sentence = rate === null || net === null ? x.heroNoIncome : net >= 0 ? x.heroKept : x.heroOverspent;

  const netText = net === null ? '—' : formatCurrency(net);
  const { whole, cents } = splitCents(netText);

  const kpis = [
    {
      key: 'income', label: x.avgIncome, value: cashflow.avgMonthlyIncome,
      series: months.map((m) => m.income), good: 'up' as const,
      cmp: lastVsAvg(months, (m) => m.income, cashflow.avgMonthlyIncome),
    },
    {
      key: 'spend', label: x.avgSpend, value: cashflow.avgMonthlySpend,
      series: months.map((m) => m.spending), good: 'down' as const,
      cmp: lastVsAvg(months, (m) => m.spending, cashflow.avgMonthlySpend),
    },
  ];
  const netCmp = lastVsAvg(months, (m) => m.net, net);

  const pctChip = (delta: number, avg: number) => {
    const p = avg === 0 ? 0 : Math.round((delta / Math.abs(avg)) * 100);
    return { text: `${p > 0 ? '+' : p < 0 ? '−' : ''}${Math.abs(p)}%`, sign: p };
  };

  return (
    <section className="card pb-hero pb-ana-hero pb-rise" aria-labelledby="pb-ana-hero-title">
      <div className="pb-ana-hero-main">
        <div className="pb-ana-hero-top">
          <h2 id="pb-ana-hero-title" className="pb-ana-hero-eyebrow">{x.atAGlance}</h2>
          <PeriodChip range={range} />
        </div>

        <div className="pb-ana-hero-rate">
          <div className="pb-ana-hero-ring">
            <ProgressRing value={rate !== null && rate > 0 ? rate : 0} size={124} stroke={10} color="var(--pb-hero-fg)">
              <span className="pb-ana-hero-ring-pct pb-tnum">{rate === null ? '—' : pct(rate)}</span>
            </ProgressRing>
          </div>
          <div className="pb-ana-hero-rate-text">
            <p className="pb-ana-hero-label">
              {cf.savingsLabel}
              <InfoTooltip label={cf.savingsTooltipLabel}>
                {renderTemplate(cf.savingsTooltip, { emphasis: <strong>{cf.savingsEmphasis}</strong> })}
              </InfoTooltip>
            </p>
            <p className="pb-ana-hero-note">{rate === null ? cf.savingsNoIncome : cf.savingsNote}</p>
            <p className="pb-ana-hero-sentence">
              {renderTemplate(sentence, {
                range: <span className="pb-tnum">{range}</span>,
                pct: <strong className="pb-tnum">{rate === null ? '' : `${Math.round(rate * 100)}%`}</strong>,
                amount: <strong className="font-mono-tab">{net === null ? '' : wholeDollars(Math.abs(net))}</strong>,
              })}
            </p>
          </div>
        </div>
      </div>

      <div className="pb-ana-hero-grid">
        {/* Average monthly net: the metric moved from Cash flow, exact cents. */}
        <div className="pb-ana-kpi is-net">
          <p className="pb-ana-kpi-label">
            {cf.avgNetLabel}
            <InfoTooltip label={cf.avgNetTooltipLabel}>{cf.avgNetTooltip}</InfoTooltip>
          </p>
          <p className="pb-ana-kpi-value pb-money font-display">
            {whole}<span className="pb-ana-cents">{cents}</span>
          </p>
          <p className="pb-ana-kpi-note">
            {net === null ? cf.avgNetNeedsOne : net >= 0 ? d.analysis.puttingAside : d.analysis.drawingDown}
          </p>
          {months.length > 1 && (
            <Sparkline values={months.map((m) => m.net)} height={30} color="var(--pb-hero-fg)" baseline={0} label={t(x.trendLabel, { name: cf.avgNetLabel })} />
          )}
          {netCmp && (
            <p className="pb-ana-kpi-delta">
              <DeltaChip
                delta={netCmp.delta} good="up" money
                text={`${netCmp.delta >= 0 ? '+' : '−'}${wholeDollars(Math.abs(netCmp.delta))}`}
              />
              <span>{x.lastMonthNote}</span>
            </p>
          )}
        </div>

        {kpis.map((k) => {
          // No average to compare with (nothing earned, say): no chip.
          const chip = k.cmp && k.value !== null && k.value !== 0 ? pctChip(k.cmp.delta, k.value) : null;
          const words = chip && k.cmp
            ? chip.sign === 0 ? t(x.lastMonthSame, { month: k.cmp.month })
              : t(chip.sign > 0 ? x.lastMonthMore : x.lastMonthLess, { month: k.cmp.month, value: `${Math.abs(chip.sign)}%` })
            : undefined;
          return (
            <div key={k.key} className="pb-ana-kpi">
              <p className="pb-ana-kpi-label">{k.label}</p>
              <p className="pb-ana-kpi-value pb-money font-display">{k.value === null ? '—' : wholeDollars(k.value)}</p>
              {months.length > 1 && (
                <Sparkline values={k.series} height={30} color="var(--pb-hero-fg)" label={t(x.trendLabel, { name: k.label })} />
              )}
              {chip && (
                <p className="pb-ana-kpi-delta">
                  <DeltaChip delta={chip.sign} good={k.good} text={t(x.vsAvgPct, { pct: chip.text })} label={words} />
                </p>
              )}
            </div>
          );
        })}

        <div className="pb-ana-kpi">
          <p className="pb-ana-kpi-label">{x.monthsRecorded}</p>
          <p className="pb-ana-kpi-value pb-tnum font-display">
            {t(x.monthsOf, { count: cashflow.recordedMonths, total: months.length })}
          </p>
          {/* One mark per month of the period: solid where something was
              recorded, hollow where nothing was. Not money - never blurred. */}
          <ul className="pb-ana-months" aria-hidden="true">
            {months.map((m) => {
              const on = m.income > 0 || m.spending > 0;
              return (
                <li
                  key={m.key} className={on ? 'is-on' : undefined}
                  title={t(on ? x.monthRecorded : x.monthDormant, { month: m.label })}
                />
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
