'use client';

import { RollingAmount } from '@/components/shared/RollingAmount';
import { useMemo, type ReactNode } from 'react';
import { ArrowRightLeft, CalendarX2 } from 'lucide-react';
import type { CategoryMeta, LedgerRecord } from '@/types';
import type { LedgerEntry } from '@/lib/stats';
import { formatCurrency, formatDate, parseLocalDate } from '@/lib/format';
import { INTL_LOCALE } from '@/lib/i18n/locale';
import { StatementRow } from '@/components/shared/StatementRow';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { renderTemplate } from '@/lib/i18n/RichText';
import { EmptyState } from '@/components/kit/EmptyState';
import { BalanceFigure } from './BalanceFigure';
import { balanceReader, cents, daysInMonth, groupByDay, monthBounds, type DayGroup, type StatementPayoff } from './statementMath';

// A ledger entry with its full transaction record resolved — recentTransactions
// entries are deliberately lightweight (just balances + an id), so the page
// resolves each back to its full record before handing entries down here.
import type { Account } from '@/lib/data/mappers';

export interface StatementEntry extends LedgerEntry {
  record: LedgerRecord;
}

interface StatementListProps {
  entries: StatementEntry[];
  payoffs?: StatementPayoff[];
  openingBalance: number;
  /** Passed through to StatementRow for per-account balance names. */
  accounts: Account[];
  categoryMeta: CategoryMeta;
  onOpenDetail: (txn: LedgerRecord) => void;
  // Optional, for the day-grouped statement. Without them the list still
  // groups by day but shows no bookends.
  closingBalance?: number;
  /** The month shown (zero-based month), for the bookend dates. */
  monthInfo?: { year: number; month: number };
  /** Zone-aware today ('YYYY-MM-DD'), once known after mount; null before. */
  today?: string | null;
  /** Account lens: rows and end-of-day figures follow this account's own balance. */
  lensAccountId?: string | null;
  /** Rendered at the top of the card (title, actions). */
  head?: ReactNode;
  id?: string;
}

/** Today / Yesterday / weekday, and the short date, for a day header. */
function useDayLabel(today: string | null | undefined) {
  const { d, locale } = useTranslation();
  const yesterday = useMemo(() => {
    if (!today) return null;
    const t = parseLocalDate(today);
    t.setDate(t.getDate() - 1);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  }, [today]);
  return (date: string) => {
    const day = parseLocalDate(date);
    const relative = date === today ? d.ux.transactions.today : date === yesterday ? d.ux.transactions.yesterday : null;
    return {
      long: relative ?? day.toLocaleDateString(INTL_LOCALE[locale], { weekday: 'long' }),
      short: relative ?? day.toLocaleDateString(INTL_LOCALE[locale], { weekday: 'short' }),
      date: formatDate(date, locale),
    };
  };
}

/** A signed money figure: '+' for money in, formatCurrency's minus for out, plain zero. */
export function SignedAmount({ value, className = '' }: { value: number; className?: string }) {
  const c = cents(value);
  const tone = c > 0 ? 'pb-txn-pos' : c < 0 ? 'pb-txn-neg' : 'pb-txn-zero';
  return (
    <span className={`font-mono-tab ${tone}${className ? ` ${className}` : ''}`}>
      {c > 0 ? '+' : ''}<RollingAmount value={formatCurrency(c / 100)} />
    </span>
  );
}

export function PayoffRow({ payoff, cardName, showDate = false }: {
  payoff: StatementPayoff;
  cardName?: string;
  showDate?: boolean;
}) {
  const { d, locale } = useTranslation();
  const x = d.ux.transactions;
  const onCard = payoff.side === 'card';
  const date = showDate ? formatDate(payoff.date, locale) : '';
  const note = onCard ? date : [cardName ?? payoff.cardName, date].filter(Boolean).join(' · ');
  return (
    <div className="pb-txn-srow-main pb-txn-card-payoff" data-credit-payoff="">
      <div className="pb-txn-srow-lead">
        <span className="pb-txn-card-payoff-icon"><ArrowRightLeft size={16} aria-hidden="true" /></span>
        <span className="pb-txn-card-payoff-copy">
          <span>{x.cardPayoff}</span>
          {note && <span className="pb-txn-card-payoff-note">{note}</span>}
        </span>
      </div>
      <div className="pb-txn-card-payoff-balance">
        <span className="font-mono-tab"><RollingAmount value={formatCurrency(onCard ? payoff.amount : -payoff.amount)} /></span>
        {onCard && (
          <span className="pb-txn-card-payoff-note">
            {renderTemplate(x.cardPayoffRemaining, {
              amount: <span className="font-mono-tab"><RollingAmount value={formatCurrency(payoff.remainingBalance)} /></span>,
            })}
          </span>
        )}
      </div>
    </div>
  );
}

interface DayGroupsProps {
  groups: DayGroup[];
  /** statement: headers carry the end-of-day balance; results: the net of the matches only. */
  mode: 'statement' | 'results';
  accounts: Account[];
  categoryMeta: CategoryMeta;
  onOpenDetail: (txn: LedgerRecord) => void;
  today?: string | null;
  lensAccountId?: string | null;
  highlight?: string;
}

/**
 * Days, newest first, each under a header that sticks below the glass page
 * header (and below the search bar where that sticks too) while its rows
 * scroll. Every row is a full StatementRow: balance after, breakdown, detail.
 * Each group carries data-day so the balance chart can scroll to it.
 */
export function DayGroups({ groups, mode, accounts, categoryMeta, onOpenDetail, today, lensAccountId, highlight }: DayGroupsProps) {
  const { d } = useTranslation();
  const label = useDayLabel(today);
  // A card lens reads as owed, like every other figure under it.
  const owed = !!lensAccountId && accounts.some((a) => a.id === lensAccountId && a.kind === 'credit');
  return (
    <>
      {groups.map((g) => {
        const l = label(g.date);
        return (
          <section key={g.date} className="pb-txn-day" data-day={g.date} aria-label={`${l.long} ${l.date}`}>
            <div className="pb-txn-day-head">
              <span className="pb-txn-day-label">
                <span className="pb-txn-day-long">{l.long}</span>
                <span className="pb-txn-day-short">{l.short}</span>
                <span className="pb-txn-day-date pb-tnum">{l.date}</span>
              </span>
              <span className="pb-txn-day-figs">
                {g.hasFlows && <SignedAmount value={g.net} />}
                {mode === 'statement' && g.endBalance !== null && (
                  <span className="pb-txn-day-eod">
                    {renderTemplate(d.ux.transactions.endOfDay, {
                      amount: <BalanceFigure value={g.endBalance} owed={owed} />,
                    })}
                  </span>
                )}
              </span>
            </div>
            {g.items.map((item) => item.kind === 'payoff' ? (
              <PayoffRow key={`payoff-${item.id}`} payoff={item.payoff}
                cardName={accounts.find(account => account.id === item.payoff.cardId)?.name}
              />
            ) : (
              <StatementRow
                key={item.id} txn={item.entry.record}
                balancesAfter={item.entry.balancesAfter} accounts={accounts} totalBalanceAfter={item.entry.totalBalanceAfter}
                onOpenDetail={onOpenDetail} categoryMeta={categoryMeta}
                showDate={false} keyboard ledger highlight={highlight}
                lensAccountId={lensAccountId ?? undefined}
              />
            ))}
          </section>
        );
      })}
    </>
  );
}

/**
 * The ledger's column headings, on the same grid as the rows. Displayed only
 * where the statement is wide enough for the ledger grid (container query).
 */
export function LedgerHead({ lensAccount }: { lensAccount?: Account | null }) {
  const { d } = useTranslation();
  const x = d.ux.transactions;
  return (
    <div className={`pb-txn-srow-main pb-txn-srow-headrow${lensAccount ? ' pb-txn-srow-lens' : ''}`} aria-hidden="true">
      <div className="pb-txn-srow-lead">{x.colTransaction}</div>
      <div className="pb-txn-srow-cat">{x.colCategory}</div>
      {!lensAccount && <div className="pb-txn-srow-acct">{x.colAccount}</div>}
      <div className="pb-txn-srow-money">
        <div>{x.colAmount}</div>
        {lensAccount && <div className="pb-txn-srow-lensbal">{lensAccount.name}</div>}
        <div className="pb-txn-srow-balcell">{lensAccount ? x.colTotal : x.colBalance}</div>
      </div>
    </div>
  );
}

export function StatementList({
  entries, payoffs, openingBalance, accounts, categoryMeta, onOpenDetail,
  closingBalance, monthInfo, today, lensAccountId, head, id,
}: StatementListProps) {
  const { d, t, locale } = useTranslation();
  const groups = useMemo(() => {
    const ghostIds = new Set(accounts.filter(account => account.isGhost).map(account => account.id));
    return groupByDay(entries, balanceReader(lensAccountId ?? null), lensAccountId, payoffs, ghostIds);
  }, [entries, lensAccountId, payoffs, accounts]);
  const lensAccount = lensAccountId ? accounts.find((a) => a.id === lensAccountId) ?? null : null;
  const owed = lensAccount?.kind === 'credit';

  // Bookends turn the list into a statement: the closing figure on top (as
  // of today in the month in progress), the opening at the foot.
  let bookends: { closingDate: string; openingDate: string } | null = null;
  if (monthInfo && closingBalance !== undefined) {
    const { start, prefix } = monthBounds(monthInfo.year, monthInfo.month);
    const last = `${prefix}${String(daysInMonth(monthInfo.year, monthInfo.month)).padStart(2, '0')}`;
    const closingDate = today && today.startsWith(prefix) ? today : last;
    bookends = { closingDate, openingDate: start };
  }

  return (
    // overflow: clip, not hidden: it keeps the rounded corners clipping the
    // rows without making the card a scroll container, which would stop the
    // day headers inside it from sticking.
    <div id={id} className="card pb-txn-stmt" style={{ padding: 0, overflow: 'clip' }}>
      {head}
      {groups.length === 0 ? (
        <EmptyState
          icon={CalendarX2}
          title={d.transactions.noActivity}
          // The carried-forward amount is money: font-mono-tab so privacy
          // mode blurs it like every other figure (it used to be plain text).
          body={renderTemplate(d.transactions.carriedForward, {
            amount: <BalanceFigure value={openingBalance} owed={owed} />,
          })}
        />
      ) : (
        <div>
          <LedgerHead lensAccount={lensAccount} />
          {bookends && (
            <div className="pb-txn-bookend">
              <span>{t(d.ux.transactions.closingOn, { date: formatDate(bookends.closingDate, locale) })}</span>
              <span><BalanceFigure value={closingBalance ?? 0} owed={owed} /></span>
            </div>
          )}
          <DayGroups
            groups={groups} mode="statement" accounts={accounts} categoryMeta={categoryMeta}
            onOpenDetail={onOpenDetail} today={today} lensAccountId={lensAccountId}
          />
          {bookends && (
            <div className="pb-txn-bookend pb-txn-bookend-foot">
              <span>{t(d.ux.transactions.openingOn, { date: formatDate(bookends.openingDate, locale) })}</span>
              <span><BalanceFigure value={openingBalance} owed={owed} /></span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
