'use client';

import type { Account } from '@/lib/data/mappers';
import { formatCurrency } from '@/lib/format';
import { InfoTooltip } from '@/components/shared/InfoTooltip';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { renderTemplate } from '@/lib/i18n/RichText';

interface BalanceHeroProps {
  totalBalance: number;
  accounts: Account[];
  /** Computed on the server by computeCurrentBalances - never recomputed here. */
  balancesByAccount: Record<string, number>;
}

// Up to five rows; beyond that, the four largest and a "+N more" line.
const MAX_ROWS = 5;

/** Splits formatCurrency's own output, so the figure is never reformatted. */
function splitCents(text: string): { whole: string; cents: string } {
  const i = text.lastIndexOf('.');
  return i === -1 ? { whole: text, cents: '' } : { whole: text.slice(0, i), cents: text.slice(i) };
}

/**
 * The Dashboard's one brand moment: the total balance on the sign-in page's
 * pine gradient, with a quiet per-account list beside it (below it on
 * phones), separated by a hairline. Still by design.
 *
 * Account NAMES are user data and are never translated.
 */
export function BalanceHero({ totalBalance, accounts, balancesByAccount }: BalanceHeroProps) {
  const { d, t } = useTranslation();
  const { whole, cents } = splitCents(formatCurrency(totalBalance));

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

  return (
    <div className="pb-hero">
      <div>
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
      </div>

      {showAccounts && (
        <ul className="pb-hero-accounts" aria-label={d.dashboard.byAccount}>
          {shown.map((r) => (
            <li key={r.id} className="pb-hero-account">
              <span className="pb-hero-account-name">
                {r.label}
              </span>
              <span className="pb-hero-account-amount font-mono-tab">{formatCurrency(r.balance)}</span>
            </li>
          ))}
          {moreCount > 0 && (
            <li className="pb-hero-account pb-hero-more">{t(d.dashboard.moreAccounts, { count: moreCount })}</li>
          )}
        </ul>
      )}
    </div>
  );
}
