'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, ArrowRight } from 'lucide-react';
import { LoadingOverlay, Spinner } from '@/components/shared/Spinner';
import { SearchableSelect, type SearchableSelectOption } from '@/components/shared/SearchableSelect';
import { createTransferAction, getAccountsAction } from '@/lib/actions/pebble';
import { callAction } from '@/lib/actions/callAction';
import type { FailureKind } from '@/lib/actions/failureKind';
import { ActionError } from '@/components/shared/ActionError';
import type { Account } from '@/lib/data/mappers';
import { todayDateString } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { translateActionError } from '@/lib/i18n/actionErrors';

interface TransferModalProps {
  onClose: () => void;
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

/**
 * Moves money between two accounts.
 *
 * Recorded as two balance_adjustment rows, so it never reaches Reports: a
 * transfer is neither spending nor income, and counting it as either would
 * inflate both sides of every total. The pair sums to zero, so the user's
 * total balance cannot move - only its distribution.
 *
 * Both accounts must be active; hibernated accounts take no new activity.
 */
export function TransferModal({ onClose }: TransferModalProps) {
  const { d, locale } = useTranslation();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayDateString());
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<FailureKind | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    callAction(getAccountsAction, d.addTxn.accountsFailed).then((result) => {
      if (cancelled) return;
      if (!result.ok) { setAccountError(translateActionError(d, locale, result)); return; }
      setAccounts(result.accounts);
      setAccountError(null);
      // Preferred account as the source, since money usually leaves the
      // account the user treats as primary.
      const preferred = result.accounts.find((a) => a.isPreferred);
      setFromId((c) => c || preferred?.id || result.accounts[0]?.id || '');
      setToId((c) => c || result.accounts.find((a) => a.id !== (preferred?.id ?? result.accounts[0]?.id))?.id || '');
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const options = useMemo<SearchableSelectOption[]>(
    () => accounts.map((a) => ({
      value: a.id,
      label: a.last4 ? `${a.name} ····${a.last4}` : a.name,
    })),
    [accounts],
  );

  const sameAccount = fromId !== '' && fromId === toId;
  const amountValid = amount.trim() !== '' && Number(amount) > 0;
  const canSubmit = !!fromId && !!toId && !sameAccount && amountValid && !!date;

  const requestClose = () => { if (saving) return; onClose(); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || saving) return;
    setSaving(true);
    setError(null);

    const result = await callAction(() => createTransferAction({
      fromAccountId: fromId,
      toAccountId: toId,
      amount: Number(amount),
      description,
      date,
    }));

    setSaving(false);
    if (!result.ok) { setError(translateActionError(d, locale, result)); setErrorKind(result.kind); return; }
    onClose();
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,20,18,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 60, overflowY: 'auto' }}
      onClick={requestClose}
    >
      <div className="card" style={{ padding: '1.75rem', width: '100%', maxWidth: 460, boxSizing: 'border-box', margin: '1rem 0', position: 'relative' }} onClick={(e) => e.stopPropagation()}>
        {saving && <LoadingOverlay label={d.common.saving} />}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
          <h2 className="font-display" style={{ fontSize: '1.2rem', fontWeight: 600 }}>{d.transfer.title}</h2>
          <button onClick={requestClose} disabled={saving} className="icon-btn" style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', flexShrink: 0, opacity: saving ? 0.4 : 1 }}>
            <X size={18} />
          </button>
        </div>
        <p style={{ fontSize: '0.8rem', color: 'var(--ink-soft)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
          {d.transfer.blurb}
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          <div style={labelStyle}>
            <span>{d.transfer.from}</span>
            <SearchableSelect value={fromId} onChange={setFromId} options={options} ariaLabel={d.transfer.from} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--ink-soft)' }}>
            <ArrowRight size={16} />
          </div>

          <div style={labelStyle}>
            <span>{d.transfer.to}</span>
            <SearchableSelect value={toId} onChange={setToId} options={options} ariaLabel={d.transfer.to} />
          </div>

          {sameAccount && (
            <p style={{ fontSize: '0.75rem', color: 'var(--wine)', margin: 0 }}>{d.transfer.sameAccount}</p>
          )}
          {accountError && <ActionError message={accountError} />}

          <label style={labelStyle}>
            {d.transfer.amount}
            <input
              type="number" min="0" step="0.01" value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00" className="font-mono-tab" style={{ ...inputStyle, textAlign: 'right' }}
            />
          </label>

          <label style={labelStyle}>
            {d.transfer.date}
            {/* A DATE, not a locale-formatted string: 'YYYY-MM-DD' is what the
                server stores and compares lexicographically. */}
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required style={inputStyle} />
          </label>

          <label style={labelStyle}>
            {d.transfer.note} <span style={{ opacity: 0.7 }}>{d.transfer.optional}</span>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={d.transfer.notePlaceholder} style={inputStyle} />
          </label>

          <ActionError message={error} kind={errorKind} onRetry={() => handleSubmit(new Event('submit') as unknown as React.FormEvent)} busy={saving} />

          <button
            type="submit" disabled={saving || !canSubmit} className="btn-primary"
            style={{ marginTop: '0.3rem', padding: '0.72rem', opacity: saving || !canSubmit ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            {saving ? <><Spinner size={14} /> {d.common.saving}</> : d.transfer.submit}
          </button>
        </form>
      </div>
    </div>
  );
}
