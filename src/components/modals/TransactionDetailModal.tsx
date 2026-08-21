'use client';

import { useEffect, useState } from 'react';
import { Banknote, Pencil, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { LoadingOverlay } from '@/components/shared/Spinner';
import type { CategoryMeta, LedgerRecord, PaymentMethod } from '@/types';
import { formatCurrency, parseLocalDate } from '@/lib/format';
import { deleteBalanceAdjustmentAction, deleteTransactionAction, updateTransactionAction } from '@/lib/actions/pebble';

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

type Mode = 'view' | 'edit' | 'confirmDelete';

export function TransactionDetailModal({ txn, onClose, categoryMeta }: TransactionDetailModalProps) {
  const [mode, setMode] = useState<Mode>('view');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [tag, setTag] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Checking');
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  const [grossPay, setGrossPay] = useState('');
  const [netPay, setNetPay] = useState('');

  // Reset whenever a different transaction is opened, so a previous edit's
  // draft never bleeds into another record.
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
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!txn) return null;

  // Adjustments are view-and-delete only: there is nothing meaningful to
  // edit, since changing the amount just means making a different correction.
  const isAdjustment = txn.type === 'adjustment';
  const meta = isAdjustment ? undefined : categoryMeta[txn.category];
  const Icon = isAdjustment ? SlidersHorizontal : (meta ? meta.icon : Banknote);
  const isIncome = !isAdjustment && txn.amount > 0;
  const iconColor = isIncome ? 'var(--pine)' : (meta ? meta.color : 'var(--ink-soft)');
  const iconBg = isIncome ? 'var(--pine-soft)' : `${meta ? meta.color : '#999999'}20`;

  // Amount, gross/net and payment method are locked outside the window: they
  // change money. Description, category and tag never are.
  const categoryNames = Object.keys(categoryMeta);
  const editingSideCash = txn.type === 'income' && category === 'Side Cash';

  const handleSave = async () => {
    // Adjustments have no edit mode - the Edit button is not rendered for
    // them - but this narrows txn.type for the action call below.
    if (busy || txn.type === 'adjustment') return;
    setBusy(true);
    setError(null);

    const result = await updateTransactionAction({
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
    });

    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    onClose();
  };

  const handleDelete = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = txn.type === 'adjustment'
      ? await deleteBalanceAdjustmentAction({ id: txn.id })
      : await deleteTransactionAction({ id: txn.id, type: txn.type });
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    onClose();
  };

  const rows = isAdjustment ? [
    { label: 'Type', value: 'Balance adjustment' },
    { label: 'Date', value: parseLocalDate(txn.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) },
    { label: 'Account', value: txn.paymentMethod },
  ] : [
    { label: 'Type', value: isIncome ? 'Income' : 'Expense' },
    { label: 'Category', value: txn.category },
    ...(txn.type === 'expense' && txn.tag ? [{ label: 'Tag / sub-category', value: txn.tag }] : []),
    { label: 'Date', value: parseLocalDate(txn.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) },
    { label: 'Payment method', value: txn.paymentMethod || '—' },
    ...(txn.type === 'income' ? [
      { label: 'Pay before deductions', value: formatCurrency(txn.grossAmount) },
      { label: 'Pay after deductions', value: formatCurrency(txn.netAmount) },
    ] : []),
  ];

  const descLines = txn.description.split('\n');
  const descTitle = descLines[0];
  const descRest = descLines.slice(1).join('\n').trim();

  return (
    <div
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,20,18,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 50, overflowY: 'auto' }}
      onClick={onClose}
    >
      <div className="card" style={{ padding: '1.75rem', width: '100%', maxWidth: 420, boxSizing: 'border-box', margin: '1rem 0', position: 'relative' }} onClick={(e) => e.stopPropagation()}>
        {busy && <LoadingOverlay label={mode === 'confirmDelete' ? 'Deleting…' : 'Saving changes…'} />}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.25rem' }}>
          <button onClick={onClose} className="icon-btn" style={{ width: 30, height: 30, borderRadius: '50%', border: 'none' }}><X size={18} /></button>
        </div>

        <div style={{ textAlign: 'center', marginBottom: '1.4rem' }}>
          <div style={{ width: 52, height: 52, borderRadius: '0.9rem', backgroundColor: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.85rem' }}>
            <Icon size={24} style={{ color: iconColor }} />
          </div>
          <p style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: descRest ? '0.2rem' : '0.35rem' }}>{descTitle}</p>
          {descRest && (
            <p style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--ink-soft)', marginBottom: '0.35rem', whiteSpace: 'pre-line' }}>{descRest}</p>
          )}
          <p className="font-display" style={{ fontSize: '2rem', fontWeight: 600, color: isIncome ? 'var(--pine)' : 'var(--wine)', marginTop: '0.3rem' }}>
            {isIncome ? '+' : ''}{formatCurrency(txn.amount)}
          </p>
        </div>

        {mode === 'view' && (
          <>
            <div style={{ borderTop: '1px solid var(--line)', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {rows.map((r) => (
                <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--ink-soft)' }}>{r.label}</span>
                  <span className="font-mono-tab" style={{ fontWeight: 500, textAlign: 'right' }}>{r.value}</span>
                </div>
              ))}
            </div>

            {isAdjustment && (
              <p style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', marginTop: '1rem', lineHeight: 1.45 }}>
                A manual correction to your balance. It appears here in your statement but is left out
                of Reports, since it is not real spending or income.
              </p>
            )}

            {error && <p style={{ fontSize: '0.8rem', color: 'var(--wine)', marginTop: '0.9rem' }}>{error}</p>}

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.35rem' }}>
              {!isAdjustment && (
                <button type="button" onClick={() => { setMode('edit'); setError(null); }} className="pill" style={{ flex: 1, padding: '0.6rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <Pencil size={14} />Edit
                </button>
              )}
              <button type="button" onClick={() => { setMode('confirmDelete'); setError(null); }} className="pill" style={{ flex: 1, padding: '0.6rem', color: 'var(--wine)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Trash2 size={14} />Delete
              </button>
            </div>
          </>
        )}

        {mode === 'edit' && (
          <div style={{ borderTop: '1px solid var(--line)', paddingTop: '1.15rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            <label style={labelStyle}>
              Description
              <textarea
                value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
              />
            </label>

            {txn.type === 'expense' ? (
              <>
                <label style={labelStyle}>
                  Category
                  <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
                    {categoryNames.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label style={labelStyle}>
                  Tag <span style={{ opacity: 0.7 }}>(optional)</span>
                  <input value={tag} onChange={(e) => setTag(e.target.value)} style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  Amount
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
                  Category
                  <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
                    <option value="Standard Income">Standard Income</option>
                    <option value="Side Cash">Side Cash</option>
                  </select>
                </label>
                {editingSideCash && (
                  <p style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', lineHeight: 1.45, margin: 0 }}>
                    Side cash counts toward your balance and appears in Reports, but is left out of the
                    Income and Savings rate figures on your dashboard — those track standard income only.
                  </p>
                )}
                {(
                  <>
                    {!editingSideCash && (
                      <label style={labelStyle}>
                        Pay before deductions
                        <input type="number" min="0" step="0.01" value={grossPay} onChange={(e) => setGrossPay(e.target.value)} className="font-mono-tab" style={inputStyle} />
                      </label>
                    )}
                    <label style={labelStyle}>
                      {editingSideCash ? 'Amount' : 'Pay after deductions'}
                      <input type="number" min="0" step="0.01" value={netPay} onChange={(e) => setNetPay(e.target.value)} className="font-mono-tab" style={inputStyle} />
                    </label>
                  </>
                )}
              </>
            )}

            {(
              <label style={labelStyle}>
                Payment method
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {(['Checking', 'Cash'] as const).map((m) => (
                    <button key={m} type="button" onClick={() => setPaymentMethod(m)} className={`pill ${paymentMethod === m ? 'active' : ''}`} style={{ flex: 1, padding: '0.5rem' }}>
                      {m}
                    </button>
                  ))}
                </div>
              </label>
            )}

            <label style={labelStyle}>
              Date
              <input
                type="date" value={date}
                onChange={(e) => setDate(e.target.value)} style={inputStyle}
              />
            </label>

            {error && <p style={{ fontSize: '0.8rem', color: 'var(--wine)', margin: 0 }}>{error}</p>}

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" onClick={() => { setMode('view'); setError(null); }} className="pill" style={{ flex: 1, padding: '0.6rem' }}>Cancel</button>
              <button type="button" onClick={handleSave} disabled={busy} className="btn-primary" style={{ flex: 1, padding: '0.6rem', opacity: busy ? 0.6 : 1 }}>
                {busy ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        )}

        {mode === 'confirmDelete' && (
          <div style={{ borderTop: '1px solid var(--line)', paddingTop: '1.15rem' }}>
            <p style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem' }}>Delete this transaction?</p>
            <p style={{ fontSize: '0.83rem', color: 'var(--ink-soft)', lineHeight: 1.5, marginBottom: '1.1rem' }}>
              <strong style={{ color: 'var(--ink)' }}>{descTitle}</strong> for{' '}
              <span className="font-mono-tab" style={{ color: 'var(--ink)' }}>{formatCurrency(txn.amount)}</span> on{' '}
              {parseLocalDate(txn.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              {' '}will be removed as if it had never been recorded. Your balances will adjust. This cannot be undone.
            </p>

            {error && <p style={{ fontSize: '0.8rem', color: 'var(--wine)', marginBottom: '0.9rem' }}>{error}</p>}

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" onClick={() => { setMode('view'); setError(null); }} className="pill" style={{ flex: 1, padding: '0.6rem' }}>Keep it</button>
              <button type="button" onClick={handleDelete} disabled={busy} className="btn-primary" style={{ flex: 1, padding: '0.6rem', backgroundColor: 'var(--wine)', opacity: busy ? 0.6 : 1 }}>
                {busy ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
