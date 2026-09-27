'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { LogOut } from 'lucide-react';
import { signOutCompletely } from '@/lib/auth/signOut';
import { Spinner } from '@/components/shared/Spinner';
import { useTranslation } from '@/lib/i18n/useTranslation';

interface SignOutButtonProps {
  className?: string;
  style?: React.CSSProperties;
  iconSize?: number;
}

type Phase = 'idle' | 'working' | 'failed';

export function SignOutButton({ className = 'nav-btn', style, iconSize = 18 }: SignOutButtonProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const { d } = useTranslation();

  const run = async () => {
    setPhase('working');
    const ok = await signOutCompletely();
    // On success the page is already navigating away - the overlay stays up
    // until it goes. On failure, say so and offer a way out.
    if (!ok) setPhase('failed');
  };

  // Portalled into .pebble-root, never document.body (project rule), so the
  // overlay inherits the theme and sits above every page and modal. Only ever
  // looked up after a click, so it never runs during the server render.
  const root = phase !== 'idle' && typeof document !== 'undefined'
    ? document.querySelector('.pebble-root')
    : null;

  return (
    <>
      <button onClick={run} className={className} style={style} disabled={phase !== 'idle'}>
        <LogOut size={iconSize} />
        {d.auth.signOut}
      </button>
      {root && createPortal(
        <SigningOutOverlay phase={phase} onRetry={run} onCancel={() => setPhase('idle')} />,
        root,
      )}
    </>
  );
}

/**
 * Full-screen, opaque, above modals. Covers the whole app the moment sign-out
 * starts, so the half-emptied shell underneath is never seen. No cancel while
 * working: a sign-out already in flight cannot be meaningfully stopped.
 */
function SigningOutOverlay({ phase, onRetry, onCancel }: { phase: Phase; onRetry: () => void; onCancel: () => void }) {
  const { d } = useTranslation();
  const working = phase === 'working';
  return (
    <div
      role={working ? 'status' : 'alertdialog'}
      aria-live={working ? 'polite' : 'assertive'}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        backgroundColor: 'var(--paper)', color: 'var(--ink)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: '1.25rem', padding: '2rem', textAlign: 'center', cursor: working ? 'wait' : 'default',
      }}
    >
      {working ? (
        <>
          <Spinner size={56} color="var(--pine)" />
          <p className="font-display" style={{ fontSize: '2rem', fontWeight: 600, margin: 0 }}>{d.auth.signingOut}</p>
        </>
      ) : (
        <>
          <p className="font-display" style={{ fontSize: '1.6rem', fontWeight: 600, margin: 0 }}>{d.auth.signOutFailed}</p>
          <p style={{ fontSize: '0.9rem', color: 'var(--ink-soft)', maxWidth: 360, lineHeight: 1.5, margin: 0 }}>{d.auth.signOutFailedHint}</p>
          <div style={{ display: 'flex', gap: '0.6rem' }}>
            <button type="button" className="pill" onClick={onCancel} style={{ padding: '0.6rem 1.2rem' }}>{d.auth.cancel}</button>
            <button type="button" className="btn-primary" onClick={onRetry} style={{ padding: '0.6rem 1.2rem' }}>{d.auth.tryAgain}</button>
          </div>
        </>
      )}
    </div>
  );
}
