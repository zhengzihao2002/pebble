'use client';

import { RollingAmount } from '@/components/shared/RollingAmount';
import type { CategoryMeta, Transaction } from '@/types';
import { formatCurrency } from '@/lib/format';
import { descriptionTitle } from '@/lib/transactionDescription';
import { categoryLabel } from '@/lib/i18n/enumLabels';
import { useTranslation } from '@/lib/i18n/useTranslation';

/**
 * One transaction as a tappable row: the category's tinted tile, the title
 * (ellipsis, so the shell's truncation tooltip can show it in full - no
 * title attribute, which would suppress that tooltip), a quiet second line
 * and the signed amount. Opens the transaction's detail dialog.
 */
export function ChargeRow({ txn, categoryMeta, sub, onOpen }: {
  txn: Transaction;
  categoryMeta: CategoryMeta;
  /** The second line; defaults to the category's name. */
  sub?: string;
  onOpen: (txn: Transaction) => void;
}) {
  const { d } = useTranslation();
  const meta = categoryMeta[txn.category];
  const Icon = meta?.icon;
  const color = meta ? meta.color : 'var(--ink-soft)';
  return (
    <button type="button" className="pb-ins-charge" onClick={() => onOpen(txn)}>
      <span className="pb-ins-tile" aria-hidden="true" style={{ ['--pb-ins-cat' as string]: color }}>
        {Icon && <Icon size={16} />}
      </span>
      <span className="pb-ins-charge-text">
        {/* Description and category are USER DATA. */}
        <span className="pb-ins-charge-title">{descriptionTitle(txn.description) || categoryLabel(d, txn.category)}</span>
        <span className="pb-ins-charge-sub">{sub ?? categoryLabel(d, txn.category)}</span>
      </span>
      <span className={`font-mono-tab pb-ins-charge-amt${txn.amount < 0 ? ' is-out' : ' is-in'}`}>
        {txn.amount > 0 ? '+' : ''}<RollingAmount value={formatCurrency(txn.amount)} />
      </span>
    </button>
  );
}
