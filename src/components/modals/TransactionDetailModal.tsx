'use client';

import { useEffect, useMemo, useState } from 'react';
import { Banknote, Briefcase, Coins, Pencil, SlidersHorizontal, Trash2 } from 'lucide-react';
import { LoadingOverlay } from '@/components/shared/Spinner';
import { ModalFrame } from '@/components/shared/ModalFrame';
import { ModalCloseButton } from '@/components/shared/ModalCloseButton';
import { SaveSuccess } from '@/components/shared/SaveSuccess';
import type { CategoryMeta, LedgerRecord } from '@/types';
import { formatCurrency, formatFullDate, formatLongDate } from '@/lib/format';
import { deductionPct } from '@/lib/stats';
import { deleteBalanceAdjustmentAction, deleteTransactionAction, getAllocationSummaryAction, updateTransactionAction, getAccountsAction } from '@/lib/actions/pebble';
import { callAction } from '@/lib/actions/callAction';
import type { FailureKind } from '@/lib/actions/failureKind';
import type { Account } from '@/lib/data/mappers';
import { ActionError } from '@/components/shared/ActionError';
import { TitleDescriptionFields } from '@/components/shared/TitleDescriptionFields';
import { isDescriptionEdited, parseDescription, resolveEditedDescription } from '@/lib/transactionDescription';
import { SelectField, type SelectFieldOption } from '@/components/shared/SelectField';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { useSafetyLock } from '@/lib/useSafetyLock';
import { translateActionError } from '@/lib/i18n/actionErrors';
import { categoryLabel } from '@/lib/i18n/enumLabels';
import { renderTemplate } from '@/lib/i18n/RichText';

interface TransactionDetailModalProps {
  txn: LedgerRecord | null;
  onClose: () => void;
  categoryMeta: CategoryMeta;
}

const FORM_ID = 'txn-edit-form';

const inputStyle: React.CSSProperties = {
  padding: '0.6rem 0.75rem', borderRadius: '0.6rem', border: '1px solid var(--line)',
  fontSize: '0.9rem', color: 'var(--ink)', backgroundColor: 'var(--paper)',
  boxSizing: 'border-box', width: '100%',
};
const labelStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: '0.35rem',
  fontSize: '0.8rem', color: 'var(--ink-soft)',
};
// Same large amount field as Add Transaction.
const bigAmountStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '0.8rem 0.9rem 0.8rem 2.2rem', borderRadius: '0.8rem', border: '1px solid var(--line)', fontSize: '1.6rem', fontWeight: 600, color: 'var(--ink)', backgroundColor: 'var(--paper)' };
const bigDollarStyle: React.CSSProperties = { position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: '1.5rem', color: 'var(--ink-soft)' };

type Mode = 'view' | 'edit' | 'confirmDelete' | 'confirmOverspend';

/**
 * Closes the dialog once the render that made it busy-free has fully settled.
 * ModalFrame reads `busy` through a ref that is refreshed in an effect, so
 * calling close() in the same tick as setBusy(false) would be ignored.
 */
function CloseSoon({ close }: { close: () => void }) {
  useEffect(() => {
    const id = window.setTimeout(close, 0);
    return () => window.clearTimeout(id);
  }, [close]);
  return null;
}

/**
 * LAYOUT. Head (icon, title, close) and foot (error, buttons) never scroll;
 * the body between them does. The edit form's submit button sits in the foot
 * and belongs to the form through the form attribute.
 *
 * HOOKS. Every hook lives in TransactionDetailContent, which only ever
 * renders with a real transaction. The exported wrapper below has none, so no
 * hook can sit after an early return. key={txn.id} remounts the content for
 * a different transaction, so one record's draft never bleeds into another.
 */
function TransactionDetailContent({ txn, onClose, categoryMeta }: { txn: LedgerRecord; onClose: () => void; categoryMeta: CategoryMeta }) {
  const deleteLocked = useSafetyLock('deleteTransactions');
  const { d, t, locale } = useTranslation();
  const [mode, setMode] = useState<Mode>('view');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<FailureKind | undefined>(undefined);
  const [shortfall, setShortfall] = useState(0);
  // Set ONLY after the server confirms an edit. A snapshot of what was
  // entered, so the confirmation cannot shift when the page re-renders.
  const [success, setSuccess] = useState<{ title: string; summary: string } | null>(null);
  // Set ONLY after the server confirms a delete. Delete has no success
  // screen: the dialog closes quietly and the row leaving the list is the
  // confirmation.
  const [deleted, setDeleted] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [tag, setTag] = useState('');
  // Account ID, not name. On a CLOSED account this is locked: the server
  // rejects a change, and the picker below renders read-only to match.
  const [accountId, setAccountId] = useState('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  const [grossPay, setGrossPay] = useState('');
  const [netPay, setNetPay] = useState('');

  // Reset whenever a different transaction object arrives, so a previous
  // edit's draft never bleeds into another record. Every value seeded here
  // comes straight off the stored row - none of it is ever a label.
  useEffect(() => {
    setMode('view');
    setError(null);
    const parts = parseDescription(txn.description);
    setTitle(parts.title);
    setDescription(parts.description);
    setCategory(txn.type === 'adjustment' ? '' : txn.category);
    setTag(txn.type === 'expense' ? (txn.tag ?? '') : '');
    setAccountId(txn.accountId);
    setDate(txn.date);
    setAmount(txn.type === 'expense' ? String(Math.abs(txn.amount)) : '');
    setGrossPay(txn.type === 'income' ? String(txn.grossAmount) : '');
    setNetPay(txn.type === 'income' ? String(txn.netAmount) : '');
  }, [txn]);

  // Active accounts for the picker. The transaction's OWN account may be
  // closed and therefore absent from this list - handled below.
  useEffect(() => {
    let cancelled = false;
    callAction(getAccountsAction, d.addTxn.accountsFailed).then((result) => {
      if (cancelled) return;
      if (!result.ok) { setAccountError(translateActionError(d, locale, result)); return; }
      setAccounts(result.accounts);
      setAccountError(null);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const accountOptions = useMemo<SelectFieldOption[]>(
    () => accounts.map((a) => ({
      value: a.id,
      label: a.last4 ? `${a.name} ····${a.last4}` : a.name,
    })),
    [accounts],
  );

  // Adjustments are view-and-delete only: there is nothing meaningful to
  // edit, since changing the amount just means making a different correction.
  const isAdjustment = txn.type === 'adjustment';
  const meta = isAdjustment ? undefined : categoryMeta[txn.category];
  const Icon = isAdjustment ? SlidersHorizontal : (meta ? meta.icon : Banknote);
  const isIncome = !isAdjustment && txn.amount > 0;
  const iconColor = isIncome ? 'var(--pine)' : (meta ? meta.color : 'var(--ink-soft)');
  // No category colour: a faint tint of the soft ink token, never a hex.
  const iconBg = isIncome
    ? 'var(--pine-soft)'
    : (meta ? `${meta.color}20` : 'color-mix(in srgb, var(--ink-soft) 14%, transparent)');

  // balance_adjustment.amount has no sign CHECK - corrections go both ways -
  // so the figure is coloured by sign rather than always red, matching how
  // income renders. The sign is written explicitly against Math.abs so there
  // is exactly one sign glyph however formatCurrency treats negatives, and a
  // zero shows neither sign nor a verdict colour.
  const amountSign = isAdjustment
    ? (txn.amount > 0 ? '+' : txn.amount < 0 ? '-' : '')
    : (isIncome ? '+' : '');
  const amountColor = isAdjustment
    ? (txn.amount > 0 ? 'var(--pine)' : txn.amount < 0 ? 'var(--wine)' : 'var(--ink-soft)')
    : (isIncome ? 'var(--pine)' : 'var(--wine)');
  const amountText = isAdjustment
    ? formatCurrency(Math.abs(txn.amount))
    : formatCurrency(txn.amount);

  const descLines = txn.description.split('\n');
  const descTitle = descLines[0];
  const descRest = descLines.slice(1).join('\n').trim();
  // An imported record can have an empty first line; the heading falls back
  // to something true rather than rendering nothing.
  const headingText = descTitle || (isAdjustment ? d.txn.balanceAdjustment : categoryLabel(d, txn.category));

  // categoryMeta already carries a resolved icon and colour per name, so no
  // resolveCategoryIcon() call is needed here. label === value: category
  // names are USER DATA and are never translated.
  const categoryNames = Object.keys(categoryMeta);
  const categoryOptions: SelectFieldOption[] = categoryNames.map((name) => ({
    value: name,
    label: name,
    icon: categoryMeta[name]?.icon,
    color: categoryMeta[name]?.color,
  }));
  // Compares the DRAFT against the stored literal, never against a label.
  const editingSideCash = txn.type === 'income' && category === 'Side Cash';

  // Reads the PERSISTED category, not the edit form's draft `category` state.
  // Keying the view rows off the draft would make them change while someone
  // was mid-edit, and revert on cancel.
  const isSideCash = txn.type === 'income' && txn.category === 'Side Cash';

  // Live draft figures for the edit form. Net above gross would mean more money
  // arrived than was earned, so it is refused rather than silently clamped.
  // A blank or half-typed field is not an error: both values must parse before
  // the comparison is meaningful, otherwise the form flashes red mid-keystroke.
  const draftGross = Number(grossPay);
  const draftNet = Number(netPay);
  const draftAmountsParse =
    grossPay.trim() !== '' && netPay.trim() !== ''
    && Number.isFinite(draftGross) && Number.isFinite(draftNet);
  const netExceedsGross = txn.type === 'income' && !editingSideCash && draftAmountsParse && draftNet > draftGross;

  // Untouched fields send the ORIGINAL stored string back, byte for byte -
  // see resolveEditedDescription(). The title is required only once either
  // field is edited: imported records can have an empty description, and
  // blocking an amount fix on one of them until it gets a title would be a
  // regression.
  const descriptionEdited = isDescriptionEdited(txn.description, title, description);
  const outgoingDescription = resolveEditedDescription(txn.description, title, description);
  const titleMissing = descriptionEdited && title.trim() === '';

  // Saving an unchanged record would issue an UPDATE that writes the same
  // values back and revalidate every route for nothing. Compared against the
  // persisted record, so typing a change and undoing it disables the button
  // again. Amounts compare as numbers: "1600.00" and "1600" are the same value.
  // Every comparison here is value-to-value, so switching locale can never
  // mark a form dirty.
  const hasChanges = (() => {
    if (txn.type === 'adjustment') return false;
    if (outgoingDescription.trim() !== txn.description.trim()) return true;
    if (category !== txn.category) return true;
    if (accountId !== txn.accountId) return true;
    if (date !== txn.date) return true;
    if (txn.type === 'expense') {
      if (tag.trim() !== (txn.tag ?? '').trim()) return true;
      return Number(amount) !== Math.abs(txn.amount);
    }
    // Side Cash stores gross = net, so the effective gross follows the net
    // field rather than the hidden gross input.
    const nextNet = Number(netPay);
    const nextGross = editingSideCash ? nextNet : Number(grossPay);
    return nextNet !== txn.netAmount || nextGross !== txn.grossAmount;
  })();

  // A transaction on a HIBERNATED account is frozen in amount and account.
  // A hibernated account is not in `accounts` (active-only), so its
  // absence IS the signal - no extra flag needed. Falls back to the stored
  // payment_method name for display, which carries the account's name.
  const onHibernatedAccount = accounts.length > 0 && !accounts.some((a) => a.id === accountId);
  const accountName = accounts.find((a) => a.id === txn.accountId)?.name ?? txn.paymentMethod ?? '';

  // Split from handleSave so the confirm step can call it directly. The edit
  // form stays mounted behind the confirm, so this re-derives its payload from
  // the same state rather than from a copy taken before the check.
  const performSave = async () => {
    if (busy || txn.type === 'adjustment' || titleMissing) return;
    setBusy(true);
    setError(null);

    const result = await callAction(() => updateTransactionAction({
      id: txn.id,
      type: txn.type,
      description: outgoingDescription,
      category,
      ...(txn.type === 'expense' ? { tag } : {}),
      date,
      accountId,
      ...(txn.type === 'expense' ? { amount: Number(amount) } : {}),
      ...(txn.type === 'income'
        ? {
            grossAmount: editingSideCash ? Number(netPay) : Number(grossPay),
            netAmount: Number(netPay),
          }
        : {}),
    }));

    setBusy(false);
    if (!result.ok) { setError(translateActionError(d, locale, result)); setErrorKind(result.kind); return; }
    // Below the failure return: the confirmation only ever follows a write the
    // server confirmed. It shows the figure just entered, never a balance.
    const savedAmount = formatCurrency(txn.type === 'expense' ? Number(amount) : Number(netPay));
    const savedTitle = descriptionEdited ? title.trim() : descTitle;
    setSuccess({
      title: d.txnDetail.updated,
      summary: savedTitle ? t(d.txnDetail.updatedSummary, { title: savedTitle, amount: savedAmount }) : savedAmount,
    });
  };

  const handleSave = async () => {
    if (busy || txn.type === 'adjustment') return;

    // An edit moves the balance by the CHANGE in amount, not by the amount.
    // Transaction.amount is signed - expenses negative, income positive - so
    // one subtraction covers both: raising an expense and lowering an income
    // both come out negative. Unlike the add path this cannot skip income,
    // since cutting a recorded payment reduces the balance too.
    const nextSigned = txn.type === 'expense' ? -Math.abs(Number(amount)) : Number(netPay);
    const delta = nextSigned - txn.amount;

    if (delta < 0) {
      setBusy(true);
      setError(null);
      const summary = await callAction(getAllocationSummaryAction);
      setBusy(false);

      if (summary.ok) {
        const unallocatedNow = summary.totalBalance - summary.allocated;
        const unallocatedAfter = unallocatedNow + delta;
        // Warns on the crossing only, matching the add path: a dialog that
        // fires on every edit while already over-allocated gets dismissed
        // unread. Only when something is actually set aside, and the amount
        // shown is capped at what was set aside.
        if (summary.allocated > 0 && unallocatedNow >= 0 && unallocatedAfter < 0) {
          setShortfall(Math.min(Math.abs(unallocatedAfter), summary.allocated));
          setMode('confirmOverspend');
          return;
        }
      }
      // A failed lookup does not block the save. The check is advisory, and
      // refusing to record a real correction over it would be worse.
    }

    await performSave();
  };

  const handleDelete = async () => {
    if (busy || deleted || deleteLocked) return;
    setBusy(true);
    setError(null);
    const result = txn.type === 'adjustment'
      ? await callAction(() => deleteBalanceAdjustmentAction({ id: txn.id }))
      : await callAction(() => deleteTransactionAction({ id: txn.id, type: txn.type }));
    setBusy(false);
    if (!result.ok) { setError(translateActionError(d, locale, result)); setErrorKind(result.kind); return; }
    // Below the failure return. No celebration: CloseSoon plays the dialog's
    // normal exit and the row disappearing is the confirmation.
    setDeleted(true);
  };

  // Each row carries a STABLE key alongside its label, so a language switch
  // does not remount every row.
  const rows: { key: string; label: string; value: string }[] = isAdjustment ? [
    { key: 'type', label: d.txnDetail.rowType, value: d.txn.balanceAdjustment },
    { key: 'date', label: d.txnDetail.rowDate, value: formatFullDate(txn.date, locale) },
    { key: 'account', label: d.txnDetail.rowAccount, value: accountName },
  ] : [
    { key: 'type', label: d.txnDetail.rowType, value: isIncome ? d.enums.kind.income : d.enums.kind.expense },
    // Category and tag are USER DATA - shown exactly as stored.
    // txn.category is either a real category NAME (user data) or one of the
    // two income literals - categoryLabel() handles both.
    { key: 'category', label: d.txnDetail.rowCategory, value: categoryLabel(d, txn.category) },
    ...(txn.type === 'expense' && txn.tag ? [{ key: 'tag', label: d.txnDetail.rowTag, value: txn.tag }] : []),
    { key: 'date', label: d.txnDetail.rowDate, value: formatFullDate(txn.date, locale) },
    // Income shows a different heading than expense: 'Payment method'
    // implies the user is spending, which is backwards for a deposit. Only
    // the label changes - the underlying value/comparison is untouched.
    { key: 'method', label: isIncome ? d.txnDetail.rowDepositedTo : d.txnDetail.rowPaymentMethod, value: accountName || '—' },
    // Side cash is untaxed, so the actions store gross = net. One "Amount"
    // row, matching the edit form's label.
    ...(txn.type === 'income' ? (isSideCash ? [
      { key: 'amount', label: d.txnDetail.rowAmount, value: formatCurrency(txn.netAmount) },
    ] : [
      { key: 'gross', label: d.txnDetail.rowPayBefore, value: formatCurrency(txn.grossAmount) },
      { key: 'net', label: d.txnDetail.rowPayAfter, value: formatCurrency(txn.netAmount) },
      // Derived at render, never stored: gross and net already determine it,
      // and a stored copy would be a second source of truth that can drift.
      // Labelled "deductions" because the gap also covers insurance and
      // retirement, not just tax.
      {
        key: 'deductions',
        label: d.txnDetail.rowDeductions,
        value: `${deductionPct(txn.grossAmount, txn.netAmount).toFixed(1)}%`,
      },
    ]) : []),
  ];

  const dipsParts = d.txnDetail.dipsBody.split('{amount}');

  // The money input: large figure, '$' in every locale (real US dollars).
  const moneyInput = (value: string, onChange: (v: string) => void, extra?: React.CSSProperties) => (
    <div style={{ position: 'relative' }}>
      <span className="font-display" style={bigDollarStyle}>$</span>
      <input
        type="number" inputMode="decimal" min="0" step="0.01" value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={onHibernatedAccount}
        className="font-mono-tab"
        style={{ ...bigAmountStyle, opacity: onHibernatedAccount ? 0.6 : 1, ...extra }}
      />
    </div>
  );

  const accountLabelText = txn.type === 'income' ? d.txnDetail.rowDepositedTo : d.txnDetail.rowPaymentMethod;
  const amountBlock = (
    <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
      <p className="font-display" style={{ fontSize: '2rem', fontWeight: 600, color: amountColor }}>
        {amountSign}{amountText}
      </p>
      {descRest && (
        <p style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--ink-soft)', marginTop: '0.35rem', whiteSpace: 'pre-line' }}>{descRest}</p>
      )}
    </div>
  );

  return (
    <ModalFrame onClose={onClose} busy={busy} labelledBy="txn-detail-title" maxWidth={600}>
      {(close) => (
      <>
        {busy && <LoadingOverlay label={mode === 'confirmDelete' ? d.txnDetail.deletingOverlay : d.txnDetail.savingChanges} />}

        {/* HEAD: never scrolls. */}
        <div className="pb-modal-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: 40, height: 40, borderRadius: '0.75rem', backgroundColor: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
              <Icon size={20} style={{ color: iconColor }} />
            </div>
            <h2 id="txn-detail-title" className="font-display" style={{ flex: 1, minWidth: 0, fontSize: '1.1rem', fontWeight: 600, overflowWrap: 'anywhere' }}>{headingText}</h2>
            <ModalCloseButton onClick={close} disabled={busy} />
          </div>
        </div>

        {/* BODY: the only part that scrolls. */}
        <div className="pb-modal-body themed-scroll">
          {success ? (
            <SaveSuccess title={success.title} body={success.summary} onDone={close} />
          ) : (
            <>
              {(mode === 'view' || mode === 'confirmDelete') && amountBlock}

              {mode === 'view' && (
                <>
                  <div style={{ borderTop: '1px solid var(--line)', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {rows.map((r) => (
                      <div key={r.key} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', fontSize: '0.85rem' }}>
                        <span style={{ color: 'var(--ink-soft)' }}>{r.label}</span>
                        <span className="font-mono-tab" style={{ fontWeight: 500, textAlign: 'right' }}>{r.value}</span>
                      </div>
                    ))}
                  </div>
                  {isAdjustment && (
                    <p style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', marginTop: '1rem', lineHeight: 1.45 }}>
                      {d.txnDetail.adjustmentNote}
                    </p>
                  )}
                </>
              )}

              {mode === 'edit' && (
                <form id={FORM_ID} className="pb-form-grid" onSubmit={(e) => { e.preventDefault(); void handleSave(); }}>
                  {txn.type === 'expense' ? (
                    <label style={labelStyle} className="pb-span-2">
                      {d.txnDetail.rowAmount}
                      {moneyInput(amount, setAmount)}
                    </label>
                  ) : (
                    <>
                      {/* A div, not a label: it holds buttons. */}
                      <div style={labelStyle} className="pb-span-2">
                        <span>{d.txnDetail.rowCategory}</span>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.6rem' }}>
                          {/* ⚠️ Matched as string literals by isSideCash() and
                              the income filters in stats.ts. Only the text is
                              translated; setCategory gets the literal. */}
                          {(['Standard Income', 'Side Cash'] as const).map((c) => {
                            const TileIcon = c === 'Standard Income' ? Briefcase : Coins;
                            return (
                              <button
                                key={c} type="button" onClick={() => setCategory(c)}
                                aria-pressed={category === c}
                                className={`pb-choice-tile ${category === c ? 'active' : ''}`}
                              >
                                <TileIcon size={20} aria-hidden="true" />
                                <span>{d.enums.incomeCategory[c]}</span>
                              </button>
                            );
                          })}
                        </div>
                        {editingSideCash && (
                          <span style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', lineHeight: 1.45 }}>
                            {d.txnDetail.sideCashNote}
                          </span>
                        )}
                      </div>
                      {!editingSideCash && (
                        <label style={labelStyle}>
                          {d.txnDetail.rowPayBefore}
                          {moneyInput(grossPay, setGrossPay)}
                        </label>
                      )}
                      <label style={labelStyle} className={editingSideCash ? 'pb-span-2' : undefined}>
                        {editingSideCash ? d.txnDetail.rowAmount : d.txnDetail.rowPayAfter}
                        {moneyInput(netPay, setNetPay, { border: `1px solid ${netExceedsGross ? 'var(--wine)' : 'var(--line)'}` })}
                      </label>
                      {!editingSideCash && (
                        netExceedsGross ? (
                          <p className="pb-span-2" style={{ fontSize: '0.75rem', color: 'var(--wine)', lineHeight: 1.45, margin: 0 }}>
                            {d.txnDetail.netExceedsGross}
                          </p>
                        ) : draftAmountsParse && (
                          <div className="pb-span-2" style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', fontSize: '0.78rem', color: 'var(--ink-soft)' }}>
                            <span>{d.txnDetail.rowDeductions}</span>
                            <span className="font-mono-tab" style={{ fontWeight: 500 }}>
                              {deductionPct(draftGross, draftNet).toFixed(1)}%
                            </span>
                          </div>
                        )
                      )}
                    </>
                  )}

                  <div className="pb-span-2" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <TitleDescriptionFields
                      title={title}
                      description={description}
                      onTitleChange={setTitle}
                      onDescriptionChange={setDescription}
                      inputStyle={inputStyle}
                      labelStyle={labelStyle}
                      optionalLabel={d.txnDetail.optional}
                      required={false}
                      titleError={titleMissing ? d.titleDescription.titleRequired : null}
                    />
                  </div>

                  {txn.type === 'expense' && (
                    <>
                      {/* A div, not a label: <label> forwards clicks to its
                          control, so clicking the word "Category" would open
                          the dropdown. The input carries its own accessible
                          name via ariaLabel. */}
                      <div style={labelStyle}>
                        <span>{d.txnDetail.rowCategory}</span>
                        <SelectField
                          value={category}
                          onChange={setCategory}
                          options={categoryOptions}
                          placeholder={d.select.searchCategories}
                          ariaLabel={d.txnDetail.rowCategory}
                        />
                      </div>
                      <label style={labelStyle}>
                        <span>{d.txnDetail.tag} <span style={{ opacity: 0.7 }}>{d.txnDetail.optional}</span></span>
                        <input value={tag} onChange={(e) => setTag(e.target.value)} style={inputStyle} />
                      </label>
                    </>
                  )}

                  <label style={labelStyle}>
                    {d.txnDetail.rowDate}
                    <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
                  </label>

                  <label style={labelStyle}>
                    {accountLabelText}
                    {/* A closed account freezes this field: the transaction
                        cannot move off it, and the server rejects a change
                        regardless of what the form sends. Rendered read-only
                        rather than hidden, so the account is still visible. */}
                    {onHibernatedAccount ? (
                      <>
                        <input value={accountName} disabled readOnly style={{ ...inputStyle, opacity: 0.6, cursor: 'not-allowed' }} />
                        <span style={{ fontSize: '0.75rem', color: 'var(--ink-soft)' }}>
                          {d.txnDetail.closedAccountLocked}
                        </span>
                      </>
                    ) : (
                      <SelectField
                        value={accountId}
                        onChange={setAccountId}
                        options={accountOptions}
                        ariaLabel={accountLabelText}
                      />
                    )}
                    {accountError && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--wine)' }}>{accountError}</span>
                    )}
                  </label>
                </form>
              )}

              {mode === 'confirmOverspend' && (
                <div>
                  <p style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem' }}>{d.txnDetail.dipsTitle}</p>
                  <p style={{ fontSize: '0.83rem', color: 'var(--ink-soft)', lineHeight: 1.5 }}>
                    {dipsParts[0]}
                    <span className="font-mono-tab" style={{ color: 'var(--ink)' }}>{formatCurrency(shortfall)}</span>
                    {dipsParts[1]}
                  </p>
                </div>
              )}

              {mode === 'confirmDelete' && (
                <div style={{ borderTop: '1px solid var(--line)', paddingTop: '1.15rem' }}>
                  <p style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem' }}>{d.txnDetail.deleteConfirm}</p>
                  <p style={{ fontSize: '0.83rem', color: 'var(--ink-soft)', lineHeight: 1.5 }}>
                    {renderTemplate(d.txnDetail.deleteBody, {
                      description: <strong style={{ color: 'var(--ink)' }}>{descTitle}</strong>,
                      amount: <span className="font-mono-tab" style={{ color: 'var(--ink)' }}>{formatCurrency(txn.amount)}</span>,
                      date: formatLongDate(txn.date, locale),
                    })}
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* FOOT: never scrolls; any error sits directly above the buttons so a
            failed save or delete is visible without scrolling. Absent on the
            confirmation. */}
        {!success && (
          <div className="pb-modal-foot">
            {mode === 'view' && (
              <>
                <ActionError message={error} kind={errorKind} />
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {!isAdjustment && (
                    <button type="button" onClick={() => { setMode('edit'); setError(null); }} className="pill" style={{ flex: 1, padding: '0.6rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <Pencil size={14} />{d.txnDetail.edit}
                    </button>
                  )}
                  <button type="button" onClick={() => { setMode('confirmDelete'); setError(null); }} disabled={deleteLocked} title={deleteLocked ? d.safetyLocks.lockedHint : undefined} className="pill" style={{ flex: 1, padding: '0.6rem', color: 'var(--wine)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: deleteLocked ? 0.45 : 1, cursor: deleteLocked ? 'not-allowed' : 'pointer' }}>
                    <Trash2 size={14} />{d.txnDetail.delete}
                  </button>
                </div>
                {deleteLocked && (
                  <p style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', textAlign: 'center', margin: 0 }}>{d.safetyLocks.lockedHint}</p>
                )}
              </>
            )}

            {mode === 'edit' && (
              <>
                <ActionError message={error} kind={errorKind} onRetry={handleSave} busy={busy} />
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" onClick={() => { setMode('view'); setError(null); }} className="pill" style={{ flex: 1, padding: '0.6rem' }}>{d.txnDetail.cancel}</button>
                  <button
                    type="submit" form={FORM_ID}
                    disabled={busy || netExceedsGross || !hasChanges || titleMissing}
                    className="btn-primary"
                    style={{ flex: 1, padding: '0.6rem', opacity: busy || netExceedsGross || !hasChanges || titleMissing ? 0.6 : 1 }}
                  >
                    {busy ? d.common.saving : d.txnDetail.saveChanges}
                  </button>
                </div>
              </>
            )}

            {mode === 'confirmOverspend' && (
              <>
                <ActionError message={error} kind={errorKind} onRetry={performSave} busy={busy} />
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" onClick={() => { setMode('edit'); setError(null); }} className="pill" style={{ flex: 1, padding: '0.6rem' }}>{d.txnDetail.goBack}</button>
                  <button type="button" onClick={performSave} disabled={busy} className="btn-primary" style={{ flex: 1, padding: '0.6rem', opacity: busy ? 0.6 : 1 }}>
                    {busy ? d.common.saving : d.txnDetail.proceed}
                  </button>
                </div>
              </>
            )}

            {mode === 'confirmDelete' && (
              <>
                <ActionError message={error} kind={errorKind} onRetry={handleDelete} busy={busy} />
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" onClick={() => { setMode('view'); setError(null); }} disabled={busy || deleted} className="pill" style={{ flex: 1, padding: '0.6rem' }}>{d.txnDetail.keepIt}</button>
                  <button type="button" onClick={handleDelete} disabled={busy || deleted} className="btn-primary" style={{ flex: 1, padding: '0.6rem', backgroundColor: 'var(--wine)', opacity: busy || deleted ? 0.6 : 1 }}>
                    {busy ? d.txnDetail.deleting : d.txnDetail.delete}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {deleted && <CloseSoon close={close} />}
      </>
      )}
    </ModalFrame>
  );
}

export function TransactionDetailModal({ txn, onClose, categoryMeta }: TransactionDetailModalProps) {
  if (!txn) return null;
  return <TransactionDetailContent key={txn.id} txn={txn} onClose={onClose} categoryMeta={categoryMeta} />;
}
