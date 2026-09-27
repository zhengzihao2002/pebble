'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';
import { deletePebbleAccountAction } from '@/lib/actions/pebble';
import { callAction } from '@/lib/actions/callAction';
import type { FailureKind } from '@/lib/actions/failureKind';
import { ActionError } from '@/components/shared/ActionError';
import { LoadingOverlay } from '@/components/shared/Spinner';
import { useCurrentUser } from '@/lib/auth/useCurrentUser';
import { usePebbleStore } from '@/store/usePebbleStore';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { translateActionError } from '@/lib/i18n/actionErrors';

type Step = 'warn' | 'confirm' | 'farewell';
const COUNTDOWN_SECONDS = 10;

/**
 * Deleting the whole Pebble account. Warning -> last chance (checkbox, typed
 * email, 10-second countdown) -> the server deletes everything -> a farewell
 * animation -> a full page load to sign-in. The farewell only plays after the
 * server confirms: a failure shows the error and nothing was deleted.
 */
export function DeletePebbleAccountDialog({ onClose }: { onClose: () => void }) {
  const { d, t, locale } = useTranslation();
  const { email } = useCurrentUser();
  const [step, setStep] = useState<Step>('warn');
  const [understood, setUnderstood] = useState(false);
  const [typed, setTyped] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<FailureKind | undefined>(undefined);

  useEffect(() => {
    if (step !== 'confirm') return;
    setSecondsLeft(COUNTDOWN_SECONDS);
    const id = window.setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(id);
  }, [step]);

  // After the farewell, a FULL page load: nothing from the deleted account
  // stays in memory, and replace() keeps Back from returning to it.
  useEffect(() => {
    if (step !== 'farewell') return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const id = window.setTimeout(() => window.location.replace('/auth/sign-in'), reduced ? 3500 : 5600);
    return () => window.clearTimeout(id);
  }, [step]);

  const emailMatches = email !== '' && typed.trim().toLowerCase() === email.trim().toLowerCase();
  const canDelete = understood && emailMatches && secondsLeft === 0 && !busy;

  const requestClose = () => { if (busy || step === 'farewell') return; onClose(); };

  const confirm = async () => {
    if (!canDelete) return;
    setBusy(true);
    setError(null);
    const result = await callAction(() => deletePebbleAccountAction({ confirmEmail: typed }));
    setBusy(false);
    if (!result.ok) {
      setError(translateActionError(d, locale, result));
      setErrorKind(result.kind);
      return;
    }
    usePebbleStore.getState().resetFilterPrefs();
    setStep('farewell');
  };

  if (step === 'farewell') {
    const root = document.querySelector('.pebble-root');
    return root ? createPortal(<Farewell />, root) : <Farewell />;
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,20,18,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 60, overflowY: 'auto' }}
      onClick={requestClose}
    >
      <div className="card" style={{ padding: '1.75rem', width: '100%', maxWidth: 460, boxSizing: 'border-box', margin: '1rem 0', position: 'relative' }} onClick={(e) => e.stopPropagation()}>
        {busy && <LoadingOverlay label={d.deleteMe.deleting} />}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <h2 className="font-display" style={{ fontSize: '1.2rem', fontWeight: 600, margin: 0, color: 'var(--wine)' }}>
            {step === 'warn' ? d.deleteMe.title : d.deleteMe.confirmTitle}
          </h2>
          <button type="button" onClick={requestClose} disabled={busy} className="icon-btn" style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', flexShrink: 0 }}>
            <X size={18} />
          </button>
        </div>

        {step === 'warn' && (
          <div className="goal-step" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.6rem', padding: '0.85rem 0.95rem', borderRadius: '0.8rem', backgroundColor: 'var(--wine-soft)', color: 'var(--ink)', fontSize: '0.85rem', lineHeight: 1.55 }}>
              <AlertTriangle size={18} style={{ color: 'var(--wine)', flexShrink: 0, marginTop: 2 }} />
              <div>
                <p style={{ margin: '0 0 0.4rem', fontWeight: 600 }}>{d.deleteMe.warnIntro}</p>
                <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                  <li>{d.deleteMe.warnTransactions}</li>
                  <li>{d.deleteMe.warnMoney}</li>
                  <li>{d.deleteMe.warnSchedules}</li>
                  <li>{d.deleteMe.warnSignIn}</li>
                </ul>
              </div>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--ink-soft)', lineHeight: 1.5, margin: 0 }}>{d.deleteMe.warnFinal}</p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" onClick={requestClose} className="btn-primary" style={{ flex: 1.2, padding: '0.65rem' }}>{d.deleteMe.keep}</button>
              <button type="button" onClick={() => setStep('confirm')} className="pill" style={{ flex: 1, padding: '0.65rem', color: 'var(--wine)' }}>{d.deleteMe.continue}</button>
            </div>
          </div>
        )}

        {step === 'confirm' && (
          <div className="goal-step" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <label style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', fontSize: '0.85rem', lineHeight: 1.5, cursor: 'pointer' }}>
              <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} style={{ marginTop: 3, flexShrink: 0 }} />
              <span>{d.deleteMe.understand}</span>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.8rem', color: 'var(--ink-soft)' }}>
              {/* email is the signed-in user's own address - user data. */}
              {t(d.deleteMe.typeEmail, { email })}
              <input
                value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} inputMode="email"
                style={{ padding: '0.55rem 0.65rem', borderRadius: '0.55rem', border: `1px solid ${typed && !emailMatches ? 'var(--wine)' : 'var(--line)'}`, fontSize: '0.9rem', color: 'var(--ink)', backgroundColor: 'var(--paper)' }}
              />
            </label>
            <ActionError message={error} kind={errorKind} />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" onClick={requestClose} className="pill" style={{ flex: 1, padding: '0.65rem' }}>{d.deleteMe.keep}</button>
              <button
                type="button" onClick={() => void confirm()} disabled={!canDelete}
                className="btn-primary"
                style={{ flex: 1.5, padding: '0.65rem', backgroundColor: 'var(--wine)', opacity: canDelete ? 1 : 0.55 }}
              >
                {secondsLeft > 0 ? t(d.deleteMe.countdown, { seconds: secondsLeft }) : d.deleteMe.confirm}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The goodbye. A sad pebble sways, cries, and sinks away while three lines
 * fade in. Motion is decoration: the global reduced-motion rule stops it and
 * the CSS then shows the text at once.
 */
function Farewell() {
  const { d } = useTranslation();
  return (
    <div className="farewell" role="status" aria-live="polite">
      <svg viewBox="0 0 200 200" className="farewell-pebble" aria-hidden="true">
        <defs>
          <radialGradient id="farewell-shade" cx="38%" cy="32%" r="75%">
            <stop offset="0%" style={{ stopColor: 'var(--mist)' }} />
            <stop offset="100%" style={{ stopColor: 'var(--line)' }} />
          </radialGradient>
        </defs>
        <ellipse cx="100" cy="184" rx="56" ry="7" className="farewell-shadow" />
        <path
          d="M100 40 C150 38 176 80 170 120 C164 160 132 176 98 175 C58 173 28 152 30 114 C32 72 58 42 100 40 Z"
          fill="url(#farewell-shade)" className="farewell-body"
        />
        <path d="M64 90 L84 96" className="farewell-face" />
        <path d="M136 90 L116 96" className="farewell-face" />
        <path d="M66 108 Q76 115 86 108" className="farewell-face" />
        <path d="M114 108 Q124 115 134 108" className="farewell-face" />
        <path d="M84 142 Q100 130 116 142" className="farewell-face" />
        <path d="M76 114 Q71 124 76 129 Q81 124 76 114 Z" className="farewell-tear t1" />
        <path d="M124 114 Q119 124 124 129 Q129 124 124 114 Z" className="farewell-tear t2" />
      </svg>
      <p className="font-display farewell-line l1" style={{ fontSize: '1.9rem', fontWeight: 600, margin: 0 }}>{d.deleteMe.farewellTitle}</p>
      <p className="farewell-line l2" style={{ fontSize: '0.95rem', color: 'var(--ink-soft)', margin: 0, maxWidth: 420 }}>{d.deleteMe.farewellBody}</p>
      <p className="farewell-line l3" style={{ fontSize: '0.95rem', color: 'var(--ink-soft)', margin: 0, maxWidth: 420 }}>{d.deleteMe.farewellGoodbye}</p>
    </div>
  );
}
