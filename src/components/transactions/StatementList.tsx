'use client';

import { useMemo, type ReactNode } from 'react';
import { CalendarX2 } from 'lucide-react';
import type { CategoryMeta, LedgerRecord } from '@/types';
import type { LedgerEntry } from '@/lib/stats';
import { formatCurrency, formatDate, parseLocalDate } from '@/lib/format';
import { INTL_LOCALE } from '@/lib/i18n/locale';
import { StatementRow } from '@/components/shared/StatementRow';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { renderTemplate } from '@/lib/i18n/RichText';
import { EmptyState } from '@/components/kit/EmptyState';
import { balanceReader, cents, daysInMonth, groupByDay, monthBounds, type DayGroup } from './statementMath';

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
      {c > 0 ? '+' : ''}{formatCurrency(c / 100)}
    </span>
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
                {mode === 'statement' && (
                  <span className="pb-txn-day-eod">
                    {renderTemplate(d.ux.transactions.endOfDay, {
                      amount: <span className="font-mono-tab">{formatCurrency(g.endBalance)}</span>,
                    })}
                  </span>
                )}
              </span>
            </div>
            {g.entries.map((e) => (
              <StatementRow
                key={e.transId} txn={e.record}
                balancesAfter={e.balancesAfter} accounts={accounts} totalBalanceAfter={e.totalBalanceAfter}
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
    <div className={`pb-srow-main pb-srow-headrow${lensAccount ? ' pb-srow-lens' : ''}`} aria-hidden="true">
      <div className="pb-srow-lead">{x.colTransaction}</div>
      {!lensAccount && <div className="pb-srow-acct">{x.colAccount}</div>}
      <div className="pb-srow-money">
        <div>{x.colAmount}</div>
        {lensAccount && <div className="pb-srow-lensbal">{lensAccount.name}</div>}
        <div className="pb-srow-balcell">{lensAccount ? x.colTotal : x.colBalance}</div>
      </div>
    </div>
  );
}

export function StatementList({
  entries, openingBalance, accounts, categoryMeta, onOpenDetail,
  closingBalance, monthInfo, today, lensAccountId, head, id,
}: StatementListProps) {
  const { d, t, locale } = useTranslation();
  const groups = useMemo(() => groupByDay(entries, balanceReader(lensAccountId ?? null)), [entries, lensAccountId]);
  const lensAccount = lensAccountId ? accounts.find((a) => a.id === lensAccountId) ?? null : null;

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
      {entries.length === 0 ? (
        <EmptyState
          icon={CalendarX2}
          title={d.transactions.noActivity}
          // The carried-forward amount is money: font-mono-tab so privacy
          // mode blurs it like every other figure (it used to be plain text).
          body={renderTemplate(d.transactions.carriedForward, {
            amount: <span className="font-mono-tab">{formatCurrency(openingBalance)}</span>,
          })}
        />
      ) : (
        <div>
          <LedgerHead lensAccount={lensAccount} />
          {bookends && (
            <div className="pb-txn-bookend">
              <span>{t(d.ux.transactions.closingOn, { date: formatDate(bookends.closingDate, locale) })}</span>
              <span className="font-mono-tab">{formatCurrency(closingBalance ?? 0)}</span>
            </div>
          )}
          <DayGroups
            groups={groups} mode="statement" accounts={accounts} categoryMeta={categoryMeta}
            onOpenDetail={onOpenDetail} today={today} lensAccountId={lensAccountId}
          />
          {bookends && (
            <div className="pb-txn-bookend pb-txn-bookend-foot">
              <span>{t(d.ux.transactions.openingOn, { date: formatDate(bookends.openingDate, locale) })}</span>
              <span className="font-mono-tab">{formatCurrency(openingBalance)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
