'use client';

import { useState } from 'react';
import { setOpeningBalancesAction } from '@/lib/actions/pebble';
import { formatCurrency } from '@/lib/format';

interface OpeningBalanceCardProps {
  checkingOpening: number;
  cashOpening: number;
  checkingTransactionTotal: number;
  cashTransactionTotal: number;
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.5rem 0.6rem', borderRadius: '0.5rem',
  border: '1px solid var(--line)', fontSize: '0.87rem', color: 'var(--ink)',
  backgroundColor: 'var(--paper)', textAlign: 'right', boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: '0.35rem',
  fontSize: '0.8rem', color: 'var(--ink-soft)', flex: 1,
};

/**
 * Sets the OPENING balances - what each account held before the first
 * recorded transaction. Current balances are never stored; they are derived
 * as opening + the sum of every transaction. Storing both would be two
 * sources of truth that can drift apart.
 *
 * The derived current balance is shown live beneath the inputs so the number
 * being entered can be sanity-checked against a real account.
 */
export function OpeningBalanceCard({
  checkingOpening, cashOpening, checkingTransactionTotal, cashTransactionTotal,
}: OpeningBalanceCardProps) {
  const [checking, setChecking] = useState(String(checkingOpening));
  const [cash, setCash] = useState(String(cashOpening));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const checkingNum = Number(checking) || 0;
  const cashNum = Number(cash) || 0;
  const projectedChecking = checkingNum + checkingTransactionTotal;
  const projectedCash = cashNum + cashTransactionTotal;

  const dirty = checkingNum !== checkingOpening || cashNum !== cashOpening;

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    const result = await setOpeningBalancesAction({
      checkingOpening: checkingNum,
      cashOpening: cashNum,
    });
    setSaving(false);
    if (!result.ok) { setError(result.error); return; }
    setSaved(true);
  };

  return (
    <div className="card" style={{ padding: '1.5rem' }}>
      <h3 style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.3rem' }}>Starting balances</h3>
      <p style={{ fontSize: '0.8rem', color: 'var(--ink-soft)', marginBottom: '1.25rem' }}>
        What each account held before your first recorded transaction. Your balance today is worked out
        from this plus everything you have recorded since. Negative values are fine for an overdrawn account.
      </p>

      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.1rem', flexWrap: 'wrap' }}>
        <label style={labelStyle}>
          Checking
          <input
            type="number" step="0.01" value={checking}
            onChange={(e) => { setChecking(e.target.value); setSaved(false); }}
            className="font-mono-tab" style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          Cash
          <input
            type="number" step="0.01" value={cash}
            onChange={(e) => { setCash(e.target.value); setSaved(false); }}
            className="font-mono-tab" style={inputStyle}
          />
        </label>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', fontSize: '0.8rem', color: 'var(--ink-soft)', marginBottom: '1.1rem' }}>
        <span>Balance today, with these values</span>
        <span className="font-mono-tab" style={{ color: 'var(--ink)', fontWeight: 600 }}>
          {formatCurrency(projectedChecking)} checking · {formatCurrency(projectedCash)} cash
        </span>
      </div>

      {error && (
        <p style={{ fontSize: '0.8rem', color: 'var(--wine)', marginBottom: '0.8rem' }}>{error}</p>
      )}
      {saved && !dirty && (
        <p style={{ fontSize: '0.8rem', color: 'var(--pine)', marginBottom: '0.8rem' }}>Saved.</p>
      )}

      <button
        onClick={handleSave} disabled={saving} className="btn-primary"
        style={{ padding: '0.65rem 1.1rem', opacity: saving ? 0.6 : 1 }}
      >
        {saving ? 'Saving…' : 'Save starting balances'}
      </button>
    </div>
  );
}
