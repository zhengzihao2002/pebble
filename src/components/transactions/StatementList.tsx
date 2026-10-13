'use client';

import type { CategoryMeta, LedgerRecord } from '@/types';
import type { LedgerEntry } from '@/lib/stats';
import { formatCurrency } from '@/lib/format';
import { StatementRow } from '@/components/shared/StatementRow';
import { useTranslation } from '@/lib/i18n/useTranslation';

// A ledger entry with its full transaction record resolved — recentTransactions
// entries are deliberately lightweight (just balances + an id), so the page
// resolves each back to its full record before handing entries down here.
import type { Account } from '@/lib/data/mappers';

export interface StatementEntry extends LedgerEntry {
  record: LedgerRecord;
}

interface StatementListProps {
  entries: StatementEntry[];
  openingBalance: number;
  /** Passed through to StatementRow for per-account balance names. */
  accounts: Account[];
  categoryMeta: CategoryMeta;
  onOpenDetail: (txn: LedgerRecord) => void;
}

export function StatementList({ entries, openingBalance, accounts, categoryMeta, onOpenDetail }: StatementListProps) {
  const { d, t } = useTranslation();
  return (
    <div className="card" style={{ padding: '0.25rem 0 1rem', overflow: 'hidden' }}>
      {entries.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1.5rem', color: 'var(--ink-soft)' }}>
          <p style={{ fontWeight: 500, marginBottom: 4, color: 'var(--ink)' }}>{d.transactions.noActivity}</p>
          <p style={{ fontSize: '0.85rem' }}>{t(d.transactions.carriedForward, { amount: formatCurrency(openingBalance) })}</p>
        </div>
      ) : (
        <div style={{ marginTop: '0.5rem' }}>
          {entries.map((e) => (
            <StatementRow
              key={e.transId} txn={e.record}
              balancesAfter={e.balancesAfter} accounts={accounts} totalBalanceAfter={e.totalBalanceAfter}
              onOpenDetail={onOpenDetail} categoryMeta={categoryMeta}
            />
          ))}
        </div>
      )}
    </div>
  );
}
