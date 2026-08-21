'use client';

import type { CategoryMeta, LedgerRecord } from '@/types';
import type { LedgerEntry } from '@/lib/stats';
import { formatCurrency } from '@/lib/format';
import { StatementRow } from '@/components/shared/StatementRow';

// A ledger entry with its full transaction record resolved — recentTransactions
// entries are deliberately lightweight (just balances + an id), so the page
// resolves each back to its full record before handing entries down here.
export interface StatementEntry extends LedgerEntry {
  record: LedgerRecord;
}

interface StatementListProps {
  entries: StatementEntry[];
  openingBalance: number;
  categoryMeta: CategoryMeta;
  onOpenDetail: (txn: LedgerRecord) => void;
}

export function StatementList({ entries, openingBalance, categoryMeta, onOpenDetail }: StatementListProps) {
  return (
    <div className="card" style={{ padding: '0.25rem 0 1rem', overflow: 'hidden' }}>
      {entries.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1.5rem', color: 'var(--ink-soft)' }}>
          <p style={{ fontWeight: 500, marginBottom: 4, color: 'var(--ink)' }}>No activity this month</p>
          <p style={{ fontSize: '0.85rem' }}>Balance carried forward at {formatCurrency(openingBalance)}.</p>
        </div>
      ) : (
        <div style={{ marginTop: '0.5rem' }}>
          {entries.map((e) => (
            <StatementRow
              key={e.transId} txn={e.record}
              checkingBalanceAfter={e.checkingBalanceAfter} cashBalanceAfter={e.cashBalanceAfter} totalBalanceAfter={e.totalBalanceAfter}
              onOpenDetail={onOpenDetail} categoryMeta={categoryMeta}
            />
          ))}
        </div>
      )}
    </div>
  );
}
