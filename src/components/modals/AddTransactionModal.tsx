'use client';

import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { LoadingOverlay, Spinner } from '@/components/shared/Spinner';
import { SearchableSelect, type SearchableSelectOption } from '@/components/shared/SearchableSelect';
import { resolveCategoryIcon } from '@/lib/data/icons';
import type { CategoryItem } from '@/lib/data/mappers';
import { addTransactionAction, getAllocationSummaryAction, getCategoriesAction } from '@/lib/actions/pebble';
import { callAction } from '@/lib/actions/callAction';
import type { FailureKind } from '@/lib/actions/failureKind';
import { ActionError } from '@/components/shared/ActionError';
import { playEventSound } from '@/lib/sound/useSound';
import { formatCurrency, todayDateString } from '@/lib/format';
import { deductionPct } from '@/lib/stats';

interface AddTransactionModalProps {
  onClose: () => void;
}

export function AddTransactionModal({ onClose }: AddTransactionModalProps) {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveErrorKind, setSaveErrorKind] = useState<FailureKind | undefined>(undefined);
  // Set when a save is paused awaiting confirmation. Holds the shortfall only -
  // the form stays mounted behind the confirm, so the write re-derives its
  // payload from the same state rather than from a copy taken earlier.
  const [pendingShortfall, setPendingShortfall] = useState<number | null>(null);
  // Full items, not just names: the combobox shows each category's icon and
  // colour, and those live on CategoryItem. Icons are resolved here on the
  // client from iconKey - they cannot cross the RSC boundary.
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  // Loaded on open rather than via the layout: this modal lives in AppShell,
  // so a layout fetch would run on every page navigation.
  useEffect(() => {
    let active = true;
    // A failure here used to return silently, leaving an empty dropdown with
    // no explanation - and the expense form could still be submitted with an
    // empty category. Surfaced instead.
    callAction(getCategoriesAction, "Couldn't load your categories.").then((result) => {
      if (!active) return;
      if (!result.ok) { setCategoryError(result.error); return; }
      setCategories(result.categories);
      setCategoryError(null);
      setCategory((current) => current || result.categories[0]?.name || '');
    });
    return () => { active = false; };
  }, []);

  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(todayDateString());
  const [paymentMethod, setPaymentMethod] = useState<'Checking' | 'Cash'>('Checking');
  const [category, setCategory] = useState('');
  const [tag, setTag] = useState('');
  const [amount, setAmount] = useState('');
  const [incomeCategory, setIncomeCategory] = useState<'Standard Income' | 'Side Cash'>('Standard Income');
  const [grossPay, setGrossPay] = useState('');
  const [netPay, setNetPay] = useState('');

  const isSideCashSelected = incomeCategory === 'Side Cash';

  const categoryOptions = useMemo<SearchableSelectOption[]>(
    () => categories.map((c) => ({
      value: c.name,
      label: c.name,
      icon: resolveCategoryIcon(c.iconKey),
      color: c.color,
    })),
    [categories],
  );

  // Gross is optional here: left blank it means no deductions, and the submit
  // handler below falls back to net. So an empty gross is valid, NOT an error -
  // the guard only fires when a gross was actually entered and came out below
  // net, which would mean more money arrived than was earned.
  //
  // Refused rather than silently corrected: rewriting a typed amount on a money
  // form hides the change from the person making it.
  const draftGross = Number(grossPay);
  const draftNet = Number(netPay);
  const grossEntered = grossPay.trim() !== '' && Number.isFinite(draftGross);
  const netEntered = netPay.trim() !== '' && Number.isFinite(draftNet);
  const showDeductionPreview = !isSideCashSelected && grossEntered && netEntered && draftGross > 0;
  const netExceedsGross = !isSideCashSelected && grossEntered && netEntered && draftNet > draftGross;

  const inputStyle: React.CSSProperties = { padding: '0.6rem 0.75rem', borderRadius: '0.6rem', border: '1px solid var(--line)', fontSize: '0.9rem', color: 'var(--ink)', backgroundColor: 'var(--paper)', boxSizing: 'border-box' };
  const labelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.8rem', color: 'var(--ink-soft)' };

  // A save in flight must not be cancellable. The write continues regardless,
  // so closing here would read as success for something still unresolved and
  // would leave any error with nowhere to land. LoadingOverlay covers the card
  // only - the backdrop and the X sit outside it, so they need their own guard.
  const requestClose = () => { if (saving) return; onClose(); };

  const performSave = async () => {
    setSaving(true);
    setSaveError(null);

    let result;
    if (type === 'expense') {
      result = await callAction(() => addTransactionAction({ type, description, date, paymentMethod, category, tag: tag.trim(), amount: Number(amount) }));
    } else {
      // Side cash is untaxed: one amount fills both gross and net.
      const gross = isSideCashSelected
        ? Number(netPay)
        : (grossPay ? Number(grossPay) : Number(netPay));
      result = await callAction(() => addTransactionAction({ type, description, date, paymentMethod, category: incomeCategory, grossAmount: gross, netAmount: Number(netPay) }));
    }

    setSaving(false);
    setPendingShortfall(null);
    if (!result.ok) {
      setSaveError(result.error);
      setSaveErrorKind(result.kind);
      playEventSound('saveFailed');
      return;
    }
    // Below the failure return, so a failed write can never play a success
    // sound. Fire-and-forget - playback cannot delay the close.
    playEventSound(type === 'expense' ? 'expenseSaved' : 'incomeSaved');
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || !date || saving) return;

    if (type === 'expense') {
      if (!amount || Number(amount) <= 0) return;
    } else {
      if (!netPay || Number(netPay) <= 0) return;
      if (netExceedsGross) {
        setSaveError('Pay after deductions cannot be more than pay before deductions.');
        setSaveErrorKind('validation');
        return;
      }
    }

    // Only spending can eat into money set aside for goals; income raises the
    // balance and never needs the check.
    //
    // Fetched here rather than when the modal opened so the figures cannot go
    // stale between opening the form and submitting it.
    if (type === 'expense') {
      setSaving(true);
      setSaveError(null);
      const summary = await callAction(getAllocationSummaryAction);
      setSaving(false);

      if (summary.ok) {
        const unallocatedNow = summary.totalBalance - summary.allocated;
        const unallocatedAfter = unallocatedNow - Number(amount);
        // Warns on the crossing only. Warning on every expense while already
        // over-allocated would train the dialog to be dismissed unread.
        if (unallocatedNow >= 0 && unallocatedAfter < 0) {
          setPendingShortfall(Math.abs(unallocatedAfter));
          return;
        }
      }
      // A failed lookup does not block the save: the check is advisory, and
      // refusing to record real spending over it would be the worse outcome.
    }

    await performSave();
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,20,18,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 50, overflowY: 'auto' }}
      onClick={requestClose}
    >
      <div className="card" style={{ padding: '1.75rem', width: '100%', maxWidth: 420, boxSizing: 'border-box', margin: '1rem 0', position: 'relative' }} onClick={(e) => e.stopPropagation()}>
        {saving && <LoadingOverlay label="Saving transaction…" />}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.3rem' }}>
          <h2 className="font-display" style={{ fontSize: '1.2rem', fontWeight: 600 }}>Add transaction</h2>
          <button onClick={requestClose} disabled={saving} className="icon-btn" style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', opacity: saving ? 0.4 : 1 }}><X size={18} /></button>
        </div>
        {pendingShortfall !== null ? (
          <div>
            <p style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem' }}>This dips into your goals</p>
            <p style={{ fontSize: '0.83rem', color: 'var(--ink-soft)', lineHeight: 1.5, marginBottom: '1.1rem' }}>
              This transaction spends{' '}
              <span className="font-mono-tab" style={{ color: 'var(--ink)' }}>{formatCurrency(pendingShortfall)}</span>{' '}
              you had set aside for goals. That is fine to do — your goals will just be counting on money
              that is not there yet.
            </p>
            <ActionError message={saveError} kind={saveErrorKind} onRetry={performSave} busy={saving} style={{ marginBottom: '0.9rem' }} />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" onClick={() => setPendingShortfall(null)} className="pill" style={{ flex: 1, padding: '0.6rem' }}>Go back</button>
              <button type="button" onClick={performSave} disabled={saving} className="btn-primary" style={{ flex: 1, padding: '0.6rem', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Saving…' : 'Continue'}
              </button>
            </div>
          </div>
        ) : (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {(['expense', 'income'] as const).map((t) => (
              <button
                key={t} type="button" onClick={() => setType(t)}
                className={`pill ${type === t ? 'active' : ''}`}
                style={{ flex: 1, textTransform: 'capitalize', padding: '0.55rem' }}
              >
                {t}
              </button>
            ))}
          </div>

          <label style={labelStyle}>
            Description
            <textarea
              value={description} onChange={(e) => setDescription(e.target.value)} required rows={2}
              placeholder={"e.g. Coffee shop\nOptional notes on the next line"}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', minHeight: '2.6rem' }}
            />
          </label>

          {type === 'expense' ? (
            <>
              {/* A div, not a label: <label> forwards clicks to its control, and
                  the dropdown renders inside this block - clicking an option
                  would fire the option AND a forwarded click on the input,
                  reopening the list. Native <select> escapes this because the
                  browser draws its popup outside the DOM. */}
              <div style={labelStyle}>
                {/* Not a <label htmlFor>: clicking a label dispatches a synthetic
                    click on its control, which would open the dropdown from a
                    click on the word "Category". The input carries its own
                    accessible name via aria-label. */}
                <span>Category</span>
                <SearchableSelect
                  id="add-txn-category"
                  value={category}
                  onChange={setCategory}
                  options={categoryOptions}
                  placeholder={categoryError ? 'Unavailable' : 'Search categories…'}
                  disabled={categoryOptions.length === 0}
                  ariaLabel="Category"
                />
                {categoryError && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--wine)', lineHeight: 1.45 }}>{categoryError}</span>
                )}
              </div>
              <label style={labelStyle}>
                Tag <span style={{ opacity: 0.7 }}>(sub-category, optional)</span>
                <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="e.g. Groceries" style={inputStyle} />
              </label>
              <label style={labelStyle}>
                Amount
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-soft)', fontSize: '0.9rem' }}>$</span>
                  <input
                    type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" required
                    className="font-mono-tab" style={{ ...inputStyle, width: '100%', paddingLeft: '1.6rem' }}
                  />
                </div>
              </label>
            </>
          ) : (
            <>
              <label style={labelStyle}>
                Category
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {(['Standard Income', 'Side Cash'] as const).map((c) => (
                    <button
                      key={c} type="button" onClick={() => setIncomeCategory(c)}
                      className={`pill ${incomeCategory === c ? 'active' : ''}`}
                      style={{ flex: 1, padding: '0.55rem' }}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                {isSideCashSelected && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', lineHeight: 1.45 }}>
                    Side cash counts toward your balance and appears in Reports, but is left out of the
                    Income and Savings rate figures on your dashboard — those track standard income only.
                  </span>
                )}
              </label>
              {!isSideCashSelected && (
                <label style={labelStyle}>
                  Pay before deductions
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-soft)', fontSize: '0.9rem' }}>$</span>
                    <input
                      type="number" min="0" step="0.01" value={grossPay} onChange={(e) => setGrossPay(e.target.value)} placeholder="0.00"
                      className="font-mono-tab" style={{ ...inputStyle, width: '100%', paddingLeft: '1.6rem' }}
                    />
                  </div>
                </label>
              )}
              <label style={labelStyle}>
                {isSideCashSelected ? 'Amount' : 'Pay after deductions'}
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-soft)', fontSize: '0.9rem' }}>$</span>
                  <input
                    type="number" min="0" step="0.01" value={netPay} onChange={(e) => setNetPay(e.target.value)} placeholder="0.00" required
                    className="font-mono-tab"
                    style={{ ...inputStyle, width: '100%', paddingLeft: '1.6rem', border: `1px solid ${netExceedsGross ? 'var(--wine)' : 'var(--line)'}` }}
                  />
                </div>
              </label>
              {netExceedsGross ? (
                <p style={{ fontSize: '0.75rem', color: 'var(--wine)', lineHeight: 1.45, margin: 0 }}>
                  Pay after deductions cannot be more than pay before deductions.
                </p>
              ) : showDeductionPreview && (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', fontSize: '0.78rem', color: 'var(--ink-soft)' }}>
                  <span>Deductions</span>
                  <span className="font-mono-tab" style={{ fontWeight: 500 }}>
                    {deductionPct(draftGross, draftNet).toFixed(1)}%
                  </span>
                </div>
              )}
            </>
          )}

          <label style={labelStyle}>
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required style={inputStyle} />
          </label>

          <label style={labelStyle}>
            Payment method
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {(['Checking', 'Cash'] as const).map((m) => (
                <button
                  key={m} type="button" onClick={() => setPaymentMethod(m)}
                  className={`pill ${paymentMethod === m ? 'active' : ''}`}
                  style={{ flex: 1, padding: '0.55rem' }}
                >
                  {m}
                </button>
              ))}
            </div>
          </label>

          <ActionError message={saveError} kind={saveErrorKind} onRetry={performSave} busy={saving} />

          <button type="submit" disabled={saving || netExceedsGross} className="btn-primary" style={{ marginTop: '0.5rem', padding: '0.72rem', opacity: saving || netExceedsGross ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            {saving ? <><Spinner size={14} /> Saving…</> : 'Add transaction'}
          </button>
        </form>
        )}
      </div>
    </div>
  );
}
