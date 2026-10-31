'use client';

import { RollingAmount } from '@/components/shared/RollingAmount';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';

/**
 * A running balance as the statement shows it. Bank and cash accounts (and
 * the all-accounts total): the signed balance. A credit card's lens reads as
 * what is OWED, like the Today ledger and the month's tiles, so one card is
 * never "$698.53 owed" in one place and "-$698.53" a few pixels below.
 *
 * Only the figure wears font-mono-tab (privacy blur); the word "owed" stays
 * readable, as in the Today ledger.
 */
export function BalanceFigure({ value, owed = false, className = '' }: { value: number; owed?: boolean; className?: string }) {
  const { d } = useTranslation();
  const fig = <span className={`font-mono-tab${className ? ` ${className}` : ''}`}><RollingAmount value={formatCurrency(owed ? Math.max(0, -value) : value)} /></span>;
  if (!owed) return fig;
  return <>{fig}{' '}<span className="pb-txn-owed">{d.accountsPage.cardOwed}</span></>;
}
