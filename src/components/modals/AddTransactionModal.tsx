'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { addTransactionAction } from '@/lib/actions/pebble';
import { initialCategoryMeta } from '@/data/seed';
import { todayDateString } from '@/lib/format';

const CATEGORY_NAMES = Object.keys(initialCategoryMeta);

interface AddTransactionModalProps {
  onClose: () => void;
}

export function AddTransactionModal({ onClose }: AddTransactionModalProps) {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(todayDateString());
  const [paymentMethod, setPaymentMethod] = useState<'Checking' | 'Cash'>('Checking');
  const [category, setCategory] = useState(CATEGORY_NAMES[0] ?? '');
  const [tag, setTag] = useState('');
  const [amount, setAmount] = useState('');
  const [incomeCategory, setIncomeCategory] = useState<'Standard Income' | 'Side Cash'>('Standard Income');
  const [grossPay, setGrossPay] = useState('');
  const [netPay, setNetPay] = useState('');

  const inputStyle: React.CSSProperties = { padding: '0.6rem 0.75rem', borderRadius: '0.6rem', border: '1px solid var(--line)', fontSize: '0.9rem', color: 'var(--ink)', backgroundColor: 'var(--paper)', boxSizing: 'border-box' };
  const labelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.8rem', color: 'var(--ink-soft)' };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || !date || saving) return;

    let result;
    setSaving(true);
    setSaveError(null);

    if (type === 'expense') {
      if (!amount || Number(amount) <= 0) { setSaving(false); return; }
      result = await addTransactionAction({ type, description, date, paymentMethod, category, tag: tag.trim(), amount: Number(amount) });
    } else {
      if (!netPay || Number(netPay) <= 0) { setSaving(false); return; }
      const gross = grossPay ? Number(grossPay) : Number(netPay);
      result = await addTransactionAction({ type, description, date, paymentMethod, category: incomeCategory, grossAmount: gross, netAmount: Number(netPay) });
    }

    setSaving(false);
    if (!result.ok) { setSaveError(result.error); return; }
    onClose();
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,20,18,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 50, overflowY: 'auto' }}
      onClick={onClose}
    >
      <div className="card" style={{ padding: '1.75rem', width: '100%', maxWidth: 420, boxSizing: 'border-box', margin: '1rem 0' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.3rem' }}>
          <h2 className="font-display" style={{ fontSize: '1.2rem', fontWeight: 600 }}>Add transaction</h2>
          <button onClick={onClose} className="icon-btn" style={{ width: 30, height: 30, borderRadius: '50%', border: 'none' }}><X size={18} /></button>
        </div>
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
              <label style={labelStyle}>
                Category
                <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
                  {CATEGORY_NAMES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
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
              </label>
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
              <label style={labelStyle}>
                Pay after deductions
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-soft)', fontSize: '0.9rem' }}>$</span>
                  <input
                    type="number" min="0" step="0.01" value={netPay} onChange={(e) => setNetPay(e.target.value)} placeholder="0.00" required
                    className="font-mono-tab" style={{ ...inputStyle, width: '100%', paddingLeft: '1.6rem' }}
                  />
                </div>
              </label>
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

          {saveError && (
            <p style={{ fontSize: '0.8rem', color: 'var(--wine)', margin: 0 }}>{saveError}</p>
          )}

          <button type="submit" disabled={saving} className="btn-primary" style={{ marginTop: '0.5rem', padding: '0.72rem', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Add transaction'}
          </button>
        </form>
      </div>
    </div>
  );
}
