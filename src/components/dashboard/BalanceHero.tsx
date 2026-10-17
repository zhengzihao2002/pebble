'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { Account } from '@/lib/data/mappers';
import { formatCurrency, splitCents } from '@/lib/format';
import { InfoTooltip } from '@/components/shared/InfoTooltip';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { renderTemplate } from '@/lib/i18n/RichText';
import { balanceChange, type BalancePoint } from '@/lib/balanceHistory';
import { Sparkline } from '@/components/kit/Sparkline';
import { DeltaChip } from '@/components/kit/DeltaChip';

interface BalanceHeroProps {
  totalBalance: number;
  accounts: Account[];
  /** Computed on the server by computeCurrentBalances - never recomputed here. */
  balancesByAccount: Record<string, number>;
  /** Sum of every goal's set-aside amount (the same figure the overspend notice uses). */
  allocated?: number;
  /** End-of-day total for the last 90 days, oldest first; null until today resolves. */
  trend?: BalancePoint[] | null;
}

// Up to five rows; beyond that, the four largest and a "+N more" line.
const MAX_ROWS = 5;

/**
 * The Dashboard's one brand moment: the total balance on the sign-in page's
 * pine gradient, with a quiet per-account list beside it (below it on
 * phones), separated by a hairline. Still by design: the trajectory line and
 * the bars below are drawn in place, with no entrance motion (the kit
 * Sparkline's fade is switched off inside the hero in dashboard.css).
 *
 * Three zones on a wide screen - figure, trajectory, accounts - so the band
 * no longer has an empty middle; on phones they stack in that order.
 *
 * Account NAMES are user data and are never translated.
 */
export function BalanceHero({ totalBalance, accounts, balancesByAccount, allocated = 0, trend = null }: BalanceHeroProps) {
  const { d, t } = useTranslation();
  const { whole, cents } = splitCents(formatCurrency(totalBalance));

  // Measured against the hero figure itself (totalBalance minus where the
  // line starts), so "up $X" always reconciles with the big number.
  const change = trend ? balanceChange(trend, totalBalance) : null;
  const period = d.accountsPage.period3m;
  const flat = change !== null && Math.abs(change.change) < 0.005;
  const changeText = change === null ? null : flat
    ? d.accountsPage.flat.replace('{period}', period)
    : renderTemplate(change.change > 0 ? d.accountsPage.upNoPct : d.accountsPage.downNoPct, {
        amount: <span className="font-mono-tab">{formatCurrency(Math.abs(change.change))}</span>,
        period,
      });

  // Goals do not hold money of their own: they claim a share of this total.
  const overAllocated = allocated > totalBalance;
  const allocShare = overAllocated ? 1 : totalBalance > 0 ? allocated / totalBalance : 0;

  // Sleeping accounts stay out of the list; their money still counts in the total.
  const rows = accounts
    .filter((a) => a.status !== 'hibernated')
    .map((a) => ({
      id: a.id,
      label: a.last4 ? `${a.name} ····${a.last4}` : a.name,
      balance: balancesByAccount[a.id] ?? 0,
    }))
    .sort((a, b) => b.balance - a.balance);
  const shown = rows.length > MAX_ROWS ? rows.slice(0, MAX_ROWS - 1) : rows;
  const moreCount = rows.length - shown.length;
  // One account would only repeat the total.
  const showAccounts = rows.length > 1;
  // Each account's share of the money that is there; a card owing money has
  // no share rather than a negative one.
  const positive = rows.reduce((s, r) => s + Math.max(0, r.balance), 0);

  return (
    <div className="pb-hero pb-dash-hero">
      <div className="pb-dash-hero-main">
        <p className="pb-hero-label">
          {d.dashboard.balanceTitle}
          <InfoTooltip label={d.dashboard.balanceTooltipLabel}>
            {renderTemplate(d.dashboard.balanceTooltip, {
              checking: d.enums.paymentMethod.Checking,
              cash: d.enums.paymentMethod.Cash,
              emphasis: <strong>{d.dashboard.balanceEmphasis}</strong>,
            })}
          </InfoTooltip>
        </p>
        <p className="font-display hero-balance">
          {whole}<span className="pb-hero-cents">{cents}</span>
        </p>
        {/* Reserved line: blank until today resolves, so nothing shifts. */}
        <p className="pb-dash-hero-change">
          {change && !flat && change.pct !== null && (
            <DeltaChip delta={change.change} text={`${Math.abs(change.pct).toFixed(1)}%`} good="neutral" />
          )}
          <span>{changeText ?? ' '}</span>
        </p>

        {allocated > 0 && (
          <div className="pb-dash-hero-alloc">
            {/* A proportion of money: blurred with the figures in privacy mode. */}
            <div className="pb-dash-alloc-bar pb-chart-fill" role="img" aria-label={d.ux.dashboard.allocationLabel}>
              <span className={`pb-dash-alloc-goals${overAllocated ? ' is-over' : ''}`} style={{ width: `${allocShare * 100}%` }} />
            </div>
            <div className="pb-dash-alloc-legend">
              <span className="pb-dash-alloc-key">
                <i className="pb-dash-alloc-dot is-goals" aria-hidden="true" />
                {d.goals.setAside}
                <span className="font-mono-tab">{formatCurrency(allocated)}</span>
              </span>
              <span className="pb-dash-alloc-key">
                <i className="pb-dash-alloc-dot" aria-hidden="true" />
                {overAllocated ? d.ux.dashboard.overAllocated : d.goals.unallocated}
                <span className="font-mono-tab">{formatCurrency(Math.abs(totalBalance - allocated))}</span>
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="pb-dash-hero-trend">
        {trend && trend.length > 1 && (
          <Sparkline
            values={trend.map((p) => p.total)}
            height={40}
            color="var(--pb-hero-fg)"
            area
            endDot
            label={d.accountsPage.chartLabel.replace('{period}', period)}
            className="pb-dash-hero-spark"
          />
        )}
      </div>

      {showAccounts && (
        <ul className="pb-hero-accounts" aria-label={d.dashboard.byAccount}>
          {shown.map((r) => (
            <li key={r.id} className="pb-hero-account">
              <span className="pb-hero-account-name">
                {r.label}
              </span>
              <span className="pb-hero-account-amount font-mono-tab">{formatCurrency(r.balance)}</span>
              {positive > 0 && r.balance > 0 && (
                <span className="pb-dash-hero-share pb-chart-fill" aria-hidden="true" style={{ width: `${(r.balance / positive) * 100}%` }} />
              )}
            </li>
          ))}
          {moreCount > 0 && (
            <li className="pb-hero-account pb-hero-more">
              {/* Still the "+N more" text; now it also goes where the rest are. */}
              <Link href="/accounts" prefetch={false} className="pb-dash-hero-more" aria-label={`${t(d.dashboard.moreAccounts, { count: moreCount })}, ${d.ux.dashboard.seeAllAccounts}`}>
                {t(d.dashboard.moreAccounts, { count: moreCount })}
                <ChevronRight size={14} aria-hidden="true" />
              </Link>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
