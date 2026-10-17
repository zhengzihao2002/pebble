'use client';

import { useEffect, useState, type KeyboardEvent } from 'react';
import { Banknote, SlidersHorizontal, CircleHelp, CreditCard, Landmark, Coins } from 'lucide-react';
import type { CategoryMeta, LedgerRecord } from '@/types';
import type { Account } from '@/lib/data/mappers';
import { formatCurrency, formatDate } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { categoryLabel } from '@/lib/i18n/enumLabels';
import { highlight as markHits } from '@/components/transactions/highlight';

// Rows are selectable text now that long-press is gone, so a drag that ends
// inside the row would otherwise fire onClick and open the modal mid-selection.
const hasTextSelection = () =>
  typeof window !== 'undefined' && (window.getSelection()?.toString().length ?? 0) > 0;

interface StatementRowProps {
  txn: LedgerRecord;
  /** Every account's balance after this record, keyed by account id. */
  balancesAfter: Record<string, number>;
  /** Needed for names and ordering - accounts are user data, not a fixed pair. */
  accounts: Account[];
  totalBalanceAfter: number;
  onOpenDetail: (txn: LedgerRecord) => void;
  categoryMeta: CategoryMeta;
  // Everything below is OPTIONAL and off by default, so the CSV import's
  // read-only preview (which passes none of them) renders exactly as before.
  /** Show the date in the subtitle. Off inside a day group, whose header already says it. */
  showDate?: boolean;
  /** Trimmed, lower-cased search text to mark in the title and subtitle. */
  highlight?: string;
  /**
   * Keyboard-operable: the row becomes role=button with tabIndex 0, Enter or
   * Space opens it, and Up/Down move between rows of the same list. Off for
   * the import preview, whose rows open nothing.
   */
  keyboard?: boolean;
  /**
   * Desktop ledger layout. Adds an account column and a separate
   * balance-after column; the grid itself is switched on by a container
   * query on the surrounding statement (.pb-txn-stmt), so a narrow card keeps
   * the two-line row with no JS.
   */
  ledger?: boolean;
  /** Account lens: also show this account's own running balance, and a Total line in the breakdown. */
  lensAccountId?: string;
}

export function StatementRow({
  txn, balancesAfter, accounts, totalBalanceAfter, onOpenDetail, categoryMeta,
  showDate = true, highlight, keyboard = false, ledger = false, lensAccountId,
}: StatementRowProps) {
  const { d, t, locale } = useTranslation();

  // Adjustments have no category. They are manual balance corrections, so
  // they get their own icon and a neutral treatment rather than being coloured
  // as income or spending.
  const isAdjustment = txn.type === 'adjustment';
  const meta = isAdjustment ? undefined : categoryMeta[txn.category];
  // No category at all: only a not-yet-imported row in the CSV import preview,
  // since stored transactions always have one. A neutral question mark until a
  // category is chosen, rather than the income banknote.
  const uncategorised = !isAdjustment && !txn.category;
  const Icon = isAdjustment ? SlidersHorizontal : uncategorised ? CircleHelp : (meta ? meta.icon : Banknote);
  const isIncome = !isAdjustment && txn.amount > 0;

  // txn.category is either a real category NAME (user data) or one of the
  // two income literals - categoryLabel() handles both, translating only
  // the latter.
  const subtitleParts = isAdjustment ? [d.txn.balanceAdjustment] : uncategorised ? [] : [categoryLabel(d, txn.category)];
  if (txn.type === 'expense' && txn.tag) subtitleParts.push(txn.tag);
  if (showDate) subtitleParts.push(formatDate(txn.date, locale));

  const accentColor = isAdjustment || uncategorised
    ? 'var(--ink-soft)'
    : (isIncome ? 'var(--pine)' : (meta ? meta.color : 'var(--ink-soft)'));
  const accentBg = isAdjustment || uncategorised
    ? 'var(--mist)'
    : (isIncome ? 'var(--pine-soft)' : `${meta ? meta.color : '#999999'}20`);
  // Green for money in, red for money out, grey for corrections.
  const amountColor = isAdjustment
    ? 'var(--ink-soft)'
    : (isIncome ? 'var(--pine)' : 'var(--wine)');
  const amountPrefix = isAdjustment ? (txn.amount > 0 ? '+' : '') : (isIncome ? '+' : '');

  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  // Touch has no hover. Tapping the balance line expands the same per-account
  // figures inline instead - inline rather than in a popover because a popover
  // anchored to a tap lands under the finger that opened it.
  const [expanded, setExpanded] = useState(false);

  // ONE MECHANISM PER DEVICE. Touch browsers synthesise mouseenter and
  // mousemove on tap but never fire mouseleave, so the tooltip appeared,
  // stuck, and flickered against the inline expansion. Gating on a real
  // pointer rather than trying to suppress the synthetic events: a mouse
  // hovers, a finger taps, and neither gets the other's behaviour.
  //
  // Resolved in an effect, not during render: matchMedia does not exist on
  // the server, and reading it while rendering would mismatch hydration.
  const [canHover, setCanHover] = useState(false);
  useEffect(() => {
    setCanHover(window.matchMedia('(hover: hover) and (pointer: fine)').matches);
  }, []);

  // Shown when the balance is non-zero, OR when this is the account the record
  // itself belongs to.
  //
  // The second clause is the point: a transaction that takes an account to
  // exactly zero must still list it, because zero IS the result of what just
  // happened. On the NEXT record, if that account is not involved, it drops
  // off - a zero for an untouched account carries no information, and with
  // several accounts the list would be mostly zeroes.
  //
  // Shared by both displays so they cannot disagree about what is worth
  // showing.
  const nonZeroAccounts = accounts.filter(
    (a) => Math.abs(balancesAfter[a.id] ?? 0) >= 0.005 || a.id === txn.accountId,
  );

  const lensAccount = lensAccountId ? accounts.find((a) => a.id === lensAccountId) : undefined;
  const rowAccount = accounts.find((a) => a.id === txn.accountId);
  const RowAccountIcon = rowAccount?.kind === 'credit' ? CreditCard : rowAccount?.kind === 'bank' ? Landmark : Coins;

  // "Near the mouse," offset so the tooltip doesn't sit directly under the
  // cursor, with a clamp so it doesn't get cut off near a screen edge. The
  // height grows with the number of accounts listed (a fixed 76px estimate
  // let a long list run past the bottom edge).
  const updateHoverPos = (e: React.MouseEvent<HTMLDivElement>) => {
    const lines = Math.max(1, nonZeroAccounts.length) + (lensAccount ? 1 : 0);
    const TOOLTIP_W = 170, TOOLTIP_H = 24 + lines * 19, OFFSET = 14;
    let x = e.clientX + OFFSET;
    let y = e.clientY + OFFSET;
    if (typeof window !== 'undefined') {
      if (x + TOOLTIP_W > window.innerWidth) x = e.clientX - TOOLTIP_W - OFFSET;
      if (y + TOOLTIP_H > window.innerHeight) y = e.clientY - TOOLTIP_H - OFFSET;
    }
    setHoverPos({ x, y });
  };

  const open = () => { if (!hasTextSelection()) onOpenDetail(txn); };

  // Enter or Space opens the row, like a button. Up/Down move between rows of
  // the same list, so a long statement can be walked without Tab-ing through
  // every row. Ignored while a key is held inside a nested control.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const list = e.currentTarget.closest('.pb-txn-stmt');
      if (!list) return;
      const rows = Array.from(list.querySelectorAll<HTMLElement>('[data-pb-row]'));
      const i = rows.indexOf(e.currentTarget);
      const next = rows[e.key === 'ArrowDown' ? i + 1 : i - 1];
      if (next) { e.preventDefault(); next.focus(); }
    }
  };

  const titleText = txn.description.split('\n')[0] || (isAdjustment ? d.txn.balanceAdjustment : '');
  const subtitleText = subtitleParts.join(' · ');

  const tile = (
    <div style={{
      width: 36, height: 36, borderRadius: '0.65rem', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backgroundColor: accentBg,
    }}>
      <Icon size={16} style={{ color: accentColor }} />
    </div>
  );
  // The highlight marks sit one level inside the ellipsis elements, so the
  // AppShell truncation tooltip still finds them and the text is unchanged.
  const text = (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: '0.87rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {markHits(titleText, highlight)}
      </div>
      {subtitleText !== '' && (
        <div style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {markHits(subtitleText, highlight)}
        </div>
      )}
    </div>
  );

  return (
    <div
      className="txn-row-interactive"
      style={{ borderBottom: '1px solid var(--line)' }}
    >
    <div
      onClick={open}
      role={keyboard ? 'button' : undefined}
      tabIndex={keyboard ? 0 : undefined}
      onKeyDown={keyboard ? onKeyDown : undefined}
      data-pb-row={keyboard ? '' : undefined}
      className={ledger ? `pb-srow-main${lensAccount ? ' pb-srow-lens' : ''}` : undefined}
      style={ledger ? { cursor: 'pointer' } : {
        display: 'flex', alignItems: 'center', gap: '0.85rem',
        padding: '0.85rem 1.5rem',
        cursor: 'pointer',
      }}
    >
      {ledger ? <div className="pb-srow-lead">{tile}{text}</div> : <>{tile}{text}</>}
      {/* Ledger only, and shown only once the statement is wide enough: the
          account the record belongs to. Names are USER DATA. Hidden under the
          lens, where every row is the same account. */}
      {ledger && !lensAccount && (
        <div className="pb-srow-acct">
          <RowAccountIcon size={13} aria-hidden="true" />
          <span>{rowAccount?.name ?? txn.paymentMethod}</span>
        </div>
      )}
      {/* stopPropagation: the row opens the detail modal, so without it a tap
          here would expand the balances AND open the modal over them. */}
      <div
        className={ledger ? 'pb-srow-money' : undefined}
        style={{ textAlign: 'right', flexShrink: 0, cursor: 'pointer' }}
        onClick={canHover ? undefined : (e) => { e.stopPropagation(); if (!hasTextSelection()) setExpanded((v) => !v); }}
        onMouseEnter={canHover ? updateHoverPos : undefined}
        onMouseMove={canHover ? updateHoverPos : undefined}
        onMouseLeave={canHover ? () => setHoverPos(null) : undefined}
      >
        <div className="font-mono-tab" style={{ fontSize: '0.87rem', fontWeight: 600, color: amountColor, whiteSpace: 'nowrap' }}>
          {amountPrefix}{formatCurrency(txn.amount)}
        </div>
        {/* Account lens: this account's own running balance, above the
            unchanged total line. */}
        {lensAccount && (
          <div className="pb-srow-lensbal" style={{ fontSize: '0.72rem', color: 'var(--ink)', whiteSpace: 'nowrap', marginTop: 1 }}>
            <span className="pb-srow-lensname">{lensAccount.name} </span>
            <span className="font-mono-tab" style={{ fontWeight: 600 }}>{formatCurrency(balancesAfter[lensAccount.id] ?? 0)}</span>
          </div>
        )}
        <div className={`font-mono-tab${ledger ? ' pb-srow-balline' : ''}`} style={{ fontSize: '0.72rem', color: 'var(--ink-soft)', whiteSpace: 'nowrap', marginTop: 1 }}>
          {t(d.txn.balanceAfter, { amount: formatCurrency(totalBalanceAfter) })}
        </div>
        {/* The same figure without the "Bal" prefix, for the ledger's
            "Balance after" column (one or the other is displayed). */}
        {ledger && (
          <div className="font-mono-tab pb-srow-balcell">{formatCurrency(totalBalanceAfter)}</div>
        )}
      </div>

      </div>

      {/* Same 0fr -> 1fr technique as .collapsible-rows elsewhere. Hibernated
          accounts are listed too: a historical row may reference one, and
          hiding it would leave an unexplained figure. */}
      <div
        style={{
          display: 'grid',
          gridTemplateRows: expanded ? '1fr' : '0fr',
          transition: 'grid-template-rows 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <div style={{ overflow: 'hidden', minHeight: 0 }}>
          <div style={{ padding: '0 1.5rem 0.8rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            {nonZeroAccounts.length === 0 && (
              <div style={{ fontSize: '0.75rem', color: 'var(--ink-soft)' }}>{d.txn.noAccountBalances}</div>
            )}
            {nonZeroAccounts.map((a) => (
              <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', fontSize: '0.75rem' }}>
                <span style={{ color: 'var(--ink-soft)' }}>{a.name}</span>
                <span className="font-mono-tab" style={{ color: 'var(--ink)', fontWeight: 600 }}>
                  {formatCurrency(balancesAfter[a.id] ?? 0)}
                </span>
              </div>
            ))}
            {lensAccount && (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', fontSize: '0.75rem', borderTop: '1px solid var(--line)', paddingTop: '0.3rem' }}>
                <span style={{ color: 'var(--ink-soft)' }}>{d.ux.transactions.total}</span>
                <span className="font-mono-tab" style={{ color: 'var(--ink)', fontWeight: 600 }}>{formatCurrency(totalBalanceAfter)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {hoverPos && (
        <div
          style={{
            position: 'fixed', left: hoverPos.x, top: hoverPos.y, zIndex: 100, pointerEvents: 'none',
            backgroundColor: 'var(--mist)', border: '1px solid var(--line)', borderRadius: '0.6rem',
            padding: '0.55rem 0.75rem', boxShadow: 'var(--shadow)', minWidth: 150,
          }}
        >
          {/* Account NAMES are USER DATA and are never translated - unlike the
              old fixed Checking/Cash pair, which came from the dictionary.
              Closed accounts still appear here: a historical row references
              one, and hiding it would leave an unexplained figure. */}
          {nonZeroAccounts.length === 0 && (
            <div style={{ fontSize: '0.72rem', color: 'var(--ink-soft)' }}>{d.txn.noAccountBalances}</div>
          )}
          {nonZeroAccounts.map((a, i) => (
            <div
              key={a.id}
              style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', fontSize: '0.72rem', marginTop: i === 0 ? 0 : 4 }}
            >
              <span style={{ color: 'var(--ink-soft)' }}>{a.name}</span>
              <span className="font-mono-tab" style={{ color: 'var(--ink)', fontWeight: 600 }}>
                {formatCurrency(balancesAfter[a.id] ?? 0)}
              </span>
            </div>
          ))}
          {lensAccount && (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', fontSize: '0.72rem', marginTop: 6, paddingTop: 5, borderTop: '1px solid var(--line)' }}>
              <span style={{ color: 'var(--ink-soft)' }}>{d.ux.transactions.total}</span>
              <span className="font-mono-tab" style={{ color: 'var(--ink)', fontWeight: 600 }}>{formatCurrency(totalBalanceAfter)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
