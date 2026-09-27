'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, ArrowRightLeft, Check, Trash2, X } from 'lucide-react';
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

  // A ref, not the prop: the page re-renders after the delete revalidates,
  // handing a new onClose each time, which would restart the timer.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });
  useEffect(() => {
    if (step !== 'done') return;
    const id = window.setTimeout(() => onCloseRef.current(), 1600);
    return () => window.clearTimeout(id);
  }, [step]);

  const requestClose = () => { if (busy) return; onClose(); };

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

  return (
    <div
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,20,18,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 60, overflowY: 'auto' }}
      onClick={requestClose}
    >
      <div className="card" style={{ padding: '1.75rem', width: '100%', maxWidth: 460, boxSizing: 'border-box', margin: '1rem 0', position: 'relative' }} onClick={(e) => e.stopPropagation()}>
        {busy && <LoadingOverlay label={d.accounts.deleting} />}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.9rem', gap: '0.75rem' }}>
          {/* account.name is USER DATA and is inserted untranslated. */}
          <h2 className="font-display" style={{ fontSize: '1.15rem', fontWeight: 600, margin: 0 }}>
            {step === 'destroy' ? t(d.accounts.destroyTitle, { name: account.name }) : t(d.accounts.confirmTitle, { name: account.name })}
          </h2>
          <button type="button" onClick={requestClose} disabled={busy} className="icon-btn" style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', flexShrink: 0 }}>
            <X size={18} />
          </button>
        </div>

        {step === 'loading' && <LoadingBlock label={d.accounts.deleteLoading} />}

        {step === 'empty' && (
          <div className="goal-step" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', lineHeight: 1.5, margin: 0 }}>{d.accounts.deleteEmptyBody}</p>
            <ActionError message={error} kind={errorKind} />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" onClick={requestClose} className="pill" style={{ flex: 1, padding: '0.65rem' }}>{d.accounts.cancel}</button>
              <button type="button" onClick={() => void run(() => deleteAccountAction(account.id))} className="btn-primary" style={{ flex: 1, padding: '0.65rem', backgroundColor: 'var(--wine)' }}>
                {d.accounts.confirmDelete}
              </button>
            </div>
          </div>
        )}

        {step === 'choose' && (
          <div className="goal-step" style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            <ActionError message={error} kind={errorKind} onRetry={preview ? undefined : () => void loadPreview()} />
            {preview && (
              <>
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
              </>
            )}
            <button type="button" onClick={requestClose} className="pill" style={{ padding: '0.65rem' }}>{d.accounts.cancel}</button>
          </div>
        )}

        {step === 'move' && preview && (
          <div className="goal-step" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', lineHeight: 1.5, margin: 0 }}>{d.accounts.optionMoveHint}</p>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.8rem', color: 'var(--ink-soft)' }}>
              {d.accounts.moveTo}
              <select
                value={target} onChange={(e) => setTarget(e.target.value)}
                style={{ padding: '0.5rem 0.6rem', borderRadius: '0.5rem', border: '1px solid var(--line)', fontSize: '0.87rem', color: 'var(--ink)', backgroundColor: 'var(--paper)' }}
              >
                {destinations.map((a) => (
                  <option key={a.id} value={a.id}>{a.last4 ? `${a.name} ····${a.last4}` : a.name}</option>
                ))}
              </select>
            </label>
            <ActionError message={error} kind={errorKind} />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" onClick={() => { setError(null); setStep('choose'); }} className="pill" style={{ flex: 1, padding: '0.65rem' }}>{d.accounts.back}</button>
              <button
                type="button" disabled={!target}
                onClick={() => void run(() => moveAndDeleteAccountAction({ accountId: account.id, toAccountId: target, expectedRecordCount: preview.recordTotal }))}
                className="btn-primary" style={{ flex: 1.3, padding: '0.65rem', opacity: target ? 1 : 0.6 }}
              >
                {d.accounts.moveAndDelete}
              </button>
            </div>
          </div>
        )}

        {step === 'destroy' && preview && (
          <div className="goal-step" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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

            <ActionError message={error} kind={errorKind} />

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" onClick={() => { setError(null); setStep('choose'); }} className="pill" style={{ flex: 1, padding: '0.65rem' }}>{d.accounts.back}</button>
              <button
                type="button" disabled={!canDestroy}
                onClick={() => void run(() => deleteAccountWithRecordsAction({ accountId: account.id, confirmName: typed, expectedRecordCount: preview.recordTotal }))}
                className="btn-primary"
                style={{ flex: 1.4, padding: '0.65rem', backgroundColor: 'var(--wine)', opacity: canDestroy ? 1 : 0.55 }}
              >
                {secondsLeft > 0 ? t(d.accounts.countdown, { seconds: secondsLeft }) : d.accounts.destroyConfirm}
              </button>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="goal-step" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.8rem', padding: '1.25rem 0', textAlign: 'center' }}>
            <span className="goal-done-badge" style={{ width: 64, height: 64, borderRadius: '50%', backgroundColor: 'var(--pine)', color: 'var(--paper)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Check size={30} />
            </span>
            <p className="font-display" style={{ fontSize: '1.4rem', fontWeight: 600, margin: 0 }}>{d.accounts.deletedTitle}</p>
            <p style={{ fontSize: '0.88rem', color: 'var(--ink-soft)', margin: 0 }}>{t(d.accounts.deletedBody, { name: account.name })}</p>
          </div>
        )}
      </div>
    </div>
  );
}
