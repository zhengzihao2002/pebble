'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Wallet, CalendarCheck, ArrowUpRight, ArrowDownRight, Landmark, Coins, SlidersHorizontal, CreditCard, SearchX } from 'lucide-react';
import type { BalanceAdjustment, LedgerRecord, Transaction } from '@/types';
import type { CategoryItem } from '@/lib/data/mappers';
import type { LedgerEntry } from '@/lib/stats';
import { getLastNMonths } from '@/lib/stats';
import { buildCategoryMeta } from '@/lib/data/categoryMeta';
import { formatCurrency, formatMonthYear } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { categoryLabel } from '@/lib/i18n/enumLabels';
import { renderTemplate } from '@/lib/i18n/RichText';
import { useTimeZoneOverride } from '@/lib/time/TimeZoneOverrideContext';
import { resolveBrowserTimeZone } from '@/lib/time/timeZone';
import { todayInZone } from '@/lib/recurring/occurrences';
import { StatTab } from '@/components/shared/StatTab';
import { InfoTooltip } from '@/components/shared/InfoTooltip';
import type { SelectFieldOption } from '@/components/shared/SelectField';
import { MonthNavigator, type MonthChip } from '@/components/transactions/MonthNavigator';
import { StatementList, DayGroups, LedgerHead, type StatementEntry } from '@/components/transactions/StatementList';
import { TodayLedger } from '@/components/transactions/TodayLedger';
import { BalanceBridge } from '@/components/transactions/BalanceBridge';
import { MonthBalanceChart } from '@/components/transactions/MonthBalanceChart';
import { SearchToolbar, type TypeFilter } from '@/components/transactions/SearchToolbar';
import { ResultsSummary } from '@/components/transactions/ResultsSummary';
import { cents, daySeries, daysInMonth, groupByDay, monthBounds, monthFigures, summarizeMonths, balanceReader } from '@/components/transactions/statementMath';
import type { Account } from '@/lib/data/mappers';
import { TransactionDetailModal } from '@/components/modals/TransactionDetailModal';
import { ImportCsvButton } from '@/components/shared/ImportCsv';
import { DeltaChip } from '@/components/kit/DeltaChip';
import { EmptyState } from '@/components/kit/EmptyState';

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

// Not '' - a category can never be named this, and '' is what SelectField's
// plain mode treats as "nothing chosen".
const ALL_ACCOUNTS = '__all__';
// today only needs reading, not watching: a page left open past midnight
// picks the new date up on its next render, like the month list does.
const noSubscribe = () => () => {};

export function TransactionsClient({
  transactions, adjustments, ledger, categories, budgets, accountOpeningTotal, currentBalance, accounts, balancesByAccount,
}: TransactionsClientProps) {
  const { d, t, locale } = useTranslation();
  const x = d.ux.transactions;
  const categoryMeta = useMemo(() => buildCategoryMeta(categories, budgets), [categories, budgets]);

  const [selectedMonthIndex, setSelectedMonthIndex] = useState(0); // 0 = current month
  // The whole ledger entry, not only the record: the detail dialog shows
  // where the record sits in the running balance.
  const [selectedEntry, setSelectedEntry] = useState<StatementEntry | null>(null);
  // Month changes slide the statement in from the side the month came from.
  const [slide, setSlide] = useState<'older' | 'newer' | null>(null);

  // Search and filters. Client only: they run over the ledger already on the
  // page, so nothing is fetched.
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [accountFilter, setAccountFilter] = useState(ALL_ACCOUNTS);

  // Zone-aware today. The server cannot know the viewer's zone, so the
  // server snapshot is null and the client reads it after hydration (a clock
  // read during render would mismatch). A 'YYYY-MM-DD' string, so it compares
  // stably between renders. Used for the "Today"/"Yesterday" day headers and
  // to stop the balance chart at today.
  const timeZoneOverride = useTimeZoneOverride();
  const today = useSyncExternalStore(
    noSubscribe,
    () => todayInZone(timeZoneOverride ?? resolveBrowserTimeZone()),
    () => null,
  );

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
  const entriesById = useMemo(() => new Map(entriesWithRecords.map((e) => [e.record.id, e])), [entriesWithRecords]);
  const openDetail = useCallback((txn: LedgerRecord) => {
    setSelectedEntry(entriesById.get(txn.id) ?? { transId: txn.id, record: txn, balancesAfter: {}, totalBalanceAfter: 0 });
  }, [entriesById]);

  // ---- Accounts ------------------------------------------------------------
  // Account names are USER DATA. ONE ordering for the Today ledger and the
  // Account filter (it used to be written twice): starred first, then bank
  // and cash by highest balance, then credit cards by most owed.
  const sortedAccounts = useMemo(() => {
    const rank = (a: Account) => (a.isPreferred ? 0 : a.kind === 'credit' ? 2 : 1);
    return [...accounts].sort((x, y) => {
      const bx = balancesByAccount[x.id] ?? 0;
      const by = balancesByAccount[y.id] ?? 0;
      if (rank(x) !== rank(y)) return rank(x) - rank(y);
      // Cards hold negative balances: most owed = lowest balance.
      return x.kind === 'credit' ? bx - by : by - bx;
    });
  }, [accounts, balancesByAccount]);

  const accountOptions: SelectFieldOption[] = useMemo(() => [
    { value: ALL_ACCOUNTS, label: d.txnSearch.allAccounts },
    ...sortedAccounts.map((a) => ({
      value: a.id,
      label: `${a.name}${a.last4 ? ` ····${a.last4}` : ''}${a.isPreferred ? ' ★' : ''}`,
      icon: a.kind === 'credit' ? CreditCard : a.kind === 'bank' ? Landmark : Coins,
    })),
  ], [sortedAccounts, d]);

  // ---- Search --------------------------------------------------------------
  // Runs over the month shown in the navigator, so every result keeps a
  // correct "balance after". Older records: the command palette.
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
  // ACCOUNT LENS: an account chosen with no text and type All shows that
  // account's own statement (its opening, closing and flows, day groups with
  // its running balance) instead of a results list. The rows are the same
  // ones the account-only filter used to list under a results line; any text
  // or type filter goes back to results mode, filtered by the account.
  const lensId = accountFilter !== ALL_ACCOUNTS && q === '' && typeFilter === 'all' && accounts.some((a) => a.id === accountFilter)
    ? accountFilter
    : null;
  const lensAccount = useMemo(() => (lensId ? accounts.find((a) => a.id === lensId) ?? null : null), [accounts, lensId]);
  const searching = q !== '' || typeFilter !== 'all' || (accountFilter !== ALL_ACCOUNTS && !lensAccount);
  const { prefix: monthPrefix } = monthBounds(selectedMonthInfo.year, selectedMonthInfo.month);

  const fig = useMemo(
    () => monthFigures(entriesWithRecords, selectedMonthInfo.year, selectedMonthInfo.month, accountOpeningTotal, lensId),
    [entriesWithRecords, selectedMonthInfo, accountOpeningTotal, lensId],
  );
  const { opening: openingBalance, closing: closingBalance, deposits: totalDeposits, withdrawals: totalWithdrawals, adjustments: totalAdjustments } = fig;

  // Sign written explicitly against Math.abs, as TransactionDetailModal
  // does, so there is exactly one sign glyph whatever formatCurrency does
  // with negatives. Rounded to cents first so float residue from a transfer
  // pair or a set of corrections can never print as a signed zero.
  const adjustmentCents = cents(totalAdjustments);
  const adjustmentSign = adjustmentCents > 0 ? '+' : adjustmentCents < 0 ? '-' : '';
  const adjustmentText = `${adjustmentSign}${formatCurrency(Math.abs(adjustmentCents) / 100)}`;
  const adjustmentColor = adjustmentCents > 0 ? 'var(--pine)' : adjustmentCents < 0 ? 'var(--wine)' : 'var(--ink-soft)';

  // A credit card's statement reads as what it owes, like the Today ledger.
  const lensIsCard = lensAccount?.kind === 'credit';
  const balanceText = (v: number) => formatCurrency(lensIsCard ? Math.max(0, -v) : v);

  const canGoOlder = selectedMonthIndex < monthOptions.length - 1;
  const canGoNewer = selectedMonthIndex > 0;
  const goToMonth = useCallback((i: number) => {
    setSelectedMonthIndex((cur) => {
      if (i === cur || i < 0 || i >= monthOptions.length) return cur;
      setSlide(i > cur ? 'older' : 'newer');
      return i;
    });
  }, [monthOptions.length]);

  // Optional page shortcuts: [ older month, ] newer. Gated exactly like
  // AppShell's single-key shortcuts: no modifier, no key repeat, not during
  // IME composition, not while typing, not while any dialog is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || e.keyCode === 229 || e.defaultPrevented || e.repeat) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key !== '[' && e.key !== ']') return;
      if (document.querySelector('.pebble-root [role="dialog"]')) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || target.closest('input, textarea, select, [contenteditable="true"], [role="combobox"]'))) return;
      e.preventDefault();
      setSelectedMonthIndex((cur) => {
        const next = e.key === '[' ? Math.min(monthOptions.length - 1, cur + 1) : Math.max(0, cur - 1);
        if (next !== cur) setSlide(next > cur ? 'older' : 'newer');
        return next;
      });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [monthOptions.length]);

  // ---- Month strip -----------------------------------------------------------
  const monthChips: MonthChip[] = useMemo(() => {
    const sums = summarizeMonths(entriesWithRecords, monthOptions, accountOpeningTotal, lensId);
    return sums.map((m, index) => ({ ...m, index })).reverse();
  }, [entriesWithRecords, monthOptions, accountOpeningTotal, lensId]);

  // ---- Balance chart ---------------------------------------------------------
  const chartPoints = useMemo(() => {
    if (!today) return null;
    const { year, month } = selectedMonthInfo;
    const { start, next, prefix } = monthBounds(year, month);
    // The month in progress stops at today: the chart never projects.
    const lastDay = today.startsWith(prefix) ? Number(today.slice(8, 10)) : daysInMonth(year, month);
    const allInMonth = entriesWithRecords.filter((e) => e.record.date >= start && e.record.date < next);
    return daySeries(fig.entries, allInMonth, year, month, lastDay, fig.opening, balanceReader(lensId));
  }, [today, selectedMonthInfo, entriesWithRecords, fig, lensId]);

  // Picking a day on the chart scrolls the statement to that day's group
  // (scroll-margin keeps it clear of the sticky header and search bar) and
  // washes it once in the brand tint. Smooth unless the viewer asked for
  // reduced motion.
  const pickDay = useCallback((date: string) => {
    const group = document.querySelector<HTMLElement>(`.pb-txn-stmt [data-day="${date}"]`);
    if (!group) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    group.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    group.classList.remove('pb-txn-day-pulse');
    void group.offsetWidth; // restart the animation if the same day is picked twice
    group.classList.add('pb-txn-day-pulse');
    window.setTimeout(() => group.classList.remove('pb-txn-day-pulse'), 1900);
  }, []);

  const results = useMemo(() => {
    if (!searching) return [];
    return entriesWithRecords.filter((e) => {
      const r = e.record;
      if (!r.date.startsWith(monthPrefix)) return false;
      if (typeFilter !== 'all' && r.type !== typeFilter) return false;
      if (accountFilter !== ALL_ACCOUNTS && r.accountId !== accountFilter) return false;
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
  }, [searching, entriesWithRecords, typeFilter, accountFilter, monthPrefix, q, qAmount, amountQuery, accountNames, d]);
  // An account filter alongside text or a type keeps the account's own
  // balance line on each row.
  const resultsLensId = accountFilter !== ALL_ACCOUNTS ? accountFilter : null;
  const resultGroups = useMemo(() => groupByDay(results, (e) => e.totalBalanceAfter), [results]);

  const clearFilters = () => {
    setQuery('');
    setTypeFilter('all');
    setAccountFilter(ALL_ACCOUNTS);
  };

  // A ledger row in the Today card opens that account's statement; pressing
  // the open one again returns to all accounts. On a phone the statement is
  // far below, so it is brought into view.
  const pickAccount = (id: string) => {
    const next = accountFilter === id ? ALL_ACCOUNTS : id;
    setAccountFilter(next);
    if (next === ALL_ACCOUNTS) return;
    const stmt = document.getElementById('pb-txn-statement-col');
    if (stmt && stmt.getBoundingClientRect().top > window.innerHeight * 0.6) {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      stmt.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }
  };

  // The search bar sticks under the header from 640px; the day headers stick
  // under both, so its live height is published for them.
  const barRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const bar = barRef.current;
    const main = mainRef.current;
    if (!bar || !main || typeof ResizeObserver === 'undefined') return;
    const write = () => main.style.setProperty('--pb-txn-bar-h', `${bar.offsetHeight}px`);
    write();
    const ro = new ResizeObserver(write);
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);

  // Formatted HERE rather than read from selectedMonthInfo.label: that label
  // is built in stats.ts, which is shared with server code and cannot know
  // the locale. The year and month numbers carry the same information and
  // localize properly.
  const monthLabel = formatMonthYear(selectedMonthInfo.year, selectedMonthInfo.month, locale);
  const delta = cents(closingBalance - openingBalance) / 100;
  const deltaText = `${delta > 0 ? '+' : ''}${formatCurrency(delta)}`;
  const statementCount = fig.entries.length;

  const importButton = <ImportCsvButton preview={{ entries: entriesWithRecords, transactions, adjustments, accounts, categoryMeta }} />;
  const monthKey = `${selectedMonthInfo.year}-${selectedMonthInfo.month}-${lensId ?? ''}-${searching ? 's' : ''}`;
  const slideClass = slide ? ` pb-txn-slide-${slide}` : '';

  return (
    <div className="pb-txn-page">
      {/* The side rail on a wide Mac (sticky, its own 'content' container so
          the five-figure tiers and the ledger stacking follow the rail's
          width); simply the top of the page everywhere else. */}
      <div className="pb-txn-rail themed-scroll">
        <TodayLedger
          currentBalance={currentBalance}
          accounts={sortedAccounts}
          balancesByAccount={balancesByAccount}
          selectedAccountId={lensId}
          onPickAccount={pickAccount}
        />

        <section className="card pb-txn-month" aria-label={monthLabel}>
          <MonthNavigator
            label={monthLabel}
            canGoOlder={canGoOlder}
            canGoNewer={canGoNewer}
            onOlder={() => goToMonth(selectedMonthIndex + 1)}
            onNewer={() => goToMonth(selectedMonthIndex - 1)}
            months={monthChips}
            selectedIndex={selectedMonthIndex}
            onSelect={goToMonth}
            controls="pb-txn-statement-col"
            eyebrow={lensAccount ? t(x.lensEyebrow, { account: lensAccount.name }) : x.thisMonth}
            aside={(
              <span className="pb-txn-delta">
                {renderTemplate(x.deltaThisMonth, {
                  amount: <DeltaChip delta={lensIsCard ? -delta : delta} text={deltaText} good="up" money />,
                })}
              </span>
            )}
          />

          <BalanceBridge
            opening={openingBalance}
            deposits={totalDeposits}
            withdrawals={totalWithdrawals}
            adjustments={totalAdjustments}
            closing={closingBalance}
          />

          {/* Exactly five tiles, in this order: the tier layout counts them.
              Closing has its own icon now, so it no longer looks like Opening. */}
          <div className="stat-tabs stat-tabs-five">
            <StatTab icon={Wallet} label={d.transactions.openingBalance} value={balanceText(openingBalance)} sublabel={lensIsCard ? d.accountsPage.cardOwed : undefined} color="var(--ink-soft)" />
            <StatTab icon={CalendarCheck} label={d.transactions.closingBalance} value={balanceText(closingBalance)} sublabel={lensIsCard ? d.accountsPage.cardOwed : undefined} color="var(--pine)" />
            <StatTab icon={ArrowUpRight} label={d.transactions.deposits} value={formatCurrency(totalDeposits)} color="var(--pine)" />
            <StatTab icon={ArrowDownRight} label={d.transactions.withdrawals} value={formatCurrency(totalWithdrawals)} color="var(--wine)" />
            <StatTab
              icon={SlidersHorizontal} label={d.transactions.adjustments} value={adjustmentText} color={adjustmentColor} valueColor={adjustmentColor}
              info={lensAccount ? <InfoTooltip label={x.lensAdjInfoLabel}>{x.lensAdjInfo}</InfoTooltip> : undefined}
            />
          </div>
        </section>

        <MonthBalanceChart
          points={chartPoints}
          opening={openingBalance}
          hasActivity={statementCount > 0}
          onPickDay={pickDay}
          subtitle={lensAccount ? `${monthLabel} · ${lensAccount.name}` : monthLabel}
        />
      </div>

      <div className="pb-txn-main" id="pb-txn-statement-col" ref={mainRef}>
        <SearchToolbar
          ref={barRef}
          query={query}
          onQuery={setQuery}
          typeFilter={typeFilter}
          onTypeFilter={setTypeFilter}
          accountFilter={accountFilter}
          onAccountFilter={setAccountFilter}
          accountOptions={accountOptions}
          lensAccount={lensAccount}
          onExitLens={() => setAccountFilter(ALL_ACCOUNTS)}
        />

        <div key={monthKey} className={`pb-txn-swap${slideClass}`}>
          {searching ? (
            <div className="card pb-txn-stmt" style={{ padding: 0, overflow: 'clip' }}>
              <div className="pb-txn-stmt-head">
                <p role="status" className="pb-txn-results-line">
                  {results.length === 1 ? d.txnSearch.resultsOne : t(d.txnSearch.results, { count: results.length })}
                  {' · '}{monthLabel}
                </p>
                {importButton}
              </div>
              {results.length === 0 ? (
                <EmptyState
                  icon={SearchX}
                  title={d.txnSearch.empty}
                  body={<>{x.noMatchBody}<span className="pb-txn-older-hint"> {x.olderHint}</span></>}
                  action={<button type="button" className="pill" onClick={clearFilters}>{x.clearFilters}</button>}
                />
              ) : (
                <>
                  <ResultsSummary results={results} categoryMeta={categoryMeta} />
                  <LedgerHead lensAccount={resultsLensId ? accounts.find((a) => a.id === resultsLensId) ?? null : null} />
                  <DayGroups
                    groups={resultGroups} mode="results" accounts={accounts} categoryMeta={categoryMeta}
                    onOpenDetail={openDetail} today={today} lensAccountId={resultsLensId} highlight={q || undefined}
                  />
                </>
              )}
            </div>
          ) : (
            <StatementList
              entries={fig.entries}
              openingBalance={openingBalance}
              closingBalance={closingBalance}
              monthInfo={selectedMonthInfo}
              today={today}
              lensAccountId={lensId}
              accounts={accounts}
              categoryMeta={categoryMeta}
              onOpenDetail={openDetail}
              head={(
                <div className="pb-txn-stmt-head">
                  <div style={{ minWidth: 0 }}>
                    <h3 className="pb-txn-stmt-title">{lensAccount ? t(x.lensTitle, { account: lensAccount.name }) : x.statement}</h3>
                    <p className="pb-txn-stmt-sub">
                      {monthLabel} · <span className="pb-tnum">{statementCount === 1 ? x.countOne : t(x.countOther, { count: statementCount })}</span>
                    </p>
                  </div>
                  {importButton}
                </div>
              )}
            />
          )}
        </div>
      </div>

      {selectedEntry && (
        <TransactionDetailModal
          txn={selectedEntry.record}
          onClose={() => setSelectedEntry(null)}
          categoryMeta={categoryMeta}
          ledgerEntry={selectedEntry ?? undefined}
        />
      )}
    </div>
  );
}
