'use client';

import { useState } from 'react';
import { Banknote, SlidersHorizontal } from 'lucide-react';
import type { CategoryMeta, LedgerRecord } from '@/types';
import type { Account } from '@/lib/data/mappers';
import { formatCurrency, formatDate } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { categoryLabel } from '@/lib/i18n/enumLabels';

// Rows are selectable text now that long-press is gone, so a drag that ends
// inside the row would otherwise fire onClick and open the modal mid-selection.
const hasTextSelection = () =>
  typeof window !== 'undefined' && (window.getSelection()?.toString().length ?? 0) > 0;

interface StatementRowProps {
  txn: LedgerRecord;
  /** Every account's balance after this record, keyed by account id. */
  balancesAfter: Record<string, number>;
  /** Needed for names and ordering - accounts are user data, not a fixed pair. */
  accounts: Account[];
  totalBalanceAfter: number;
  onOpenDetail: (txn: LedgerRecord) => void;
  categoryMeta: CategoryMeta;
}

export function StatementRow({ txn, balancesAfter, accounts, totalBalanceAfter, onOpenDetail, categoryMeta }: StatementRowProps) {
  const { d, t, locale } = useTranslation();

  // Adjustments have no category. They are manual balance corrections, so
  // they get their own icon and a neutral treatment rather than being coloured
  // as income or spending.
  const isAdjustment = txn.type === 'adjustment';
  const meta = isAdjustment ? undefined : categoryMeta[txn.category];
  const Icon = isAdjustment ? SlidersHorizontal : (meta ? meta.icon : Banknote);
  const isIncome = !isAdjustment && txn.amount > 0;

  // txn.category is either a real category NAME (user data) or one of the
  // two income literals - categoryLabel() handles both, translating only
  // the latter.
  const subtitleParts = isAdjustment ? [d.txn.balanceAdjustment] : [categoryLabel(d, txn.category)];
  if (txn.type === 'expense' && txn.tag) subtitleParts.push(txn.tag);
  subtitleParts.push(formatDate(txn.date, locale));

  const accentColor = isAdjustment
    ? 'var(--ink-soft)'
    : (isIncome ? 'var(--pine)' : (meta ? meta.color : 'var(--ink-soft)'));
  const accentBg = isAdjustment
    ? 'var(--mist)'
    : (isIncome ? 'var(--pine-soft)' : `${meta ? meta.color : '#999999'}20`);
  const amountColor = isAdjustment
    ? 'var(--ink-soft)'
    : (isIncome ? 'var(--pine)' : 'var(--ink)');
  const amountPrefix = isAdjustment ? (txn.amount > 0 ? '+' : '') : (isIncome ? '+' : '');

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
      onClick={() => { if (!hasTextSelection()) onOpenDetail(txn); }}
      className="txn-row-interactive"
      style={{
        display: 'flex', alignItems: 'center', gap: '0.85rem',
        padding: '0.85rem 1.5rem', borderBottom: '1px solid var(--line)',
        cursor: 'pointer',
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: '0.65rem', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: accentBg,
      }}>
        <Icon size={16} style={{ color: accentColor }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.87rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {txn.description.split('\n')[0] || (isAdjustment ? d.txn.balanceAdjustment : '')}
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
        <div className="font-mono-tab" style={{ fontSize: '0.87rem', fontWeight: 600, color: amountColor, whiteSpace: 'nowrap' }}>
          {amountPrefix}{formatCurrency(txn.amount)}
        </div>
        <div className="font-mono-tab" style={{ fontSize: '0.72rem', color: 'var(--ink-soft)', whiteSpace: 'nowrap', marginTop: 1 }}>
          {t(d.txn.balanceAfter, { amount: formatCurrency(totalBalanceAfter) })}
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
          {/* Account NAMES are USER DATA and are never translated - unlike the
              old fixed Checking/Cash pair, which came from the dictionary.
              Closed accounts still appear here: a historical row references
              one, and hiding it would leave an unexplained figure. */}
          {accounts.map((a, i) => (
            <div
              key={a.id}
              style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', fontSize: '0.72rem', marginTop: i === 0 ? 0 : 4 }}
            >
              <span style={{ color: 'var(--ink-soft)' }}>{a.name}</span>
              <span className="font-mono-tab" style={{ color: 'var(--ink)', fontWeight: 600 }}>
                {formatCurrency(balancesAfter[a.id] ?? 0)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
