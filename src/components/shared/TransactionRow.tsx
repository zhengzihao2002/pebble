'use client';

import { Banknote } from 'lucide-react';
import type { CategoryMeta, Transaction } from '@/types';
import { formatCurrency, formatDate } from '@/lib/format';
import { useLongPress } from '@/lib/hooks/useLongPress';

interface TransactionRowProps {
  txn: Transaction;
  compact?: boolean;
  onOpenDetail?: (txn: Transaction) => void;
  categoryMeta: CategoryMeta;
}

export function TransactionRow({ txn, compact, onOpenDetail, categoryMeta }: TransactionRowProps) {
  const meta = categoryMeta[txn.category];
  const Icon = meta ? meta.icon : Banknote;
  const isIncome = txn.amount > 0;
  const subtitleParts = [txn.category];
  if (txn.type === 'expense' && txn.tag) subtitleParts.push(txn.tag);
  subtitleParts.push(formatDate(txn.date));
  if (!compact && txn.paymentMethod) subtitleParts.push(txn.paymentMethod);

  const longPress = useLongPress(() => onOpenDetail && onOpenDetail(txn));
  const interactiveProps = onOpenDetail
    ? { onDoubleClick: () => onOpenDetail(txn), ...longPress, className: 'txn-row-interactive' }
    : {};

  return (
    <div
      {...interactiveProps}
      style={{
        display: 'flex', alignItems: 'center', gap: '0.85rem',
        padding: compact ? '0.55rem 1.5rem' : '0.85rem 1.5rem', borderBottom: '1px solid var(--line)',
        cursor: onOpenDetail ? 'pointer' : 'default', userSelect: onOpenDetail ? 'none' : 'auto',
      }}
    >
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
            Gross {formatCurrency(txn.grossAmount)}
          </div>
        )}
      </div>
      <div className="font-mono-tab" style={{ fontSize: '0.87rem', fontWeight: 600, color: isIncome ? 'var(--pine)' : 'var(--ink)', whiteSpace: 'nowrap' }}>
        {isIncome ? '+' : ''}{formatCurrency(txn.amount)}
      </div>
    </div>
  );
}
