'use client';

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { BalanceAdjustment, ExpenseTransaction, IncomeTransaction } from '@/types';
import type { Account } from '@/lib/data/mappers';
import { computeRecentTransactions } from '@/lib/stats';
import { formatDate } from '@/lib/format';
import { todayInZone } from '@/lib/recurring/occurrences';
import { resolveBrowserTimeZone } from '@/lib/time/timeZone';
import { useTimeZoneOverride } from '@/lib/time/TimeZoneOverrideContext';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { AccountCards } from '@/components/accounts/AccountCards';
import { AccountsHero } from '@/components/accounts/AccountsHero';
import { MoneyMixCard } from '@/components/accounts/MoneyMixCard';
import { FlowCalendar } from '@/components/accounts/FlowCalendar';
import { AccountDetailSheet } from '@/components/accounts/AccountDetailSheet';
import { PayOffDialog } from '@/components/accounts/PayOffDialog';
import { SelfTransferDialog } from '@/components/accounts/SelfTransferDialog';
import { TransferModal } from '@/components/modals/TransferModal';
import { PeriodLink } from '@/components/shared/PeriodLink';
import { Skeleton } from '@/components/kit/Skeleton';
import { buildDays, isRange, periodWords, rangeStart, shownAccounts, type DayPoint as AccountDayPoint, type Range } from '@/components/accounts/accountMath';

export type DayPoint = AccountDayPoint;

// The chosen range is a per-viewer convenience (1Y sticks between visits),
// so it lives in this browser only; storage that throws or is empty falls
// back to the 6M default.
const RANGE_KEY = 'pebble-accounts-range';
const readRange = (): Range | null => {
  try {
    const v = window.localStorage.getItem(RANGE_KEY);
    return isRange(v) ? v : null;
  } catch { return null; }
};
const onStorage = (cb: () => void) => {
  window.addEventListener('storage', cb);
  return () => window.removeEventListener('storage', cb);
};

interface AccountsClientProps {
  expenses: ExpenseTransaction[];
  income: IncomeTransaction[];
  adjustments: BalanceAdjustment[];
  accounts: Account[];
}

export function AccountsClient({ expenses, income, adjustments, accounts }: AccountsClientProps) {
  const { d, t, locale } = useTranslation();
  // The server and the hydrating render see no stored range (6M); the
  // stored one applies right after, without a render-time storage read.
  const storedRange = useSyncExternalStore(onStorage, readRange, () => null);
  const [picked, setPicked] = useState<Range | null>(null);
  const range: Range = picked ?? storedRange ?? '6m';
  // The credit card being paid off, if any.
  const [payOffCard, setPayOffCard] = useState<(typeof accounts)[number] | null>(null);
  const [selfOpen, setSelfOpen] = useState(false);
  const [detail, setDetail] = useState<Account | null>(null);
  const [transferFrom, setTransferFrom] = useState<string | null>(null);

  // Zone-aware 'YYYY-MM-DD', resolved in the browser like the other pages.
  const timeZoneOverride = useTimeZoneOverride();
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => {
    setToday(todayInZone(timeZoneOverride ?? resolveBrowserTimeZone()));
  }, [timeZoneOverride]);

  const pickRange = useCallback((r: Range) => {
    setPicked(r);
    try { window.localStorage.setItem(RANGE_KEY, r); } catch { /* not remembered, still applied */ }
  }, []);

  // The Transactions page's own ledger walk, oldest first, with each record's date.
  const chrono = useMemo(() => {
    const dateById = new Map<string, string>();
    for (const r of [...expenses, ...income, ...adjustments]) dateById.set(r.id, r.date);
    return [...computeRecentTransactions(expenses, income, accounts, adjustments)]
      .reverse()
      .map((e) => ({ date: dateById.get(e.transId) ?? '', total: e.totalBalanceAfter, byAccount: e.balancesAfter }));
  }, [expenses, income, adjustments, accounts]);

  // One point per day from the range's first day to today: the balance at
  // the end of that day, carried forward on days with no records.
  const days: DayPoint[] | null = useMemo(() => {
    if (!today) return null;
    return buildDays(chrono, today, rangeStart(range, today, chrono));
  }, [chrono, today, range]);

  // Each account's latest record up to today: expenses, income, transfers and corrections.
  const lastActivity = useMemo(() => {
    const map = new Map<string, string>();
    if (!today) return map;
    for (const r of [...expenses, ...income, ...adjustments]) {
      if (r.date > today) continue;
      const prev = map.get(r.accountId);
      if (!prev || r.date > prev) map.set(r.accountId, r.date);
    }
    return map;
  }, [expenses, income, adjustments, today]);

  const words = periodWords(d, t, range, days && days.length > 0 ? formatDate(days[0].date, locale) : '');
  const current = days && days.length > 0 ? days[days.length - 1].total : null;

  // Transfers whose two halves landed on one account (after records were moved
  // between the two accounts of a transfer). They cancel out. Found from data
  // this page already loads - no extra request.
  const selfPairs = useMemo(() => {
    const byGroup = new Map<string, typeof adjustments>();
    for (const r of adjustments) {
      if (!r.transferGroupId) continue;
      const list = byGroup.get(r.transferGroupId) ?? [];
      list.push(r);
      byGroup.set(r.transferGroupId, list);
    }
    return [...byGroup.entries()]
      .filter(([, l]) => l.length === 2 && l[0].accountId === l[1].accountId && Math.abs(l[0].amount + l[1].amount) < 0.005)
      .map(([groupId, l]) => ({
        groupId, accountId: l[0].accountId, date: l[0].date,
        description: (l.find((x) => x.amount > 0) ?? l[0]).description,
        amount: Math.abs(l[0].amount),
      }));
  }, [adjustments]);
  const balanceNow = useMemo<Record<string, number>>(() => (days && days.length > 0 ? days[days.length - 1].byAccount : {}), [days]);
  const items = useMemo(() => shownAccounts(accounts, balanceNow), [accounts, balanceNow]);

  const periodChip = <PeriodLink label={words.cardsPeriod} control="accounts" />;

  return (
    <div className="pb-accounts">
      <AccountsHero
        days={days} hasRecords={chrono.length > 0} hasAccounts={accounts.length > 0}
        range={range} onRange={pickRange} words={words}
        selfCount={selfPairs.length} onReviewSelf={() => setSelfOpen(true)}
      />

      {!days ? (
        // Shapes of what is coming while today resolves; decorative.
        <div className="pb-accounts-skel" aria-hidden="true">
          <Skeleton height="9.5rem" radius="var(--pb-radius-lg)" />
          <div className="pb-accounts-skel-tiles">
            {[0, 1, 2].map((k) => <Skeleton key={k} height="13.5rem" radius="var(--pb-radius-lg)" />)}
          </div>
        </div>
      ) : (
        <>
          {current !== null && <MoneyMixCard items={items} total={current} />}
          {current !== null && today && (
            <AccountCards
              accounts={accounts} days={days} total={current} lastActivity={lastActivity}
              period={words.period} onPayOff={setPayOffCard} expenses={expenses}
              today={today} onOpen={setDetail} changeOver={words.changeOver} sparkLabel={words.sparkLabel}
              periodChip={periodChip}
            />
          )}
          {today && chrono.length > 0 && (
            <FlowCalendar key={range} days={days} expenses={expenses} income={income} today={today} periodChip={periodChip} />
          )}
        </>
      )}

      {detail && days && today && (
        <AccountDetailSheet
          account={detail} accounts={accounts} days={days}
          expenses={expenses} income={income} adjustments={adjustments}
          today={today} lastActivity={lastActivity.get(detail.id)} rangeLabel={words.changeOver}
          onClose={() => setDetail(null)}
          onTransfer={(a) => setTransferFrom(a.id)}
          onPayOff={setPayOffCard}
        />
      )}
      {transferFrom && (
        <TransferModal initialFromId={transferFrom} balances={balanceNow} onClose={() => setTransferFrom(null)} />
      )}
      {selfOpen && (
        <SelfTransferDialog pairs={selfPairs} accounts={accounts} balances={balanceNow} onClose={() => setSelfOpen(false)} />
      )}
      {payOffCard && (
        <PayOffDialog
          card={payOffCard} allAccounts={accounts}
          charges={expenses.filter((x) => x.accountId === payOffCard.id)}
          today={today ?? undefined}
          onClose={() => setPayOffCard(null)}
        />
      )}
    </div>
  );
}
