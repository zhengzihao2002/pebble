'use client';

import { useState } from 'react';
import { Banknote } from 'lucide-react';
import type { CategoryMeta, Transaction } from '@/types';
import { formatCurrency, formatDate } from '@/lib/format';
import { useLongPress } from '@/lib/hooks/useLongPress';

interface StatementRowProps {
  txn: Transaction;
  checkingBalanceAfter: number;
  cashBalanceAfter: number;
  totalBalanceAfter: number;
  onOpenDetail: (txn: Transaction) => void;
  categoryMeta: CategoryMeta;
}

export function StatementRow({ txn, checkingBalanceAfter, cashBalanceAfter, totalBalanceAfter, onOpenDetail, categoryMeta }: StatementRowProps) {
  const meta = categoryMeta[txn.category];
  const Icon = meta ? meta.icon : Banknote;
  const isIncome = txn.amount > 0;
  const subtitleParts = [txn.category];
  if (txn.type === 'expense' && txn.tag) subtitleParts.push(txn.tag);
  subtitleParts.push(formatDate(txn.date));

  const longPress = useLongPress(() => onOpenDetail(txn));
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

  // "Near the mouse," offset so the tooltip doesn't sit directly under the
  // cursor, with a rough clamp so it doesn't get cut off near a screen edge.
  const updateHoverPos = (e: React.MouseEvent<HTMLDivElement>) => {
    const TOOLTIP_W = 170, TOOLTIP_H = 76, OFFSET = 14;
    let x = e.clientX + OFFSET;
    let y = e.clientY + OFFSET;
    if (typeof window !== 'undefined') {
      if (x + TOOLTIP_W > window.innerWidth) x = e.clientX - TOOLTIP_W - OFFSET;
      if (y + TOOLTIP_H > window.innerHeight) y = e.clientY - TOOLTIP_H - OFFSET;
    }
    setHoverPos({ x, y });
  };

  return (
    <div
      onDoubleClick={() => onOpenDetail(txn)}
      {...longPress}
      className="txn-row-interactive"
      style={{
        display: 'flex', alignItems: 'center', gap: '0.85rem',
        padding: '0.85rem 1.5rem', borderBottom: '1px solid var(--line)',
        cursor: 'pointer', userSelect: 'none',
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
      </div>
      <div
        style={{ textAlign: 'right', flexShrink: 0 }}
        onMouseEnter={updateHoverPos}
        onMouseMove={updateHoverPos}
        onMouseLeave={() => setHoverPos(null)}
      >
        <div className="font-mono-tab" style={{ fontSize: '0.87rem', fontWeight: 600, color: isIncome ? 'var(--pine)' : 'var(--ink)', whiteSpace: 'nowrap' }}>
          {isIncome ? '+' : ''}{formatCurrency(txn.amount)}
        </div>
        <div className="font-mono-tab" style={{ fontSize: '0.72rem', color: 'var(--ink-soft)', whiteSpace: 'nowrap', marginTop: 1 }}>
          Bal {formatCurrency(totalBalanceAfter)}
        </div>
      </div>

      {hoverPos && (
        <div
          style={{
            position: 'fixed', left: hoverPos.x, top: hoverPos.y, zIndex: 100, pointerEvents: 'none',
            backgroundColor: 'var(--mist)', border: '1px solid var(--line)', borderRadius: '0.6rem',
            padding: '0.55rem 0.75rem', boxShadow: 'var(--shadow)', minWidth: 150,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', fontSize: '0.72rem' }}>
            <span style={{ color: 'var(--ink-soft)' }}>Checking</span>
            <span className="font-mono-tab" style={{ color: 'var(--ink)', fontWeight: 600 }}>{formatCurrency(checkingBalanceAfter)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', fontSize: '0.72rem', marginTop: 4 }}>
            <span style={{ color: 'var(--ink-soft)' }}>Cash</span>
            <span className="font-mono-tab" style={{ color: 'var(--ink)', fontWeight: 600 }}>{formatCurrency(cashBalanceAfter)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
