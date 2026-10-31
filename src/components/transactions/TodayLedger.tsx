'use client';

import { RollingAmount } from '@/components/shared/RollingAmount';
import { useLayoutEffect, useRef, useState } from 'react';
import { Landmark, Coins, CreditCard, Star, Sun } from 'lucide-react';
import type { Account } from '@/lib/data/mappers';
import { formatCurrency, splitCents } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { SleepingBadge } from '@/components/shared/SleepingBadge';

interface TodayLedgerProps {
  currentBalance: number;
  /** Already in display order: starred, bank and cash by balance, cards by most owed. */
  accounts: Account[];
  balancesByAccount: Record<string, number>;
  /** The account whose statement is showing (the lens), if any. */
  selectedAccountId: string | null;
  /** A ledger row was pressed: show that account's statement (or, if it is showing, all accounts). */
  onPickAccount: (id: string) => void;
}

/**
 * TODAY: the total balance and each account's balance, now. A neutral mist
 * card on purpose - the pine gradient is the Dashboard's one brand moment -
 * with the cents set small and raised (splitCents, the same as the Dashboard
 * hero figure) so the dollars read first. Deliberately NOT StatTab: the month
 * zone below is month-scoped, these figures are today's.
 */
export function TodayLedger({ currentBalance, accounts, balancesByAccount, selectedAccountId, onPickAccount }: TodayLedgerProps) {
  const { d, locale } = useTranslation();
  const total = splitCents(formatCurrency(currentBalance));

  // Account list beside the total: columns of 3 rows, growing sideways. When
  // the columns would not fit beside the total with a comfortable gap, the
  // header stacks (total on top, list wrapping below, as on phones) - no
  // column is ever cut. Decided from the width the columns NEED, not by
  // measuring a clipped list, so it cannot flicker between the two layouts.
  const [accountsStacked, setAccountsStacked] = useState(false);
  const accountsRef = useRef<HTMLUListElement>(null);
  useLayoutEffect(() => {
    const row = accountsRef.current?.parentElement;
    const totalEl = row?.querySelector('.pb-txn-total');
    if (!row || !totalEl || typeof ResizeObserver === 'undefined') return;
    const COL_GAP = 24;
    const MIN_SPACE = 68;
    const check = () => {
      // The total's text width, whatever box it sits in (stacked or not).
      const range = document.createRange();
      range.selectNodeContents(totalEl);
      const totalWidth = range.getBoundingClientRect().width;
      // Column width: the widest row's full content (name untruncated, icon,
      // gaps, figure, the row's own padding), kept between 240 and 340px -
      // the CSS column bounds. Parts are found by data attribute rather than
      // child position: a row is a button with two lines (name and star over
      // last4 and the sleeping badge; the figure over "owed").
      let widest = 0;
      accountsRef.current?.querySelectorAll(':scope > li').forEach((li) => {
        const name = li.querySelector<HTMLElement>('[data-acc-name]');
        const amount = li.querySelector<HTMLElement>('[data-acc-amount]');
        const meta = li.querySelector<HTMLElement>('[data-acc-meta]');
        const star = li.querySelector('[data-acc-star]') ? 18 : 0; // the star beside a starred account
        const text = Math.max((name?.scrollWidth ?? 0) + star, meta?.scrollWidth ?? 0);
        // 15 icon + 2 x 9 gaps + 13 padding.
        if (name && amount) widest = Math.max(widest, 15 + text + amount.scrollWidth + 18 + 13);
      });
      const col = Math.min(340, Math.max(240, widest));
      const cols = Math.max(1, Math.ceil(accounts.length / 3));
      const need = totalWidth + cols * col + (cols - 1) * COL_GAP + MIN_SPACE * 3;
      setAccountsStacked(need > row.clientWidth);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(row);
    return () => ro.disconnect();
    // Balances and the language change row widths ("owed" vs its Chinese),
    // so those re-check too, not only a resize.
  }, [accounts, balancesByAccount, locale]);

  return (
    <section className="card pb-txn-today" aria-labelledby="pb-txn-today-title">
      <p className="pb-txn-eyebrow" id="pb-txn-today-title"><Sun size={12} aria-hidden="true" />{d.ux.transactions.todayZone}</p>
      <div className={`pb-txn-top${accountsStacked ? ' pb-txn-expanded' : ''}`}>
        {/* minWidth 0 here and on the list: a flex item cannot shrink below its
            min-content width, which for the list is a full unshortened row -
            without it the list pushes past a phone's right edge. */}
        <div className="pb-txn-total" style={{ minWidth: 0 }}>
          <p style={{ fontSize: '0.78rem', color: 'var(--ink-soft)', marginBottom: 4 }}>{d.transactions.totalBalanceToday}</p>
          <p className="font-display pb-money pb-txn-total-amount" style={{ fontWeight: 600 }}>
            <RollingAmount value={total.whole + total.cents} fractionClassName="pb-txn-cents" />
          </p>
        </div>
        {/* Each account's balance as a quiet ledger: one row each, figures
            right-aligned in tabular numerals so they compare at a glance.
            Beside the total on wide screens, under it on a phone. Credit
            cards last, shown as what they owe. Each row is a button that
            opens that account's own statement below (the account lens). */}
        {/* Two columns once there is room (many accounts no longer stretch the
            card tall beside the total). Every row has a top hairline and is
            nudged up 1px; the list clips, so only the first row's line hides. */}
        <ul id="pb-txn-accounts" ref={accountsRef} style={{ listStyle: 'none', margin: 0, padding: 0, minWidth: 0 }}>
          {accounts.map((a) => {
            const AccountIcon = a.kind === 'credit' ? CreditCard : a.kind === 'bank' ? Landmark : Coins;
            const value = balancesByAccount[a.id] ?? 0;
            const owed = a.kind === 'credit' ? Math.max(0, -value) : null;
            const selected = selectedAccountId === a.id;
            return (
              <li key={a.id} style={{ borderTop: '1px solid var(--line)', marginTop: -1, minWidth: 0 }}>
                <button
                  type="button"
                  className={`pb-txn-acc${selected ? ' pb-txn-acc-on' : ''}`}
                  aria-pressed={selected}
                  onClick={() => onPickAccount(a.id)}
                >
                  <AccountIcon size={15} aria-hidden="true" style={{ color: 'var(--ink-soft)', flexShrink: 0 }} />
                  {/* Two lines: the name (and star) alone on the first, so it
                      gets the row's width instead of sharing it with the
                      last4 and the sleeping badge, which sit quietly under
                      it. A long name used to cut at "Chase Checkin…" beside
                      empty space; now only a really long one truncates. */}
                  <span className="pb-txn-acc-text">
                    <span className="pb-txn-acc-line">
                      {/* Account names are USER DATA. */}
                      <span data-acc-name="" className="pb-txn-acc-name">{a.name}</span>
                      {a.isPreferred && (
                        <Star data-acc-star="" size={12} fill="var(--gold)" color="var(--gold)" aria-label={d.accounts.preferred} style={{ flexShrink: 0 }} />
                      )}
                    </span>
                    {(a.last4 || a.status === 'hibernated') && (
                      <span data-acc-meta="" className="pb-txn-acc-meta">
                        {/* Not money: pb-tnum, so privacy mode leaves it readable
                            (the Account filter shows it unblurred anyway). */}
                        {a.last4 && <span className="pb-tnum">····{a.last4}</span>}
                        {/* SleepingBadge rule: everywhere a hibernated account appears. */}
                        {a.status === 'hibernated' && <SleepingBadge />}
                      </span>
                    )}
                  </span>
                  {/* Only the figure blurs in privacy mode; "owed" stays readable. */}
                  <span data-acc-amount="" className="pb-txn-acc-fig">
                    <span className="font-mono-tab"><RollingAmount value={formatCurrency(owed !== null ? owed : value)} /></span>
                    {owed !== null && <span className="pb-txn-acc-owed">{d.accountsPage.cardOwed}</span>}
                  </span>
                  <span className="pb-txn-sr">{d.ux.transactions.showStatement}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
