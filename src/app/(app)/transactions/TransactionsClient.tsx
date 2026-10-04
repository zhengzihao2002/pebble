'use client';

import { useMemo, useState } from 'react';
import { Wallet, ArrowUpRight, ArrowDownRight, Landmark, Coins, SlidersHorizontal, Search, X } from 'lucide-react';
import type { BalanceAdjustment, LedgerRecord, Transaction } from '@/types';
import type { CategoryItem } from '@/lib/data/mappers';
import type { LedgerEntry } from '@/lib/stats';
import { getLastNMonths } from '@/lib/stats';
import { buildCategoryMeta } from '@/lib/data/categoryMeta';
import { resolveCategoryIcon } from '@/lib/data/icons';
import { formatCurrency, formatMonthYear } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { categoryLabel } from '@/lib/i18n/enumLabels';
import { StatTab } from '@/components/shared/StatTab';
import { SelectField, type SelectFieldOption } from '@/components/shared/SelectField';
import { MonthNavigator } from '@/components/transactions/MonthNavigator';
import { StatementList, type StatementEntry } from '@/components/transactions/StatementList';
import { StatementRow } from '@/components/shared/StatementRow';
import type { Account } from '@/lib/data/mappers';
import { TransactionDetailModal } from '@/components/modals/TransactionDetailModal';

interface TransactionsClientProps {
  transactions: Transaction[];
  adjustments: BalanceAdjustment[];
  ledger: LedgerEntry[];
  categories: CategoryItem[];
  budgets: Record<string, number>;
  accountOpeningTotal: number;
  currentBalance: number;
  // From the same computeCurrentBalances() call as the total, so the parts
  // always sum to the figure shown above them. Deriving them from the ledger
  // instead would risk a mismatch: that walk is capped to a 13-month window.
  accounts: Account[];
  balancesByAccount: Record<string, number>;
}

type TypeFilter = 'all' | 'expense' | 'income';
// Not '' - a category can never be named this, and '' is what SelectField's
// plain mode treats as "nothing chosen".
const ALL_CATEGORIES = '__all__';

export function TransactionsClient({
  transactions, adjustments, ledger, categories, budgets, accountOpeningTotal, currentBalance, accounts, balancesByAccount,
}: TransactionsClientProps) {
  const { d, t, locale } = useTranslation();
  const categoryMeta = useMemo(() => buildCategoryMeta(categories, budgets), [categories, budgets]);

  const [selectedMonthIndex, setSelectedMonthIndex] = useState(0); // 0 = current month
  const [selectedTransaction, setSelectedTransaction] = useState<LedgerRecord | null>(null);

  // Search and filters. Client only: they run over the ledger already on the
  // page, so nothing is fetched.
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState(ALL_CATEGORIES);

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

  const { monthEntries, openingBalance, closingBalance, totalDeposits, totalWithdrawals, totalAdjustments } = useMemo(() => {
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
    // With no prior transaction the month opens at accountOpeningTotal,
    // which is always 0 - every account starts at zero by design.
    const opening = priorEntry ? priorEntry.totalBalanceAfter : accountOpeningTotal;
    const closing = entries.length > 0 ? entries[0].totalBalanceAfter : opening;
    // Adjustments - manual corrections AND transfers, which are stored as a
    // pair of adjustment rows - get their own figure. Counting them by sign
    // made a correction read as income or spending, and every transfer
    // inflated BOTH deposits and withdrawals. A transfer's two rows share a
    // date and sum to zero, so here they cancel and only corrections remain.
    // closing = opening + deposits - withdrawals + adjustments still holds.
    const flows = entries.filter((e) => e.record.type !== 'adjustment');
    const deposits = flows.reduce((s, e) => (e.record.amount > 0 ? s + e.record.amount : s), 0);
    const withdrawals = flows.reduce((s, e) => (e.record.amount < 0 ? s + Math.abs(e.record.amount) : s), 0);
    const adjustmentNet = entries.reduce((s, e) => (e.record.type === 'adjustment' ? s + e.record.amount : s), 0);

    return { monthEntries: entries, openingBalance: opening, closingBalance: closing, totalDeposits: deposits, totalWithdrawals: withdrawals, totalAdjustments: adjustmentNet };
  }, [entriesWithRecords, selectedMonthInfo, accountOpeningTotal]);

  // Sign written explicitly against Math.abs, as TransactionDetailModal
  // does, so there is exactly one sign glyph whatever formatCurrency does
  // with negatives. Rounded to cents first so float residue from a transfer
  // pair or a set of corrections can never print as a signed zero.
  const adjustmentCents = Math.round(totalAdjustments * 100);
  const adjustmentSign = adjustmentCents > 0 ? '+' : adjustmentCents < 0 ? '-' : '';
  const adjustmentText = `${adjustmentSign}${formatCurrency(Math.abs(adjustmentCents) / 100)}`;
  const adjustmentColor = adjustmentCents > 0 ? 'var(--pine)' : adjustmentCents < 0 ? 'var(--wine)' : 'var(--ink-soft)';

  const canGoOlder = selectedMonthIndex < monthOptions.length - 1;
  const canGoNewer = selectedMonthIndex > 0;

  // ---- Search ---------------------------------------------------------------
  // Runs over the same 13-month ledger as the month list, so every result
  // keeps a correct "balance after". Older records: the command palette.
  const accountNames = useMemo(() => {
    const map = new Map<string, string>();
    accounts.forEach((a) => map.set(a.id, a.name.toLowerCase()));
    return map;
  }, [accounts]);

  const q = query.trim().toLowerCase();
  // Amount search ignores $, commas and spaces, and only runs when the query
  // has a digit, so typing a word never matches every amount.
  const qAmount = q.replace(/[$,\s]/g, '');
  const amountQuery = /[0-9]/.test(qAmount);
  const searching = q !== '' || typeFilter !== 'all' || categoryFilter !== ALL_CATEGORIES;

  const results = useMemo(() => {
    if (!searching) return [];
    return entriesWithRecords.filter((e) => {
      const r = e.record;
      if (typeFilter !== 'all' && r.type !== typeFilter) return false;
      if (categoryFilter !== ALL_CATEGORIES && (r.type === 'adjustment' || r.category !== categoryFilter)) return false;
      if (q === '') return true;
      const categoryText = r.type === 'adjustment'
        ? d.txn.balanceAdjustment.toLowerCase()
        : `${r.category} ${categoryLabel(d, r.category)}`.toLowerCase();
      const tag = r.type === 'expense' && r.tag ? r.tag.toLowerCase() : '';
      return (
        r.description.toLowerCase().includes(q)
        || categoryText.includes(q)
        || (tag !== '' && tag.includes(q))
        || (accountNames.get(r.accountId) ?? '').includes(q)
        || (amountQuery && Math.abs(r.amount).toFixed(2).includes(qAmount))
      );
    });
  }, [searching, entriesWithRecords, typeFilter, categoryFilter, q, qAmount, amountQuery, accountNames, d]);

  // Category names are USER DATA (label === value); only the two income
  // literals get a translated label.
  const categoryOptions: SelectFieldOption[] = useMemo(() => [
    { value: ALL_CATEGORIES, label: d.txnSearch.allCategories },
    ...categories.map((c) => ({ value: c.name, label: c.name, icon: resolveCategoryIcon(c.iconKey), color: c.color })),
    { value: 'Standard Income', label: d.enums.incomeCategory['Standard Income'] },
    { value: 'Side Cash', label: d.enums.incomeCategory['Side Cash'] },
  ], [categories, d]);

  const clearSearch = () => {
    setQuery('');
    setTypeFilter('all');
    setCategoryFilter(ALL_CATEGORIES);
  };

  const typeOptions: { value: TypeFilter; label: string }[] = [
    { value: 'all', label: d.txnSearch.typeAll },
    { value: 'expense', label: d.enums.kind.expense },
    { value: 'income', label: d.enums.kind.income },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="card" style={{ padding: '1.5rem' }}>
        <p style={{ fontSize: '0.78rem', color: 'var(--ink-soft)', marginBottom: 4 }}>{d.transactions.totalBalanceToday}</p>
        {/* Baseline-aligned so the small figures sit on the big one's baseline,
            and wrapping so they drop to their own line on a narrow phone rather
            than squeezing the total. Same label/figure treatment as the hover
            tooltip in StatementRow - this is that information promoted, not a
            new pattern. */}
        <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.35rem 0.9rem', marginBottom: '1.25rem' }}>
          <p className="font-display pb-money" style={{ fontSize: '2rem', fontWeight: 600 }}>{formatCurrency(currentBalance)}</p>
          {/* Chips rather than loose text: each account reads as its own object,
              and the icon identifies it faster than the word does. Subordinate
              to the total in size, but not weightless. Deliberately NOT StatTab
              - that row below is month-scoped, and matching its shape would
              imply these figures belong to the selected month too. */}
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
            {/* method is the STORED value and doubles as the React key. It
                was the English label before this change, which meant both
                chips remounted on a language switch. Nothing here is
                submitted - these are display figures. */}
            {accounts.map((a) => {
              const AccountIcon = a.kind === 'bank' ? Landmark : Coins;
              const method = a.name;
              const value = balancesByAccount[a.id] ?? 0;
              return (
              <span
                key={a.id}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                  padding: '0.38rem 0.8rem', borderRadius: 99,
                  backgroundColor: 'var(--mist)', border: '1px solid var(--line)',
                  whiteSpace: 'nowrap',
                }}
              >
                <AccountIcon size={15} style={{ color: 'var(--ink-soft)', flexShrink: 0 }} />
                <span style={{ fontSize: '0.8rem', color: 'var(--ink-soft)' }}>{method}</span>
                <span className="font-mono-tab" style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--ink)' }}>
                  {formatCurrency(value)}
                </span>
              </span>
              );
            })}
          </div>
        </div>

        {/* Formatted HERE rather than read from selectedMonthInfo.label:
            that label is built in stats.ts, which is shared with server code
            and cannot know the locale. The year and month numbers carry the
            same information and localize properly. */}
        <MonthNavigator
          label={formatMonthYear(selectedMonthInfo.year, selectedMonthInfo.month, locale)}
          canGoOlder={canGoOlder}
          canGoNewer={canGoNewer}
          onOlder={() => setSelectedMonthIndex((i) => i + 1)}
          onNewer={() => setSelectedMonthIndex((i) => i - 1)}
        />

        <div className="stat-tabs stat-tabs-five">
          <StatTab icon={Wallet} label={d.transactions.openingBalance} value={formatCurrency(openingBalance)} color="var(--ink-soft)" />
          <StatTab icon={Wallet} label={d.transactions.closingBalance} value={formatCurrency(closingBalance)} color="var(--pine)" />
          <StatTab icon={ArrowUpRight} label={d.transactions.deposits} value={formatCurrency(totalDeposits)} color="var(--pine)" />
          <StatTab icon={ArrowDownRight} label={d.transactions.withdrawals} value={formatCurrency(totalWithdrawals)} color="var(--wine)" />
          <StatTab icon={SlidersHorizontal} label={d.transactions.adjustments} value={adjustmentText} color={adjustmentColor} valueColor={adjustmentColor} />
        </div>
      </div>

      {/* Search and filters. */}
      <div className="card" style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{ position: 'relative' }}>
          <Search size={16} aria-hidden="true" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-soft)' }} />
          <input
            id="pb-txn-search"
            type="text"
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={d.txnSearch.placeholder}
            aria-label={d.txnSearch.placeholder}
            style={{
              width: '100%', boxSizing: 'border-box', padding: '0.65rem 2.6rem 0.65rem 2.3rem',
              borderRadius: '0.7rem', border: '1px solid var(--line)', fontSize: '0.9rem',
              color: 'var(--ink)', backgroundColor: 'var(--paper)',
            }}
          />
          {searching && (
            <button
              type="button" onClick={clearSearch} className="icon-btn" aria-label={d.txnSearch.clear} title={d.txnSearch.clear}
              style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', width: 30, height: 30, borderRadius: '50%', border: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <X size={15} />
            </button>
          )}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
          <div role="group" aria-label={d.txnSearch.typeLabel} style={{ display: 'flex', gap: '0.35rem' }}>
            {typeOptions.map((o) => {
              const on = typeFilter === o.value;
              return (
                <button
                  key={o.value} type="button" aria-pressed={on} onClick={() => setTypeFilter(o.value)}
                  style={{
                    padding: '0.4rem 0.8rem', borderRadius: 999, fontSize: '0.8rem', fontWeight: on ? 600 : 500,
                    border: `1px solid ${on ? 'var(--pine)' : 'var(--line)'}`,
                    backgroundColor: on ? 'var(--pine-soft)' : 'transparent',
                    color: on ? 'var(--pine)' : 'var(--ink-soft)',
                  }}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
          <div style={{ flex: '1 1 180px', minWidth: 0, maxWidth: 280 }}>
            <SelectField
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={categoryOptions}
              placeholder={d.txnSearch.allCategories}
              ariaLabel={d.txnSearch.categoryLabel}
            />
          </div>
        </div>
      </div>

      {searching ? (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <p role="status" style={{ fontSize: '0.78rem', color: 'var(--ink-soft)', padding: '0.9rem 1.5rem', margin: 0, borderBottom: '1px solid var(--line)' }}>
            {results.length === 1 ? d.txnSearch.resultsOne : t(d.txnSearch.results, { count: results.length })}
            {' · '}{d.txnSearch.scope}
          </p>
          {results.length === 0 ? (
            <p style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', textAlign: 'center', padding: '2rem 1.5rem', margin: 0 }}>{d.txnSearch.empty}</p>
          ) : (
            results.map((e) => (
              <StatementRow
                key={e.record.id}
                txn={e.record}
                balancesAfter={e.balancesAfter}
                accounts={accounts}
                totalBalanceAfter={e.totalBalanceAfter}
                onOpenDetail={setSelectedTransaction}
                categoryMeta={categoryMeta}
              />
            ))
          )}
        </div>
      ) : (
        <StatementList
          entries={monthEntries}
          openingBalance={openingBalance}
          accounts={accounts}
          categoryMeta={categoryMeta}
          onOpenDetail={setSelectedTransaction}
        />
      )}

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
