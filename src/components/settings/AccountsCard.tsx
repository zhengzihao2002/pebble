'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Landmark, Coins, CreditCard, Pencil, Plus, Trash2, Moon, Sun, ArrowRightLeft, Star } from 'lucide-react';
import { createAccountAction, hibernateAccountAction, wakeAccountAction, setPreferredAccountAction, updateCreditCardAction } from '@/lib/actions/pebble';
import { callAction } from '@/lib/actions/callAction';
import type { FailureKind } from '@/lib/actions/failureKind';
import { ActionError } from '@/components/shared/ActionError';
import { LoadingOverlay } from '@/components/shared/Spinner';
import type { Account } from '@/lib/data/mappers';
import { formatCurrency } from '@/lib/format';
import { AccountMoveDialog } from '@/components/settings/AccountMoveDialog';
import { AccountDeleteDialog } from '@/components/settings/AccountDeleteDialog';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { useSafetyLock } from '@/lib/useSafetyLock';
import { translateActionError } from '@/lib/i18n/actionErrors';
import { SleepingBadge } from '@/components/shared/SleepingBadge';

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

// Visually hidden, still read by screen readers.
const srOnly: React.CSSProperties = {
  position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
  overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0,
};

const SAVED_HOLD_MS = 1600;

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
  const deleteLocked = useSafetyLock('deleteAccounts');
  const { d, t, locale } = useTranslation();

  // Hibernated accounts ARE listed: they hold real balances that still count
  // toward the total, and they must be reachable to wake.
  const visible = accounts;

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'bank' | 'cash' | 'credit'>('bank');
  const [last4, setLast4] = useState('');
  // Credit cards: limit (typed text, parsed on save) and due day.
  const [limit, setLimit] = useState('');
  const [dueDay, setDueDay] = useState(1);
  // Inline editor for an existing card's limit and due day.
  const [editingCard, setEditingCard] = useState<string | null>(null);
  const [editLimit, setEditLimit] = useState('');
  const [editDue, setEditDue] = useState(1);
  const parseMoney = (s: string) => {
    const n = Number(s.replace(/[$,\s]/g, ''));
    return s.trim() && Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
  };
  const dayText = (n: number) => (locale === 'zh'
    ? String(n)
    : `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`);
  const dayOptions = Array.from({ length: 31 }, (_, i) => i + 1).map((n) => (
    <option key={n} value={n}>{t(d.accounts.dueDayOption, { day: dayText(n) })}</option>
  ));
  const openCardEditor = (a: Account) => {
    setEditingCard(a.id);
    setEditLimit(a.creditLimit !== null ? String(a.creditLimit) : '');
    setEditDue(a.dueDay ?? 1);
    setError(null);
  };
  const cardChanged = (a: Account) => parseMoney(editLimit) !== a.creditLimit || editDue !== a.dueDay;

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<FailureKind | undefined>(undefined);
  const [confirmDelete, setConfirmDelete] = useState<Account | null>(null);
  const [moveSource, setMoveSource] = useState<Account | null>(null);
  // The row whose save the server just confirmed. Set ONLY below the failure
  // return of a write; shows a small check on that row for a moment.
  const [savedId, setSavedId] = useState<string | null>(null);
  // Ids present before a create, so the new row can be found once the page
  // hands down the refreshed list.
  const pendingNew = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!savedId) return;
    const id = window.setTimeout(() => setSavedId(null), SAVED_HOLD_MS);
    return () => window.clearTimeout(id);
  }, [savedId]);

  useEffect(() => {
    const before = pendingNew.current;
    if (!before) return;
    const fresh = accounts.find((a) => !before.has(a.id));
    if (fresh) { pendingNew.current = null; setSavedId(fresh.id); }
  }, [accounts]);

  const resetForm = () => {
    setName(''); setKind('bank'); setLast4(''); setLimit(''); setDueDay(1);
    setAdding(false); setError(null);
  };

  const handleCreate = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    setSavedId(null);
    const idsBefore = new Set(accounts.map((a) => a.id));
    const result = await callAction(() => createAccountAction({ name, kind, last4, ...(kind === 'credit' ? { creditLimit: parseMoney(limit), dueDay } : {}) }));
    setSaving(false);
    if (!result.ok) { setError(translateActionError(d, locale, result)); setErrorKind(result.kind); return; }
    // Below the failure return: the new row is marked when the list refreshes.
    pendingNew.current = idsBefore;
    resetForm();
  };

  const runAccountAction = async (accountId: string, run: () => Promise<{ ok: true } | { ok: false; error: string; kind?: FailureKind }>) => {
    if (saving) return;
    setSaving(true);
    setError(null);
    setSavedId(null);
    const result = await callAction(run);
    setSaving(false);
    setConfirmDelete(null);
    if (!result.ok) { setError(translateActionError(d, locale, result)); setErrorKind(result.kind); return; }
    // Below the failure return.
    setSavedId(accountId);
  };

  const handleCardSave = async (a: Account) => {
    if (saving) return;
    setSaving(true);
    setError(null);
    setSavedId(null);
    const result = await callAction(() => updateCreditCardAction({ id: a.id, creditLimit: parseMoney(editLimit), dueDay: editDue }));
    setSaving(false);
    if (!result.ok) { setError(translateActionError(d, locale, result)); setErrorKind(result.kind); return; }
    // Below the failure return.
    setEditingCard(null);
    setSavedId(a.id);
  };

  return (
    <div className="card" style={{ padding: '1.5rem', position: 'relative' }}>
      {saving && <LoadingOverlay label={d.common.saving} />}
      {/* Announces a confirmed save; the visible check is aria-hidden. */}
      <span role="status" style={srOnly}>{savedId ? d.accounts.saved : ''}</span>
      <h3 style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.3rem' }}>{d.accounts.title}</h3>
      <p style={{ fontSize: '0.8rem', color: 'var(--ink-soft)', marginBottom: '1.1rem', lineHeight: 1.5 }}>
        {d.accounts.blurb}
      </p>

      <div style={{ marginBottom: '1.1rem' }}>
        {visible.map((a) => {
          const AccountIcon = a.kind === 'credit' ? CreditCard : a.kind === 'bank' ? Landmark : Coins;
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
                  <p style={{ fontSize: '0.87rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: a.status === 'hibernated' ? 'var(--ink-soft)' : undefined }}>
                    {a.name}{a.last4 ? ` ····${a.last4}` : ''}
                  </p>
                  {/* Hibernated balances still count toward the total, so they
                      are shown - marked with --gold to read as dormant rather
                      than absent. */}
                  <p className="font-mono-tab" style={{ fontSize: '0.78rem', color: 'var(--ink-soft)' }}>
                    {formatCurrency(balance)}
                    {a.isPreferred && (
                      <span style={{ color: 'var(--gold)', fontWeight: 500 }}>
                        {` · ${d.accounts.preferred}`}
                      </span>
                    )}
                  </p>
                  {a.kind === 'credit' && a.creditLimit !== null && a.dueDay !== null && (
                    <p className="font-mono-tab" style={{ fontSize: '0.75rem', color: 'var(--ink-soft)' }}>
                      {t(d.accounts.cardSummary, { limit: formatCurrency(a.creditLimit), day: dayText(a.dueDay) })}
                    </p>
                  )}
                </div>

                {a.status === 'hibernated' && <SleepingBadge />}

                {savedId === a.id && (
                  <span
                    className="goal-done-badge" aria-hidden="true"
                    style={{ width: 22, height: 22, borderRadius: '50%', backgroundColor: 'var(--pine)', color: 'var(--paper)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                  >
                    <Check size={13} strokeWidth={3} />
                  </span>
                )}

                {/* Only active accounts can be preferred - preselecting one
                    that rejects new transactions would be broken. Independent
                    of isDefault: Checking and Cash CAN be preferred. */}
                {a.status === 'active' && (
                  <button
                    type="button"
                    onClick={() => runAccountAction(a.id, () => setPreferredAccountAction(a.id))}
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
                  {a.kind === 'credit' && (
                    <button
                      type="button" onClick={() => (editingCard === a.id ? setEditingCard(null) : openCardEditor(a))}
                      className="icon-btn" aria-expanded={editingCard === a.id}
                      aria-label={t(d.accounts.editCard, { name: a.name })} title={t(d.accounts.editCard, { name: a.name })}
                      style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0 }}
                    >
                      <Pencil size={15} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => runAccountAction(a.id, () => (
                      a.status === 'hibernated' ? wakeAccountAction(a.id) : hibernateAccountAction(a.id)
                    ))}
                    className="icon-btn"
                    aria-label={t(a.status === 'hibernated' ? d.accounts.wakeLabel : d.accounts.hibernateLabel, { name: a.name })}
                    style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0 }}
                  >
                    {a.status === 'hibernated' ? <Sun size={15} /> : <Moon size={15} />}
                  </button>
                  <button disabled={deleteLocked} title={deleteLocked ? d.safetyLocks.lockedHint : undefined}
                    type="button" onClick={() => setConfirmDelete(a)} className="icon-btn"
                    aria-label={t(d.accounts.deleteLabel, { name: a.name })}
                    style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, opacity: deleteLocked ? 0.4 : 1, cursor: deleteLocked ? 'not-allowed' : 'pointer' }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              )}

              {editingCard === a.id && (
                <div className="goal-step" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', padding: '0.4rem 0 0.2rem' }}>
                  <label style={labelStyle}>
                    {d.accounts.creditLimitLabel}
                    <input value={editLimit} onChange={(e) => setEditLimit(e.target.value)} inputMode="decimal" className="font-mono-tab" style={inputStyle} />
                  </label>
                  <label style={labelStyle}>
                    {d.accounts.dueDayLabel}
                    <select value={editDue} onChange={(e) => setEditDue(Number(e.target.value))} style={inputStyle}>{dayOptions}</select>
                  </label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button type="button" onClick={() => setEditingCard(null)} disabled={saving} className="pill" style={{ flex: 1, padding: '0.5rem' }}>
                      {d.accounts.cancel}
                    </button>
                    <button type="button" onClick={() => handleCardSave(a)} disabled={saving || !cardChanged(a)} className="btn-primary" style={{ flex: 1, padding: '0.5rem' }}>
                      {d.accounts.cardSave}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {deleteLocked && visible.some((a) => !a.isDefault) && (
        <p data-lock-hint style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', lineHeight: 1.45, margin: '0 0 1rem' }}>
          {d.safetyLocks.lockedHint}
        </p>
      )}

      {adding ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
          <label style={labelStyle}>
            {d.accounts.nameLabel}
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={d.accounts.namePlaceholder} style={inputStyle} />
          </label>

          <div role="group" style={{ display: 'flex', gap: '0.5rem' }}>
            {(['bank', 'cash', 'credit'] as const).map((k) => (
              <button
                key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k}
                className={`pill ${kind === k ? 'active' : ''}`}
                style={{ flex: 1, padding: '0.5rem' }}
              >
                {k === 'bank' ? d.accounts.kindBank : k === 'cash' ? d.accounts.kindCash : d.accounts.kindCredit}
              </button>
            ))}
          </div>

          {/* Only for bank accounts: the database CHECK forbids last4 on cash,
              so offering a field that must stay empty would invite an error. */}
          {(kind === 'bank' || kind === 'credit') && (
            <label style={labelStyle}>
              {d.accounts.last4Label}
              <input
                value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                inputMode="numeric" placeholder="0000" className="font-mono-tab" style={inputStyle}
              />
            </label>
          )}

          {kind === 'credit' && (
            <>
              <label style={labelStyle}>
                {d.accounts.creditLimitLabel}
                <input value={limit} onChange={(e) => setLimit(e.target.value)} inputMode="decimal" placeholder="2000" className="font-mono-tab" style={inputStyle} />
              </label>
              <label style={labelStyle}>
                {d.accounts.dueDayLabel}
                <select value={dueDay} onChange={(e) => setDueDay(Number(e.target.value))} style={inputStyle}>{dayOptions}</select>
                <span style={{ fontSize: '0.72rem' }}>{d.accounts.dueDayHint}</span>
              </label>
            </>
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
        <AccountDeleteDialog account={confirmDelete} allAccounts={accounts} onClose={() => setConfirmDelete(null)} />
      )}
    </div>
  );
}
