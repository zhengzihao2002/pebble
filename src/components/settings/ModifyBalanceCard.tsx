'use client';

import { useState } from 'react';
import type { PaymentMethod } from '@/types';
import { createBalanceAdjustmentAction } from '@/lib/actions/pebble';
import { formatCurrency, todayDateString } from '@/lib/format';
import { LoadingOverlay } from '@/components/shared/Spinner';

interface ModifyBalanceCardProps {
  checkingBalance: number;
  cashBalance: number;
}

type Mode = 'setTo' | 'changeBy';

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.5rem 0.6rem', borderRadius: '0.5rem',
  border: '1px solid var(--line)', fontSize: '0.87rem', color: 'var(--ink)',
  backgroundColor: 'var(--paper)', textAlign: 'right', boxSizing: 'border-box',
};
const labelStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: '0.35rem',
  fontSize: '0.8rem', color: 'var(--ink-soft)',
};

/**
 * Corrects a balance once transactions exist.
 *
 * Opening balances are no longer editable at that point: changing them would
 * silently rewrite every historical running balance in the statement. A
 * correction is recorded instead, as a dated adjustment that appears in the
 * statement but never in Reports.
 */
export function ModifyBalanceCard({ checkingBalance, cashBalance }: ModifyBalanceCardProps) {
  const [account, setAccount] = useState<PaymentMethod>('Checking');
  const [mode, setMode] = useState<Mode>('setTo');
  const [value, setValue] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const currentBalance = account === 'Checking' ? checkingBalance : cashBalance;
  const entered = Number(value);
  const hasValue = value.trim() !== '' && Number.isFinite(entered);
  const delta = !hasValue ? 0 : mode === 'setTo' ? entered - currentBalance : entered;
  const resulting = currentBalance + delta;

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    setSaved(false);

    // Read at submit time, not held in state. An adjustment is always dated
    // today, and a value captured at mount would still be yesterday's on a
    // card left open past midnight.
    const result = await createBalanceAdjustmentAction({
      paymentMethod: account,
      delta,
      description,
      date: todayDateString(),
    });

    setSaving(false);
    if (!result.ok) { setError(result.error); return; }
    setValue('');
    setDescription('');
    setSaved(true);
  };

  return (
    <div className="card" style={{ padding: '1.5rem', position: 'relative' }}>
      {saving && <LoadingOverlay label="Recording adjustment…" />}
      <h3 style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.3rem' }}>Adjust a balance</h3>
      <p style={{ fontSize: '0.8rem', color: 'var(--ink-soft)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
        If Pebble and your real account disagree, record the difference here. It shows up in your
        statement as an adjustment, but is left out of Reports — it is a correction, not spending or income.
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        {(['Checking', 'Cash'] as const).map((m) => (
          <button key={m} type="button" onClick={() => { setAccount(m); setSaved(false); }} className={`pill ${account === m ? 'active' : ''}`} style={{ flex: 1, padding: '0.5rem' }}>
            {m}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--ink-soft)', marginBottom: '1rem' }}>
        <span>{account} balance now</span>
        <span className="font-mono-tab" style={{ color: 'var(--ink)', fontWeight: 600 }}>{formatCurrency(currentBalance)}</span>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button type="button" onClick={() => { setMode('setTo'); setSaved(false); }} className={`pill ${mode === 'setTo' ? 'active' : ''}`} style={{ flex: 1, padding: '0.5rem', fontSize: '0.83rem' }}>
          Set to amount
        </button>
        <button type="button" onClick={() => { setMode('changeBy'); setSaved(false); }} className={`pill ${mode === 'changeBy' ? 'active' : ''}`} style={{ flex: 1, padding: '0.5rem', fontSize: '0.83rem' }}>
          Add or subtract
        </button>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <label style={{ ...labelStyle, flex: 1, minWidth: 150 }}>
          {mode === 'setTo' ? 'New balance' : 'Change by (use − to subtract)'}
          <input
            type="number" step="0.01" value={value}
            onChange={(e) => { setValue(e.target.value); setSaved(false); }}
            placeholder="0.00" className="font-mono-tab" style={inputStyle}
          />
        </label>
      </div>

      <label style={{ ...labelStyle, marginBottom: '1rem' }}>
        Note <span style={{ opacity: 0.7 }}>(optional)</span>
        <input
          value={description}
          onChange={(e) => { setDescription(e.target.value); setSaved(false); }}
          placeholder="e.g. Bank interest, missed cash spend"
          style={{ ...inputStyle, textAlign: 'left' }}
        />
      </label>

      {hasValue && delta !== 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', fontSize: '0.8rem', color: 'var(--ink-soft)', marginBottom: '1.1rem' }}>
          <span>Adjustment</span>
          <span className="font-mono-tab" style={{ color: delta > 0 ? 'var(--pine)' : 'var(--wine)', fontWeight: 600 }}>
            {delta > 0 ? '+' : ''}{formatCurrency(delta)} → {formatCurrency(resulting)}
          </span>
        </div>
      )}

      {error && <p style={{ fontSize: '0.8rem', color: 'var(--wine)', marginBottom: '0.8rem' }}>{error}</p>}
      {saved && <p style={{ fontSize: '0.8rem', color: 'var(--pine)', marginBottom: '0.8rem' }}>Adjustment recorded.</p>}

      <button
        onClick={handleSave} disabled={saving || !hasValue || delta === 0}
        className="btn-primary"
        style={{ padding: '0.65rem 1.1rem', opacity: saving || !hasValue || delta === 0 ? 0.6 : 1 }}
      >
        {saving ? 'Saving…' : 'Record adjustment'}
      </button>
    </div>
  );
}
