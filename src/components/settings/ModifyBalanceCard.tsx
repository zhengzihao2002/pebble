'use client';

import { useState } from 'react';
import type { Account } from '@/lib/data/mappers';
import { createBalanceAdjustmentAction } from '@/lib/actions/pebble';
import { callAction } from '@/lib/actions/callAction';
import type { FailureKind } from '@/lib/actions/failureKind';
import { ActionError } from '@/components/shared/ActionError';
import { formatCurrency, todayDateString } from '@/lib/format';
import { LoadingOverlay } from '@/components/shared/Spinner';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { translateActionError } from '@/lib/i18n/actionErrors';

interface ModifyBalanceCardProps {
  accounts: Account[];
  balancesByAccount: Record<string, number>;
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
 * Sets or corrects an account balance.
 *
 * THE ONLY WAY A BALANCE MOVES WITHOUT A TRANSACTION. Opening balances were
 * removed outright: every account starts at zero, and a starting figure is
 * recorded here as a dated adjustment that appears in the statement but never
 * in Reports. Nothing moves the total without a visible row explaining it.
 */
export function ModifyBalanceCard({ accounts, balancesByAccount }: ModifyBalanceCardProps) {
  const { d, t, locale } = useTranslation();
  // Account NAMES are user data and are never translated. Only active
  // accounts are adjustable: a closed one is settled at zero permanently.
  const active = accounts.filter((a) => a.status === 'active');
  const [accountId, setAccountId] = useState(active[0]?.id ?? '');
  const [mode, setMode] = useState<Mode>('setTo');
  const [value, setValue] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<FailureKind | undefined>(undefined);
  const [saved, setSaved] = useState(false);

  const account = active.find((a) => a.id === accountId);
  const currentBalance = balancesByAccount[accountId] ?? 0;
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
    const result = await callAction(() => createBalanceAdjustmentAction({
      accountId,
      delta,
      description,
      date: todayDateString(),
    }));

    setSaving(false);
    if (!result.ok) { setError(translateActionError(d, locale, result)); setErrorKind(result.kind); return; }
    setValue('');
    setDescription('');
    setSaved(true);
  };

  return (
    <div className="card" style={{ padding: '1.5rem', position: 'relative' }}>
      {saving && <LoadingOverlay label={d.modifyBalance.saving} />}
      <h3 style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.3rem' }}>{d.modifyBalance.title}</h3>
      <p style={{ fontSize: '0.8rem', color: 'var(--ink-soft)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
        {d.modifyBalance.blurb}
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        {active.map((a) => (
          <button key={a.id} type="button" onClick={() => { setAccountId(a.id); setSaved(false); }} className={`pill ${accountId === a.id ? 'active' : ''}`} style={{ flex: 1, padding: '0.5rem' }}>
            {a.name}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--ink-soft)', marginBottom: '1rem' }}>
        {/* Chinese drops the space between the account name and the noun,
            which is why this is a template rather than concatenation. */}
        <span>{t(d.modifyBalance.balanceNow, { account: account?.name ?? '' })}</span>
        <span className="font-mono-tab" style={{ color: 'var(--ink)', fontWeight: 600 }}>{formatCurrency(currentBalance)}</span>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button type="button" onClick={() => { setMode('setTo'); setSaved(false); }} className={`pill ${mode === 'setTo' ? 'active' : ''}`} style={{ flex: 1, padding: '0.5rem', fontSize: '0.83rem' }}>
          {d.modifyBalance.setTo}
        </button>
        <button type="button" onClick={() => { setMode('changeBy'); setSaved(false); }} className={`pill ${mode === 'changeBy' ? 'active' : ''}`} style={{ flex: 1, padding: '0.5rem', fontSize: '0.83rem' }}>
          {d.modifyBalance.changeBy}
        </button>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <label style={{ ...labelStyle, flex: 1, minWidth: 150 }}>
          {mode === 'setTo' ? d.modifyBalance.newBalance : d.modifyBalance.changeByLabel}
          <input
            type="number" step="0.01" value={value}
            onChange={(e) => { setValue(e.target.value); setSaved(false); }}
            placeholder="0.00" className="font-mono-tab" style={inputStyle}
          />
        </label>
      </div>

      <label style={{ ...labelStyle, marginBottom: '1rem' }}>
        {d.modifyBalance.note} <span style={{ opacity: 0.7 }}>{d.modifyBalance.optional}</span>
        <input
          value={description}
          onChange={(e) => { setDescription(e.target.value); setSaved(false); }}
          placeholder={d.modifyBalance.notePlaceholder}
          style={{ ...inputStyle, textAlign: 'left' }}
        />
      </label>

      {hasValue && delta !== 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', fontSize: '0.8rem', color: 'var(--ink-soft)', marginBottom: '1.1rem' }}>
          <span>{d.modifyBalance.adjustment}</span>
          <span className="font-mono-tab" style={{ color: delta > 0 ? 'var(--pine)' : 'var(--wine)', fontWeight: 600 }}>
            {delta > 0 ? '+' : ''}{formatCurrency(delta)} → {formatCurrency(resulting)}
          </span>
        </div>
      )}

      <ActionError message={error} kind={errorKind} onRetry={handleSave} busy={saving} style={{ marginBottom: '0.8rem' }} />
      {saved && <p style={{ fontSize: '0.8rem', color: 'var(--pine)', marginBottom: '0.8rem' }}>{d.modifyBalance.recorded}</p>}

      <button
        onClick={handleSave} disabled={saving || !hasValue || delta === 0}
        className="btn-primary"
        style={{ padding: '0.65rem 1.1rem', opacity: saving || !hasValue || delta === 0 ? 0.6 : 1 }}
      >
        {saving ? d.common.saving : d.modifyBalance.record}
      </button>
    </div>
  );
}
