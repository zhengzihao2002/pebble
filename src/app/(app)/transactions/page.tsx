'use client';

import { useMemo, useState } from 'react';
import { Wallet, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { usePebbleStore, useTransactions } from '@/store/usePebbleStore';
import { computeRecentTransactions, getLastNMonths } from '@/lib/stats';
import { formatCurrency } from '@/lib/format';
import { TODAY } from '@/data/seed';
import { StatTab } from '@/components/shared/StatTab';
import { MonthNavigator } from '@/components/transactions/MonthNavigator';
import { StatementList, type StatementEntry } from '@/components/transactions/StatementList';
import { TransactionDetailModal } from '@/components/modals/TransactionDetailModal';
import type { Transaction } from '@/types';

export default function TransactionsPage() {
  const expenses = usePebbleStore((s) => s.expenses);
  const income = usePebbleStore((s) => s.income);
  const checkingBalance = usePebbleStore((s) => s.checkingBalance);
  const cashBalance = usePebbleStore((s) => s.cashBalance);
  const categoryMeta = usePebbleStore((s) => s.categoryMeta);
  const transactions = useTransactions();

  const [selectedMonthIndex, setSelectedMonthIndex] = useState(0); // 0 = current month
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);

  const monthOptions = useMemo(() => getLastNMonths(TODAY, 12), []);
  const selectedMonthInfo = monthOptions[selectedMonthIndex];

  const recentTransactions = useMemo(
    () => computeRecentTransactions(expenses, income, checkingBalance, cashBalance),
    [expenses, income, checkingBalance, cashBalance]
  );

  const recordsById = useMemo(() => {
    const map = new Map<string, Transaction>();
    transactions.forEach((t) => map.set(t.id, t));
    return map;
  }, [transactions]);

  // recentTransactions entries are lightweight — resolve each back to its
  // full record here.
  const entriesWithRecords = useMemo(() => {
    return recentTransactions.reduce<StatementEntry[]>((acc, e) => {
      const record = recordsById.get(e.transId);
      if (record) acc.push({ ...e, record });
      return acc;
    }, []);
  }, [recentTransactions, recordsById]);

  const { monthEntries, openingBalance, closingBalance, totalDeposits, totalWithdrawals } = useMemo(() => {
    const monthStart = `${selectedMonthInfo.year}-${String(selectedMonthInfo.month + 1).padStart(2, '0')}-01`;
    const nextMonthDate = new Date(selectedMonthInfo.year, selectedMonthInfo.month + 1, 1);
    const monthNext = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}-01`;

    // entriesWithRecords is newest-first, so [0] of a filtered slice is
    // always the most recent entry in it — that's the closing balance for
    // the month, and the first entry strictly before monthStart is the
    // closest prior balance (the opening balance), even across a month
    // with zero activity.
    const entries = entriesWithRecords.filter((e) => e.record.date >= monthStart && e.record.date < monthNext);
    const priorEntry = entriesWithRecords.find((e) => e.record.date < monthStart);
    const opening = priorEntry ? priorEntry.totalBalanceAfter : 0;
    const closing = entries.length > 0 ? entries[0].totalBalanceAfter : opening;
    const deposits = entries.reduce((s, e) => (e.record.amount > 0 ? s + e.record.amount : s), 0);
    const withdrawals = entries.reduce((s, e) => (e.record.amount < 0 ? s + Math.abs(e.record.amount) : s), 0);

    return { monthEntries: entries, openingBalance: opening, closingBalance: closing, totalDeposits: deposits, totalWithdrawals: withdrawals };
  }, [entriesWithRecords, selectedMonthInfo]);

  const currentBalance = checkingBalance + cashBalance;
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
