'use client';

import { RollingAmount, RollingMoneyText } from '@/components/shared/RollingAmount';
import { Banknote } from 'lucide-react';
import type { CategoryMeta, Transaction } from '@/types';
import { formatCurrency, formatDate } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { categoryLabel, paymentMethodLabel } from '@/lib/i18n/enumLabels';

// Rows are selectable text now that long-press is gone, so a drag that ends
// inside the row would otherwise fire onClick and open the modal mid-selection.
const hasTextSelection = () =>
  typeof window !== 'undefined' && (window.getSelection()?.toString().length ?? 0) > 0;

interface TransactionRowProps {
  txn: Transaction;
  compact?: boolean;
  onOpenDetail?: (txn: Transaction) => void;
  categoryMeta: CategoryMeta;
  // OPTIONAL, for the Dashboard's day-grouped feed; every other caller
  // (Reports) omits them and gets exactly the original row.
  /** Leave the date out of the subtitle (a day header above already says it). */
  hideDate?: boolean;
  /** No side padding or bottom border: the container draws its own inset hairlines. */
  flush?: boolean;
  /** With onOpenDetail: also reachable by keyboard (role=button, Tab, Enter/Space). */
  focusable?: boolean;
  // OPTIONAL, for Reports; every other caller omits them and gets exactly the
  // row above.
  /** With focusable: keep row taps silent (role=button would otherwise make
      AppShell play the click sound, which plain rows never did). */
  silent?: boolean;
  /** Shown before the category tile (Reports' rank number). */
  lead?: React.ReactNode;
  /** Extra class names on the row. */
  className?: string;
}

export function TransactionRow({ txn, compact, onOpenDetail, categoryMeta, hideDate, flush, focusable, silent, lead, className }: TransactionRowProps) {
  const { d, t, locale } = useTranslation();
  const meta = categoryMeta[txn.category];
  const Icon = meta ? meta.icon : Banknote;
  const isIncome = txn.amount > 0;
  // txn.category is either a real category NAME (user data, for an
  // expense) or one of the two income literals 'Standard Income'/'Side Cash'.
  // categoryLabel() handles both: user names pass through unchanged, the two
  // income literals get a translated label.
  const subtitleParts = [categoryLabel(d, txn.category)];
  if (txn.type === 'expense' && txn.tag) subtitleParts.push(txn.tag);
  if (!hideDate) subtitleParts.push(formatDate(txn.date, locale));
  // txn.tag is USER DATA and stays exactly as stored. paymentMethod is a
  // stored CHECK-constrained value, so only its LABEL is swapped here -
  // txn.paymentMethod itself is never reassigned.
  if (!compact && txn.paymentMethod) subtitleParts.push(paymentMethodLabel(d, txn.paymentMethod));

  const interactiveProps = onOpenDetail
    ? {
        onClick: () => { if (!hasTextSelection()) onOpenDetail(txn); },
        className: className ? `txn-row-interactive ${className}` : 'txn-row-interactive',
        ...(focusable ? {
          role: 'button' as const,
          tabIndex: 0,
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenDetail(txn); }
          },
          ...(silent ? { 'data-no-click-sound': '' } : {}),
        } : {}),
      }
    : className ? { className } : {};

  return (
    <div
      {...interactiveProps}
      style={{
        display: 'flex', alignItems: 'center', gap: '0.85rem',
        padding: flush ? `${compact ? '0.55rem' : '0.85rem'} 0` : compact ? '0.55rem 1.5rem' : '0.85rem 1.5rem',
        borderBottom: flush ? undefined : '1px solid var(--line)',
        cursor: onOpenDetail ? 'pointer' : 'default',
      }}
    >
      {lead}
      <div style={{
        width: 36, height: 36, borderRadius: '0.65rem', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: isIncome ? 'var(--pine-soft)' : `${meta ? meta.color : '#999999'}20`,
      }}>
        <Icon size={16} style={{ color: isIncome ? 'var(--pine)' : (meta ? meta.color : 'var(--ink-soft)') }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.87rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {txn.description.split('\n')[0]}
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {subtitleParts.join(' · ')}
        </div>
        {!compact && txn.type === 'income' && txn.grossAmount !== txn.netAmount && (
          <div className="font-mono-tab" style={{ fontSize: '0.7rem', color: 'var(--ink-soft)', marginTop: 1 }}>
            <RollingMoneyText value={t(d.txn.gross, { amount: formatCurrency(txn.grossAmount) })} />
          </div>
        )}
      </div>
      <div className="font-mono-tab" style={{ fontSize: '0.87rem', fontWeight: 600, color: isIncome ? 'var(--pine)' : 'var(--wine)', whiteSpace: 'nowrap' }}>
        {isIncome ? '+' : ''}<RollingAmount value={formatCurrency(txn.amount)} />
      </div>
    </div>
  );
}
