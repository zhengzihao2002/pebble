'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, ArrowRightLeft, Trash2 } from 'lucide-react';
import {
  deleteAccountAction,
  deleteAccountWithRecordsAction,
  getAccountDeletionPreviewAction,
  moveAndDeleteAccountAction,
  type AccountDeletionPreview,
} from '@/lib/actions/pebble';
import { callAction } from '@/lib/actions/callAction';
import type { FailureKind } from '@/lib/actions/failureKind';
import { ActionError } from '@/components/shared/ActionError';
import { LoadingBlock, LoadingOverlay } from '@/components/shared/Spinner';
import { ModalFrame } from '@/components/shared/ModalFrame';
import { ModalCloseButton } from '@/components/shared/ModalCloseButton';
import { SaveSuccess } from '@/components/shared/SaveSuccess';
import { SelectField, type SelectFieldOption } from '@/components/shared/SelectField';
import type { Account } from '@/lib/data/mappers';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { translateActionError } from '@/lib/i18n/actionErrors';

interface AccountDeleteDialogProps {
  account: Account;
  allAccounts: Account[];
  onClose: () => void;
}

type Step = 'loading' | 'empty' | 'choose' | 'move' | 'destroy' | 'done';

const COUNTDOWN_SECONDS = 10;

/**
 * Deleting an account. An empty one is a simple confirm. One with records
 * offers: move everything to another account and delete it, or delete
 * everything - the latter behind a fresh before/after preview, the typed
 * account name and a 10-second countdown. Both destructive paths run as one
 * locked transaction with a tripwire on the server (pebble.ts): if the
 * account changed since this preview, nothing happens and the preview reloads.
 *
 * LAYOUT. Head (title, close) and foot (error, buttons) never scroll; the
 * body between them is the only scroller. Every step keeps its buttons in
 * the foot, so a long balances table can never push them out of reach.
 *
 * DONE. SaveSuccess (the Add to goal confirmation) holds, then calls close(),
 * so the exit plays before onClose unmounts the dialog.
 */
export function AccountDeleteDialog({ account, allAccounts, onClose }: AccountDeleteDialogProps) {
  const { d, t, locale } = useTranslation();
  const destinations = allAccounts.filter((a) => a.id !== account.id && a.status === 'active');

  const [step, setStep] = useState<Step>('loading');
  const [preview, setPreview] = useState<AccountDeletionPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<FailureKind | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState(destinations[0]?.id ?? '');
  const [typed, setTyped] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS);

  // Account NAMES are user data and are never translated. Same label shape
  // as every other account picker.
  const destinationOptions = useMemo<SelectFieldOption[]>(
    () => destinations.map((a) => ({
      value: a.id,
      label: a.last4 ? `${a.name} ····${a.last4}` : a.name,
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allAccounts, account.id],
  );

  const loadPreview = async () => {
    setStep('loading');
    const result = await callAction(() => getAccountDeletionPreviewAction(account.id), d.accounts.deleteLoadFailed);
    if (!result.ok) {
      setError(translateActionError(d, locale, result));
      setErrorKind(result.kind);
      setPreview(null);
      setStep('choose');
      return;
    }
    setPreview(result.preview);
    setStep(result.preview.recordTotal === 0 ? 'empty' : 'choose');
  };

  useEffect(() => { void loadPreview(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Restarts every time the destroy step is entered, and stops when it is left.
  useEffect(() => {
    if (step !== 'destroy') return;
    setSecondsLeft(COUNTDOWN_SECONDS);
    const id = window.setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(id);
  }, [step]);

  // ModalFrame's busy prop blocks Escape, the backdrop and the close dot
  // while a write is in flight; every button below is disabled the same way.
  const run = async (call: () => Promise<{ ok: true } | { ok: false; error: string; kind?: FailureKind; code?: string }>) => {
    setBusy(true);
    setError(null);
    const result = await callAction(call);
    setBusy(false);
    if (!result.ok) {
      setError(translateActionError(d, locale, result));
      setErrorKind(result.kind);
      if ((result as { code?: string }).code === 'validation.accountChangedSinceReview') {
        setTyped('');
        void loadPreview();
      }
      return;
    }
    // Below the failure return: the confirmation only follows a confirmed delete.
    setStep('done');
  };

  const countsLine = preview
    ? [
        [preview.counts.expenses, d.accounts.countExpenses],
        [preview.counts.income, d.accounts.countIncome],
        [preview.counts.adjustments, d.accounts.countAdjustments],
        [preview.counts.transfers, d.accounts.countTransfers],
        [preview.counts.rules, d.accounts.countRules],
      ]
        .filter(([n]) => (n as number) > 0)
        .map(([n, label]) => t(label as string, { count: n as number }))
        .join(' · ')
    : '';

  const unallocatedBefore = preview ? preview.totalBefore - preview.allocated : 0;
  const unallocatedAfter = preview ? preview.totalAfter - preview.allocated : 0;
  const goalsShort = preview !== null && preview.allocated > 0 && unallocatedAfter < 0;
  const nameMatches = typed.trim() === account.name.trim();
  const canDestroy = secondsLeft === 0 && nameMatches && !busy;

  const rowStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.75rem', fontSize: '0.85rem', padding: '0.4rem 0' };
  const backToChoose = () => { setError(null); setStep('choose'); };

  return (
    <ModalFrame onClose={onClose} busy={busy} labelledBy="account-delete-title" maxWidth={520} zIndex={60}>
      {(close) => (
      <>
        {busy && <LoadingOverlay label={d.accounts.deleting} />}

        {/* HEAD: never scrolls. account.name is USER DATA, inserted
            untranslated, and can be long. */}
        <div className="pb-modal-head">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
            <h2 id="account-delete-title" className="font-display" style={{ flex: 1, minWidth: 0, fontSize: '1.15rem', fontWeight: 600, margin: 0, overflowWrap: 'anywhere' }}>
              {step === 'destroy' ? t(d.accounts.destroyTitle, { name: account.name }) : t(d.accounts.confirmTitle, { name: account.name })}
            </h2>
            <ModalCloseButton onClick={close} disabled={busy} />
          </div>
        </div>

        {/* BODY: the only scroller. */}
        <div className="pb-modal-body themed-scroll">
          {step === 'loading' && <LoadingBlock label={d.accounts.deleteLoading} />}

          {step === 'empty' && (
            <p style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', lineHeight: 1.5, margin: 0 }}>{d.accounts.deleteEmptyBody}</p>
          )}

          {step === 'choose' && preview && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', lineHeight: 1.5, margin: 0 }}>
                {d.accounts.deleteHasRecords} <span style={{ color: 'var(--ink)', fontWeight: 500 }}>{countsLine}</span>
              </p>
              <button
                type="button" disabled={destinations.length === 0}
                onClick={() => { setError(null); setStep('move'); }}
                style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', textAlign: 'left', padding: '0.9rem', borderRadius: '0.8rem', border: '1px solid var(--line)', backgroundColor: 'var(--mist)', cursor: destinations.length === 0 ? 'not-allowed' : 'pointer', opacity: destinations.length === 0 ? 0.55 : 1 }}
              >
                <ArrowRightLeft size={18} style={{ color: 'var(--pine)', flexShrink: 0, marginTop: 2 }} />
                <span>
                  <span style={{ display: 'block', fontWeight: 600, fontSize: '0.9rem', color: 'var(--ink)' }}>{d.accounts.optionMove}</span>
                  <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--ink-soft)', lineHeight: 1.45, marginTop: 2 }}>
                    {destinations.length === 0 ? d.accounts.noDestinations : d.accounts.optionMoveHint}
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => { setError(null); setTyped(''); setStep('destroy'); }}
                style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', textAlign: 'left', padding: '0.9rem', borderRadius: '0.8rem', border: '1px solid var(--wine)', backgroundColor: 'var(--wine-soft)', cursor: 'pointer' }}
              >
                <Trash2 size={18} style={{ color: 'var(--wine)', flexShrink: 0, marginTop: 2 }} />
                <span>
                  <span style={{ display: 'block', fontWeight: 600, fontSize: '0.9rem', color: 'var(--wine)' }}>{d.accounts.optionDestroy}</span>
                  <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--ink-soft)', lineHeight: 1.45, marginTop: 2 }}>{d.accounts.optionDestroyHint}</span>
                </span>
              </button>
            </div>
          )}

          {step === 'move' && preview && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', lineHeight: 1.5, margin: 0 }}>{d.accounts.optionMoveHint}</p>
              {/* A div, not a label: a click on the words must not reach the
                  dropdown's input and reopen the list. */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.8rem', color: 'var(--ink-soft)' }}>
                <span>{d.accounts.moveTo}</span>
                <SelectField value={target} onChange={setTarget} options={destinationOptions} ariaLabel={d.accounts.moveTo} />
              </div>
            </div>
          )}

          {step === 'destroy' && preview && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', gap: '0.6rem', padding: '0.8rem 0.9rem', borderRadius: '0.8rem', backgroundColor: 'var(--wine-soft)', color: 'var(--wine)', fontSize: '0.84rem', lineHeight: 1.5 }}>
                <AlertTriangle size={17} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>
                  <strong style={{ display: 'block' }}>{d.accounts.destroyWarning}</strong>
                  <span style={{ color: 'var(--ink)' }}>{countsLine}</span>
                </span>
              </div>

              <div>
                <p style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--ink-soft)', margin: '0 0 0.2rem' }}>{d.accounts.balancesTitle}</p>
                {preview.balances.map((b) => (
                  <div key={b.accountId} style={{ ...rowStyle, borderBottom: '1px solid var(--line)' }}>
                    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</span>
                    <span className="font-mono-tab" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <span style={{ color: 'var(--ink-soft)' }}>{formatCurrency(b.before)}</span>
                      <ArrowRight size={12} style={{ color: 'var(--ink-soft)' }} />
                      {b.after === null
                        ? <span style={{ color: 'var(--wine)', fontWeight: 600 }}>{d.accounts.deletedLabel}</span>
                        : <span style={{ fontWeight: 600 }}>{formatCurrency(b.after)}</span>}
                    </span>
                  </div>
                ))}
                <div style={{ ...rowStyle, fontWeight: 600 }}>
                  <span>{d.accounts.totalLabel}</span>
                  <span className="font-mono-tab" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: 'var(--ink-soft)', fontWeight: 400 }}>{formatCurrency(preview.totalBefore)}</span>
                    <ArrowRight size={12} style={{ color: 'var(--ink-soft)' }} />
                    <span>{formatCurrency(preview.totalAfter)}</span>
                  </span>
                </div>
                {preview.allocated > 0 && (
                  <div style={rowStyle}>
                    <span style={{ color: 'var(--ink-soft)' }}>{d.accounts.unallocatedLabel}</span>
                    <span className="font-mono-tab" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: 'var(--ink-soft)' }}>{formatCurrency(unallocatedBefore)}</span>
                      <ArrowRight size={12} style={{ color: 'var(--ink-soft)' }} />
                      <span style={{ fontWeight: 600, color: unallocatedAfter < 0 ? 'var(--wine)' : 'var(--ink)' }}>{formatCurrency(unallocatedAfter)}</span>
                    </span>
                  </div>
                )}
              </div>

              {preview.transferAccounts.length > 0 && (
                <p style={{ fontSize: '0.8rem', color: 'var(--gold)', lineHeight: 1.5, margin: 0 }}>
                  {t(d.accounts.transferWarning, { accounts: preview.transferAccounts.join(', ') })}
                </p>
              )}
              {goalsShort && (
                <p style={{ fontSize: '0.8rem', color: 'var(--wine)', lineHeight: 1.5, margin: 0 }}>
                  {t(d.accounts.goalsWarning, { amount: formatCurrency(Math.abs(unallocatedAfter)) })}
                </p>
              )}

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.8rem', color: 'var(--ink-soft)' }}>
                {t(d.accounts.typeName, { name: account.name })}
                <input
                  value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false}
                  style={{ padding: '0.55rem 0.65rem', borderRadius: '0.55rem', border: `1px solid ${typed && !nameMatches ? 'var(--wine)' : 'var(--line)'}`, fontSize: '0.9rem', color: 'var(--ink)', backgroundColor: 'var(--paper)' }}
                />
              </label>
            </div>
          )}

          {step === 'done' && (
            <SaveSuccess title={d.accounts.deletedTitle} body={t(d.accounts.deletedBody, { name: account.name })} onDone={close} />
          )}
        </div>

        {/* FOOT: never scrolls; the error sits directly above the buttons.
            Absent while loading and on the confirmation. */}
        {step !== 'loading' && step !== 'done' && (
          <div className="pb-modal-foot">
            {step === 'choose' ? (
              <ActionError message={error} kind={errorKind} onRetry={preview ? undefined : () => void loadPreview()} />
            ) : (
              <ActionError message={error} kind={errorKind} />
            )}

            {step === 'empty' && (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" onClick={close} disabled={busy} className="pill" style={{ flex: 1, padding: '0.65rem' }}>{d.accounts.cancel}</button>
                <button type="button" onClick={() => void run(() => deleteAccountAction(account.id))} disabled={busy} className="btn-primary" style={{ flex: 1, padding: '0.65rem', backgroundColor: 'var(--wine)', opacity: busy ? 0.6 : 1 }}>
                  {d.accounts.confirmDelete}
                </button>
              </div>
            )}

            {step === 'choose' && (
              <button type="button" onClick={close} disabled={busy} className="pill" style={{ padding: '0.65rem' }}>{d.accounts.cancel}</button>
            )}

            {step === 'move' && preview && (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" onClick={backToChoose} disabled={busy} className="pill" style={{ flex: 1, padding: '0.65rem' }}>{d.accounts.back}</button>
                <button
                  type="button" disabled={!target || busy}
                  onClick={() => void run(() => moveAndDeleteAccountAction({ accountId: account.id, toAccountId: target, expectedRecordCount: preview.recordTotal }))}
                  className="btn-primary" style={{ flex: 1.3, padding: '0.65rem', opacity: target && !busy ? 1 : 0.6 }}
                >
                  {d.accounts.moveAndDelete}
                </button>
              </div>
            )}

            {step === 'destroy' && preview && (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" onClick={backToChoose} disabled={busy} className="pill" style={{ flex: 1, padding: '0.65rem' }}>{d.accounts.back}</button>
                <button
                  type="button" disabled={!canDestroy}
                  onClick={() => void run(() => deleteAccountWithRecordsAction({ accountId: account.id, confirmName: typed, expectedRecordCount: preview.recordTotal }))}
                  className="btn-primary"
                  style={{ flex: 1.4, padding: '0.65rem', backgroundColor: 'var(--wine)', opacity: canDestroy ? 1 : 0.55 }}
                >
                  {secondsLeft > 0 ? t(d.accounts.countdown, { seconds: secondsLeft }) : d.accounts.destroyConfirm}
                </button>
              </div>
            )}
          </div>
        )}
      </>
      )}
    </ModalFrame>
  );
}
