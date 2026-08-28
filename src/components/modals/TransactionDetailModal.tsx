'use client';

import { useEffect, useState } from 'react';
import { Banknote, Pencil, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { LoadingOverlay } from '@/components/shared/Spinner';
import type { CategoryMeta, LedgerRecord, PaymentMethod } from '@/types';
import { formatCurrency, formatFullDate, formatLongDate } from '@/lib/format';
import { deductionPct } from '@/lib/stats';
import { deleteBalanceAdjustmentAction, deleteTransactionAction, getAllocationSummaryAction, updateTransactionAction } from '@/lib/actions/pebble';
import { callAction } from '@/lib/actions/callAction';
import type { FailureKind } from '@/lib/actions/failureKind';
import { ActionError } from '@/components/shared/ActionError';
import { SearchableSelect, type SearchableSelectOption } from '@/components/shared/SearchableSelect';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { translateActionError } from '@/lib/i18n/actionErrors';
import { categoryLabel, paymentMethodLabel } from '@/lib/i18n/enumLabels';
import { renderTemplate } from '@/lib/i18n/RichText';

interface TransactionDetailModalProps {
  txn: LedgerRecord | null;
  onClose: () => void;
  categoryMeta: CategoryMeta;
}

const inputStyle: React.CSSProperties = {
  padding: '0.55rem 0.7rem', borderRadius: '0.6rem', border: '1px solid var(--line)',
  fontSize: '0.88rem', color: 'var(--ink)', backgroundColor: 'var(--paper)',
  boxSizing: 'border-box', width: '100%',
};
const labelStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: '0.3rem',
  fontSize: '0.78rem', color: 'var(--ink-soft)',
};

type Mode = 'view' | 'edit' | 'confirmDelete' | 'confirmOverspend';

export function TransactionDetailModal({ txn, onClose, categoryMeta }: TransactionDetailModalProps) {
  const { d, t, locale } = useTranslation();
  const [mode, setMode] = useState<Mode>('view');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<FailureKind | undefined>(undefined);
  const [shortfall, setShortfall] = useState(0);

  // A write in flight must not be cancellable - see AddTransactionModal.
  // LoadingOverlay covers the card only, so the backdrop, the X and the
  // Escape key each need their own guard.
  const requestClose = () => { if (busy) return; onClose(); };

  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [tag, setTag] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Checking');
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  const [grossPay, setGrossPay] = useState('');
  const [netPay, setNetPay] = useState('');

  // Reset whenever a different transaction is opened, so a previous edit's
  // draft never bleeds into another record. Every value seeded here comes
  // straight off the stored row - none of it is ever a label.
  useEffect(() => {
    if (!txn) return;
    setMode('view');
    setError(null);
    setDescription(txn.description);
    setCategory(txn.type === 'adjustment' ? '' : txn.category);
    setTag(txn.type === 'expense' ? (txn.tag ?? '') : '');
    setPaymentMethod(txn.paymentMethod);
    setDate(txn.date);
    setAmount(txn.type === 'expense' ? String(Math.abs(txn.amount)) : '');
    setGrossPay(txn.type === 'income' ? String(txn.grossAmount) : '');
    setNetPay(txn.type === 'income' ? String(txn.netAmount) : '');
  }, [txn]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, busy]);

  if (!txn) return null;

  // Adjustments are view-and-delete only: there is nothing meaningful to
  // edit, since changing the amount just means making a different correction.
  const isAdjustment = txn.type === 'adjustment';
  const meta = isAdjustment ? undefined : categoryMeta[txn.category];
  const Icon = isAdjustment ? SlidersHorizontal : (meta ? meta.icon : Banknote);
  const isIncome = !isAdjustment && txn.amount > 0;
  const iconColor = isIncome ? 'var(--pine)' : (meta ? meta.color : 'var(--ink-soft)');
  const iconBg = isIncome ? 'var(--pine-soft)' : `${meta ? meta.color : '#999999'}20`;

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

  // Amount, gross/net and payment method are locked outside the window: they
  // change money. Description, category and tag never are.
  const categoryNames = Object.keys(categoryMeta);
  // categoryMeta already carries a resolved icon and colour per name, so no
  // resolveCategoryIcon() call is needed here. label === value: category
  // names are USER DATA and are never translated.
  const categoryOptions: SearchableSelectOption[] = categoryNames.map((name) => ({
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
  // arrived than was earned, so it is refused rather than silently clamped -
  // rewriting a typed amount on a money form hides the correction from the
  // person making it.
  //
  // A blank or half-typed field is not an error: both values must parse before
  // the comparison is meaningful, otherwise the form flashes red mid-keystroke.
  const draftGross = Number(grossPay);
  const draftNet = Number(netPay);
  const draftAmountsParse =
    grossPay.trim() !== '' && netPay.trim() !== ''
    && Number.isFinite(draftGross) && Number.isFinite(draftNet);
  const netExceedsGross = txn.type === 'income' && !editingSideCash && draftAmountsParse && draftNet > draftGross;

  // Saving an unchanged record would issue an UPDATE that writes the same
  // values back, then revalidate every route and re-run the whole query set
  // for nothing. Compared against the persisted record, not a snapshot taken
  // when edit mode opened, so typing a change and undoing it disables the
  // button again rather than leaving the form permanently "dirty".
  //
  // Amounts compare as numbers: the form holds strings, so "1600.00" and
  // "1600" are the same value and must not read as an edit.
  //
  // Every comparison here is value-to-value. Nothing in this block is
  // language-dependent, so switching locale can never mark a form dirty.
  const hasChanges = (() => {
    if (txn.type === 'adjustment') return false;
    if (description.trim() !== txn.description.trim()) return true;
    if (category !== txn.category) return true;
    if (paymentMethod !== txn.paymentMethod) return true;
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

  // Split from handleSave so the confirm dialog can call it directly. The edit
  // form stays mounted behind the dialog, so this re-derives its payload from
  // the same state rather than from a copy taken before the check.
  const performSave = async () => {
    if (busy || txn.type === 'adjustment') return;
    setBusy(true);
    setError(null);

    const result = await callAction(() => updateTransactionAction({
      id: txn.id,
      type: txn.type,
      description,
      category,
      ...(txn.type === 'expense' ? { tag } : {}),
      date,
      paymentMethod,
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
    onClose();
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
        // unread.
        if (unallocatedNow >= 0 && unallocatedAfter < 0) {
          setShortfall(Math.abs(unallocatedAfter));
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
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = txn.type === 'adjustment'
      ? await callAction(() => deleteBalanceAdjustmentAction({ id: txn.id }))
      : await callAction(() => deleteTransactionAction({ id: txn.id, type: txn.type }));
    setBusy(false);
    if (!result.ok) { setError(translateActionError(d, locale, result)); setErrorKind(result.kind); return; }
    onClose();
  };

  // Each row carries a STABLE key alongside its label. The key was the label
  // until this change - which meant every row remounted on a language switch,
  // since React saw eight different keys.
  const rows: { key: string; label: string; value: string }[] = isAdjustment ? [
    { key: 'type', label: d.txnDetail.rowType, value: d.txn.balanceAdjustment },
    { key: 'date', label: d.txnDetail.rowDate, value: formatFullDate(txn.date, locale) },
    { key: 'account', label: d.txnDetail.rowAccount, value: paymentMethodLabel(d, txn.paymentMethod) },
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
    { key: 'method', label: isIncome ? d.txnDetail.rowDepositedTo : d.txnDetail.rowPaymentMethod, value: paymentMethodLabel(d, txn.paymentMethod) || '—' },
    // Side cash is untaxed, so the actions store gross = net. Showing both
    // rows would print the same number twice under two labels that imply a
    // deduction happened. One "Amount" row, matching the edit form's label.
    ...(txn.type === 'income' ? (isSideCash ? [
      { key: 'amount', label: d.txnDetail.rowAmount, value: formatCurrency(txn.netAmount) },
    ] : [
      { key: 'gross', label: d.txnDetail.rowPayBefore, value: formatCurrency(txn.grossAmount) },
      { key: 'net', label: d.txnDetail.rowPayAfter, value: formatCurrency(txn.netAmount) },
      // Derived at render, never stored. The imported data had a
      // tax_percentage column, dropped deliberately because gross and net
      // already determine it - storing it would be a second source of truth
      // that can drift when either amount is edited.
      //
      // Labelled "deductions" to match the two rows above: the gap between
      // gross and net also covers insurance and retirement, not just tax.
      // Only reached in the non-Side-Cash branch, where gross and net are
      // genuinely distinct; Side Cash stores gross = net and shows a single
      // Amount row, so a permanent 0.0% row there would be noise.
      {
        key: 'deductions',
        label: d.txnDetail.rowDeductions,
        value: `${deductionPct(txn.grossAmount, txn.netAmount).toFixed(1)}%`,
      },
    ]) : []),
  ];

  const descLines = txn.description.split('\n');
  const descTitle = descLines[0];
  const descRest = descLines.slice(1).join('\n').trim();

  const dipsParts = d.txnDetail.dipsBody.split('{amount}');

  return (
    <div
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,20,18,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 50, overflowY: 'auto' }}
      onClick={requestClose}
    >
      <div className="card" style={{ padding: '1.75rem', width: '100%', maxWidth: 420, boxSizing: 'border-box', margin: '1rem 0', position: 'relative' }} onClick={(e) => e.stopPropagation()}>
        {busy && <LoadingOverlay label={mode === 'confirmDelete' ? d.txnDetail.deletingOverlay : d.txnDetail.savingChanges} />}
        {/* mode drives which panel shows; 'confirmOverspend' pauses a save
            without unmounting the edit form behind it. */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.25rem' }}>
          <button onClick={requestClose} disabled={busy} className="icon-btn" style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', opacity: busy ? 0.4 : 1 }}><X size={18} /></button>
        </div>

        <div style={{ textAlign: 'center', marginBottom: '1.4rem' }}>
          <div style={{ width: 52, height: 52, borderRadius: '0.9rem', backgroundColor: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.85rem' }}>
            <Icon size={24} style={{ color: iconColor }} />
          </div>
          <p style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: descRest ? '0.2rem' : '0.35rem' }}>{descTitle}</p>
          {descRest && (
            <p style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--ink-soft)', marginBottom: '0.35rem', whiteSpace: 'pre-line' }}>{descRest}</p>
          )}
          <p className="font-display" style={{ fontSize: '2rem', fontWeight: 600, color: amountColor, marginTop: '0.3rem' }}>
            {amountSign}{amountText}
          </p>
        </div>

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

            <ActionError message={error} kind={errorKind} style={{ marginTop: '0.9rem' }} />

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.35rem' }}>
              {!isAdjustment && (
                <button type="button" onClick={() => { setMode('edit'); setError(null); }} className="pill" style={{ flex: 1, padding: '0.6rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <Pencil size={14} />{d.txnDetail.edit}
                </button>
              )}
              <button type="button" onClick={() => { setMode('confirmDelete'); setError(null); }} className="pill" style={{ flex: 1, padding: '0.6rem', color: 'var(--wine)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Trash2 size={14} />{d.txnDetail.delete}
              </button>
            </div>
          </>
        )}

        {mode === 'edit' && (
          <div style={{ borderTop: '1px solid var(--line)', paddingTop: '1.15rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            <label style={labelStyle}>
              {d.txnDetail.description}
              <textarea
                value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
              />
            </label>

            {txn.type === 'expense' ? (
              <>
                {/* A div, not a label: <label> forwards clicks to its control, so
                    clicking the word "Category" would open the dropdown. The input
                    carries its own accessible name via ariaLabel. */}
                <div style={labelStyle}>
                  <span>{d.txnDetail.rowCategory}</span>
                  <SearchableSelect
                    value={category}
                    onChange={setCategory}
                    options={categoryOptions}
                    placeholder={d.select.searchCategories}
                    ariaLabel={d.txnDetail.rowCategory}
                  />
                </div>
                <label style={labelStyle}>
                  {d.txnDetail.tag} <span style={{ opacity: 0.7 }}>{d.txnDetail.optional}</span>
                  <input value={tag} onChange={(e) => setTag(e.target.value)} style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  {d.txnDetail.rowAmount}
                  <input
                    type="number" min="0" step="0.01" value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="font-mono-tab" style={inputStyle}
                  />
                </label>
              </>
            ) : (
              <>
                <label style={labelStyle}>
                  {d.txnDetail.rowCategory}
                  <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
                    {/* ⚠️ Matched as string literals by isSideCash() and the
                        income filters in stats.ts. Only the text is translated. */}
                    <option value="Standard Income">{d.enums.incomeCategory['Standard Income']}</option>
                    <option value="Side Cash">{d.enums.incomeCategory['Side Cash']}</option>
                  </select>
                </label>
                {editingSideCash && (
                  <p style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', lineHeight: 1.45, margin: 0 }}>
                    {d.txnDetail.sideCashNote}
                  </p>
                )}
                {(
                  <>
                    {!editingSideCash && (
                      <label style={labelStyle}>
                        {d.txnDetail.rowPayBefore}
                        <input type="number" min="0" step="0.01" value={grossPay} onChange={(e) => setGrossPay(e.target.value)} className="font-mono-tab" style={inputStyle} />
                      </label>
                    )}
                    <label style={labelStyle}>
                      {editingSideCash ? d.txnDetail.rowAmount : d.txnDetail.rowPayAfter}
                      <input
                        type="number" min="0" step="0.01" value={netPay}
                        onChange={(e) => setNetPay(e.target.value)}
                        className="font-mono-tab"
                        style={{ ...inputStyle, border: `1px solid ${netExceedsGross ? 'var(--wine)' : 'var(--line)'}` }}
                      />
                    </label>
                    {!editingSideCash && (
                      netExceedsGross ? (
                        <p style={{ fontSize: '0.75rem', color: 'var(--wine)', lineHeight: 1.45, margin: 0 }}>
                          {d.txnDetail.netExceedsGross}
                        </p>
                      ) : draftAmountsParse && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', fontSize: '0.78rem', color: 'var(--ink-soft)' }}>
                          <span>{d.txnDetail.rowDeductions}</span>
                          <span className="font-mono-tab" style={{ fontWeight: 500 }}>
                            {deductionPct(draftGross, draftNet).toFixed(1)}%
                          </span>
                        </div>
                      )
                    )}
                  </>
                )}
              </>
            )}

            {(
              <label style={labelStyle}>
                {txn.type === 'income' ? d.txnDetail.rowDepositedTo : d.txnDetail.rowPaymentMethod}
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {/* CHECK-constrained values. setPaymentMethod always
                      receives the English literal. */}
                  {(['Checking', 'Cash'] as const).map((m) => (
                    <button key={m} type="button" onClick={() => setPaymentMethod(m)} className={`pill ${paymentMethod === m ? 'active' : ''}`} style={{ flex: 1, padding: '0.5rem' }}>
                      {d.enums.paymentMethod[m]}
                    </button>
                  ))}
                </div>
              </label>
            )}

            <label style={labelStyle}>
              {d.txnDetail.rowDate}
              <input
                type="date" value={date}
                onChange={(e) => setDate(e.target.value)} style={inputStyle}
              />
            </label>

            <ActionError message={error} kind={errorKind} onRetry={handleSave} busy={busy} />

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" onClick={() => { setMode('view'); setError(null); }} className="pill" style={{ flex: 1, padding: '0.6rem' }}>{d.txnDetail.cancel}</button>
              <button
                type="button" onClick={handleSave}
                disabled={busy || netExceedsGross || !hasChanges}
                className="btn-primary"
                style={{ flex: 1, padding: '0.6rem', opacity: busy || netExceedsGross || !hasChanges ? 0.6 : 1 }}
              >
                {busy ? d.common.saving : d.txnDetail.saveChanges}
              </button>
            </div>
          </div>
        )}

        {mode === 'confirmOverspend' && (
          <div style={{ borderTop: '1px solid var(--line)', paddingTop: '1.15rem' }}>
            <p style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem' }}>{d.txnDetail.dipsTitle}</p>
            <p style={{ fontSize: '0.83rem', color: 'var(--ink-soft)', lineHeight: 1.5, marginBottom: '1.1rem' }}>
              {dipsParts[0]}
              <span className="font-mono-tab" style={{ color: 'var(--ink)' }}>{formatCurrency(shortfall)}</span>
              {dipsParts[1]}
            </p>

            <ActionError message={error} kind={errorKind} onRetry={performSave} busy={busy} style={{ marginBottom: '0.9rem' }} />

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" onClick={() => { setMode('edit'); setError(null); }} className="pill" style={{ flex: 1, padding: '0.6rem' }}>{d.txnDetail.goBack}</button>
              <button type="button" onClick={performSave} disabled={busy} className="btn-primary" style={{ flex: 1, padding: '0.6rem', opacity: busy ? 0.6 : 1 }}>
                {busy ? d.common.saving : d.txnDetail.proceed}
              </button>
            </div>
          </div>
        )}

        {mode === 'confirmDelete' && (
          <div style={{ borderTop: '1px solid var(--line)', paddingTop: '1.15rem' }}>
            <p style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem' }}>{d.txnDetail.deleteConfirm}</p>
            <p style={{ fontSize: '0.83rem', color: 'var(--ink-soft)', lineHeight: 1.5, marginBottom: '1.1rem' }}>
              {renderTemplate(d.txnDetail.deleteBody, {
                description: <strong style={{ color: 'var(--ink)' }}>{descTitle}</strong>,
                amount: <span className="font-mono-tab" style={{ color: 'var(--ink)' }}>{formatCurrency(txn.amount)}</span>,
                date: formatLongDate(txn.date, locale),
              })}
            </p>

            <ActionError message={error} kind={errorKind} onRetry={handleDelete} busy={busy} style={{ marginBottom: '0.9rem' }} />

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" onClick={() => { setMode('view'); setError(null); }} className="pill" style={{ flex: 1, padding: '0.6rem' }}>{d.txnDetail.keepIt}</button>
              <button type="button" onClick={handleDelete} disabled={busy} className="btn-primary" style={{ flex: 1, padding: '0.6rem', backgroundColor: 'var(--wine)', opacity: busy ? 0.6 : 1 }}>
                {busy ? d.txnDetail.deleting : d.txnDetail.delete}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
