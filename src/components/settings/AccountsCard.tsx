'use client';

import { useState } from 'react';
import { Landmark, Coins, Plus, Trash2, Moon, Sun, ArrowRightLeft, Star } from 'lucide-react';
import { createAccountAction, hibernateAccountAction, wakeAccountAction, deleteAccountAction, setPreferredAccountAction } from '@/lib/actions/pebble';
import { callAction } from '@/lib/actions/callAction';
import type { FailureKind } from '@/lib/actions/failureKind';
import { ActionError } from '@/components/shared/ActionError';
import { LoadingOverlay } from '@/components/shared/Spinner';
import type { Account } from '@/lib/data/mappers';
import { formatCurrency } from '@/lib/format';
import { AccountMoveDialog } from '@/components/settings/AccountMoveDialog';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { translateActionError } from '@/lib/i18n/actionErrors';

interface AccountsCardProps {
  accounts: Account[];
  balancesByAccount: Record<string, number>;
  hasRecords: Record<string, boolean>;
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.5rem 0.6rem', borderRadius: '0.5rem',
  border: '1px solid var(--line)', fontSize: '0.87rem', color: 'var(--ink)',
  backgroundColor: 'var(--paper)', boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: '0.35rem',
  fontSize: '0.8rem', color: 'var(--ink-soft)',
};

/**
 * Create and close accounts.
 *
 * CLOSED ACCOUNTS ARE NOT LISTED. Closure is terminal and a closed account is
 * invisible everywhere except as a label on the historical transactions that
 * reference it - so showing it here would imply an action that does not exist.
 *
 * Account names are USER DATA. They are rendered directly, never looked up in
 * the dictionary, unlike the fixed Checking/Cash pair they replaced.
 */
export function AccountsCard({ accounts, balancesByAccount, hasRecords }: AccountsCardProps) {
  const { d, t, locale } = useTranslation();

  // Hibernated accounts ARE listed: they hold real balances that still count
  // toward the total, and they must be reachable to wake.
  const visible = accounts;

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'bank' | 'cash'>('bank');
  const [last4, setLast4] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<FailureKind | undefined>(undefined);
  const [confirmDelete, setConfirmDelete] = useState<Account | null>(null);
  const [moveSource, setMoveSource] = useState<Account | null>(null);

  const resetForm = () => {
    setName(''); setKind('bank'); setLast4('');
    setAdding(false); setError(null);
  };

  const handleCreate = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    const result = await callAction(() => createAccountAction({ name, kind, last4 }));
    setSaving(false);
    if (!result.ok) { setError(translateActionError(d, locale, result)); setErrorKind(result.kind); return; }
    resetForm();
  };

  const runAccountAction = async (run: () => Promise<{ ok: true } | { ok: false; error: string; kind?: FailureKind }>) => {
    if (saving) return;
    setSaving(true);
    setError(null);
    const result = await callAction(run);
    setSaving(false);
    setConfirmDelete(null);
    if (!result.ok) { setError(translateActionError(d, locale, result)); setErrorKind(result.kind); }
  };

  return (
    <div className="card" style={{ padding: '1.5rem', position: 'relative' }}>
      {saving && <LoadingOverlay label={d.common.saving} />}
      <h3 style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.3rem' }}>{d.accounts.title}</h3>
      <p style={{ fontSize: '0.8rem', color: 'var(--ink-soft)', marginBottom: '1.1rem', lineHeight: 1.5 }}>
        {d.accounts.blurb}
      </p>

      <div style={{ marginBottom: '1.1rem' }}>
        {visible.map((a) => {
          const AccountIcon = a.kind === 'bank' ? Landmark : Coins;
          const balance = balancesByAccount[a.id] ?? 0;
          // A STACK, not a row. The buttons used to sit beside the name and
          // wrap only once it could no longer hold 140px - a threshold that
          // resolved differently on a real phone than in Chrome's device
          // emulation, so an iPhone 14 Pro crowded four buttons against the
          // name and clipped it while the emulator wrapped correctly. Giving
          // the buttons their own line guarantees the name has the full width
          // on every device, with no measurement to get wrong.
          return (
            <div key={a.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', padding: '0.7rem 0', borderBottom: '1px solid var(--line)', minWidth: 0 }}>
              {/* Star and move ride the name line - two buttons always fit
                  beside a truncating name. Hibernate and delete drop to their
                  own line below, left-aligned.

                  ALWAYS SPLIT, never wrapped. flexWrap put all four on one
                  line until the name could no longer hold its basis, and that
                  threshold resolved differently on a real iPhone than in
                  Chrome's device emulation - the emulator wrapped, the phone
                  crowded the name and clipped it. Splitting deterministically
                  removes the measurement entirely. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0 }}>
                <AccountIcon size={16} style={{ color: 'var(--ink-soft)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '0.87rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.name}{a.last4 ? ` ····${a.last4}` : ''}
                  </p>
                  {/* Hibernated balances still count toward the total, so they
                      are shown - marked with --gold to read as dormant rather
                      than absent. */}
                  <p className="font-mono-tab" style={{ fontSize: '0.78rem', color: a.status === 'hibernated' ? 'var(--gold)' : 'var(--ink-soft)' }}>
                    {formatCurrency(balance)}
                    {a.status === 'hibernated' && ` · ${d.accounts.hibernated}`}
                    {a.isPreferred && (
                      <span style={{ color: 'var(--gold)', fontWeight: 500 }}>
                        {` · ${d.accounts.preferred}`}
                      </span>
                    )}
                  </p>
                </div>

                {/* Only active accounts can be preferred - preselecting one
                    that rejects new transactions would be broken. Independent
                    of isDefault: Checking and Cash CAN be preferred. */}
                {a.status === 'active' && (
                  <button
                    type="button"
                    onClick={() => runAccountAction(() => setPreferredAccountAction(a.id))}
                    className="icon-btn"
                    aria-pressed={a.isPreferred}
                    aria-label={t(a.isPreferred ? d.accounts.unpreferLabel : d.accounts.preferLabel, { name: a.name })}
                    style={{
                      width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                      borderColor: a.isPreferred ? 'var(--gold)' : 'var(--line)',
                      color: a.isPreferred ? 'var(--gold)' : 'var(--ink-soft)',
                    }}
                  >
                    <Star size={15} fill={a.isPreferred ? 'var(--gold)' : 'none'} />
                  </button>
                )}

                {/* Emptying Checking or Cash into another account is
                    legitimate - the account itself stays. Disabled when empty:
                    the dialog could only report there is nothing to move.
                    Delete stays enabled by contrast - its error message IS the
                    explanation, and a greyed button explains nothing. */}
                <button
                  type="button" onClick={() => setMoveSource(a)} className="icon-btn"
                  aria-label={t(d.accounts.moveTitle, { name: a.name })}
                  disabled={!hasRecords[a.id]}
                  style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, opacity: hasRecords[a.id] ? 1 : 0.4, cursor: hasRecords[a.id] ? 'pointer' : 'not-allowed' }}
                >
                  <ArrowRightLeft size={15} />
                </button>
              </div>

              {/* Second line, left-aligned. Absent entirely for the defaults,
                  which are neither hibernatable nor deletable - so they stay a
                  single line and gain no height. */}
              {!a.isDefault && (
                <div style={{ display: 'flex', gap: '0.35rem' }}>
                  <button
                    type="button"
                    onClick={() => runAccountAction(() => (
                      a.status === 'hibernated' ? wakeAccountAction(a.id) : hibernateAccountAction(a.id)
                    ))}
                    className="icon-btn"
                    aria-label={t(a.status === 'hibernated' ? d.accounts.wakeLabel : d.accounts.hibernateLabel, { name: a.name })}
                    style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0 }}
                  >
                    {a.status === 'hibernated' ? <Sun size={15} /> : <Moon size={15} />}
                  </button>
                  <button
                    type="button" onClick={() => setConfirmDelete(a)} className="icon-btn"
                    aria-label={t(d.accounts.deleteLabel, { name: a.name })}
                    style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0 }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {adding ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
          <label style={labelStyle}>
            {d.accounts.nameLabel}
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={d.accounts.namePlaceholder} style={inputStyle} />
          </label>

          <div role="group" style={{ display: 'flex', gap: '0.5rem' }}>
            {(['bank', 'cash'] as const).map((k) => (
              <button
                key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k}
                className={`pill ${kind === k ? 'active' : ''}`}
                style={{ flex: 1, padding: '0.5rem' }}
              >
                {k === 'bank' ? d.accounts.kindBank : d.accounts.kindCash}
              </button>
            ))}
          </div>

          {/* Only for bank accounts: the database CHECK forbids last4 on cash,
              so offering a field that must stay empty would invite an error. */}
          {kind === 'bank' && (
            <label style={labelStyle}>
              {d.accounts.last4Label}
              <input
                value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                inputMode="numeric" placeholder="0000" className="font-mono-tab" style={inputStyle}
              />
            </label>
          )}


          <ActionError message={error} kind={errorKind} onRetry={handleCreate} busy={saving} />

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" onClick={resetForm} disabled={saving} className="pill" style={{ flex: 1, padding: '0.6rem' }}>
              {d.accounts.cancel}
            </button>
            <button type="button" onClick={handleCreate} disabled={saving} className="btn-primary" style={{ flex: 1, padding: '0.6rem' }}>
              {saving ? d.common.saving : d.accounts.create}
            </button>
          </div>
        </div>
      ) : (
        <>
          <ActionError message={error} kind={errorKind} busy={saving} style={{ marginBottom: '0.8rem' }} />
          <button type="button" onClick={() => { setAdding(true); setError(null); }} className="pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0.5rem 0.9rem' }}>
            <Plus size={14} />{d.accounts.addAccount}
          </button>
        </>
      )}

      {moveSource && (
        <AccountMoveDialog
          source={moveSource}
          allAccounts={accounts}
          onClose={() => setMoveSource(null)}
          onMoved={() => setMoveSource(null)}
        />
      )}

      {confirmDelete && (
        <div
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,20,18,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 60 }}
          onClick={() => { if (!saving) setConfirmDelete(null); }}
        >
          <div className="card" style={{ padding: '1.75rem', width: '100%', maxWidth: 420, boxSizing: 'border-box', position: 'relative' }} onClick={(e) => e.stopPropagation()}>
            {saving && <LoadingOverlay label={d.common.saving} />}
            <h2 className="font-display" style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.6rem' }}>
              {t(d.accounts.confirmTitle, { name: confirmDelete.name })}
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', lineHeight: 1.5, marginBottom: '1.1rem' }}>
              {d.accounts.confirmBody}
            </p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" onClick={() => setConfirmDelete(null)} disabled={saving} className="pill" style={{ flex: 1, padding: '0.65rem' }}>
                {d.accounts.cancel}
              </button>
              <button
                type="button" onClick={() => runAccountAction(() => deleteAccountAction(confirmDelete.id))} disabled={saving}
                className="btn-primary" style={{ flex: 1, padding: '0.65rem', backgroundColor: 'var(--wine)' }}
              >
                {d.accounts.confirmDelete}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
