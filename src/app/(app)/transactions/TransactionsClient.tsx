'use client';

import { useMemo, useState } from 'react';
import { Wallet, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import type { BalanceAdjustment, LedgerRecord, Transaction } from '@/types';
import type { CategoryItem } from '@/lib/data/mappers';
import type { LedgerEntry } from '@/lib/stats';
import { getLastNMonths } from '@/lib/stats';
import { buildCategoryMeta } from '@/lib/data/categoryMeta';
import { formatCurrency } from '@/lib/format';
import { StatTab } from '@/components/shared/StatTab';
import { MonthNavigator } from '@/components/transactions/MonthNavigator';
import { StatementList, type StatementEntry } from '@/components/transactions/StatementList';
import { TransactionDetailModal } from '@/components/modals/TransactionDetailModal';

interface TransactionsClientProps {
  transactions: Transaction[];
  adjustments: BalanceAdjustment[];
  ledger: LedgerEntry[];
  categories: CategoryItem[];
  budgets: Record<string, number>;
  accountOpeningTotal: number;
  currentBalance: number;
}

export function TransactionsClient({
  transactions, adjustments, ledger, categories, budgets, accountOpeningTotal, currentBalance,
}: TransactionsClientProps) {
  const categoryMeta = useMemo(() => buildCategoryMeta(categories, budgets), [categories, budgets]);

  const [selectedMonthIndex, setSelectedMonthIndex] = useState(0); // 0 = current month
  const [selectedTransaction, setSelectedTransaction] = useState<LedgerRecord | null>(null);

  // 13, not 12: the navigator must reach the same month one year back
  // (from August 2026 that is August 2025, which is 13 entries inclusive).
  //
  // This is a VIEW limit only. Nothing is ever deleted - expense and income
  // rows are permanent, and Reports still sees the full history. A
  // transaction dated outside this window is still stored and still counts
  // toward the balance; it just is not reachable from this navigator.
  //
  // Evaluated on the client so the month list follows the viewer's local
  // date rather than the server's, and stays correct past midnight.
  const monthOptions = useMemo(() => getLastNMonths(new Date(), 13), []);
  const selectedMonthInfo = monthOptions[selectedMonthIndex];

  const recordsById = useMemo(() => {
    const map = new Map<string, LedgerRecord>();
    transactions.forEach((t) => map.set(t.id, t));
    adjustments.forEach((a) => map.set(a.id, a));
    return map;
  }, [transactions, adjustments]);

  // ledger entries are lightweight - resolve each back to its full record here.
  const entriesWithRecords = useMemo(() => {
    return ledger.reduce<StatementEntry[]>((acc, e) => {
      const record = recordsById.get(e.transId);
      if (record) acc.push({ ...e, record });
      return acc;
    }, []);
  }, [ledger, recordsById]);

  const { monthEntries, openingBalance, closingBalance, totalDeposits, totalWithdrawals } = useMemo(() => {
    const monthStart = `${selectedMonthInfo.year}-${String(selectedMonthInfo.month + 1).padStart(2, '0')}-01`;
    const nextMonthDate = new Date(selectedMonthInfo.year, selectedMonthInfo.month + 1, 1);
    const monthNext = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}-01`;

    // entriesWithRecords is newest-first, so [0] of a filtered slice is
    // always the most recent entry in it - that's the closing balance for
    // the month, and the first entry strictly before monthStart is the
    // closest prior balance (the opening balance), even across a month
    // with zero activity.
    const entries = entriesWithRecords.filter((e) => e.record.date >= monthStart && e.record.date < monthNext);
    const priorEntry = entriesWithRecords.find((e) => e.record.date < monthStart);
    // With no prior transaction the month opens at the account's stored
    // opening balance, NOT at zero.
    const opening = priorEntry ? priorEntry.totalBalanceAfter : accountOpeningTotal;
    const closing = entries.length > 0 ? entries[0].totalBalanceAfter : opening;
    const deposits = entries.reduce((s, e) => (e.record.amount > 0 ? s + e.record.amount : s), 0);
    const withdrawals = entries.reduce((s, e) => (e.record.amount < 0 ? s + Math.abs(e.record.amount) : s), 0);

    return { monthEntries: entries, openingBalance: opening, closingBalance: closing, totalDeposits: deposits, totalWithdrawals: withdrawals };
  }, [entriesWithRecords, selectedMonthInfo, accountOpeningTotal]);

  const canGoOlder = selectedMonthIndex < monthOptions.length - 1;
  const canGoNewer = selectedMonthIndex > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="card" style={{ padding: '1.5rem' }}>
        <p style={{ fontSize: '0.78rem', color: 'var(--ink-soft)', marginBottom: 4 }}>Total balance, today</p>
        <p className="font-display" style={{ fontSize: '2rem', fontWeight: 600, marginBottom: '1.25rem' }}>{formatCurrency(currentBalance)}</p>

        <MonthNavigator
          label={selectedMonthInfo.label}
          canGoOlder={canGoOlder}
          canGoNewer={canGoNewer}
          onOlder={() => setSelectedMonthIndex((i) => i + 1)}
          onNewer={() => setSelectedMonthIndex((i) => i - 1)}
        />

        <div className="stat-tabs">
          <StatTab icon={Wallet} label="Opening balance" value={formatCurrency(openingBalance)} color="var(--ink-soft)" />
          <StatTab icon={Wallet} label="Closing balance" value={formatCurrency(closingBalance)} color="var(--pine)" />
          <StatTab icon={ArrowUpRight} label="Deposits" value={formatCurrency(totalDeposits)} color="var(--pine)" />
          <StatTab icon={ArrowDownRight} label="Withdrawals" value={formatCurrency(totalWithdrawals)} color="var(--wine)" />
        </div>
      </div>

      <StatementList
        entries={monthEntries}
        openingBalance={openingBalance}
        categoryMeta={categoryMeta}
        onOpenDetail={setSelectedTransaction}
      />

      {selectedTransaction && (
        <TransactionDetailModal
          txn={selectedTransaction}
          onClose={() => setSelectedTransaction(null)}
          categoryMeta={categoryMeta}
        />
      )}
    </div>
  );
}
