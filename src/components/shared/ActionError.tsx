'use client';

import { RefreshCw } from 'lucide-react';
import { isRetryable, type FailureKind } from '@/lib/actions/failureKind';
import { useTranslation } from '@/lib/i18n/useTranslation';

interface ActionErrorProps {
  message: string | null;
  kind?: FailureKind;
  /** Re-runs the exact call that failed. Offered only when the kind allows it. */
  onRetry?: () => void;
  busy?: boolean;
  style?: React.CSSProperties;
}

/**
 * One inline failure notice for every mutation path.
 *
 * The retry button is gated on isRetryable(kind), NOT on the caller passing a
 * handler. A caller can always pass one; whether it is shown is decided by
 * what we know about the failure. That keeps the "never retry a call that
 * might have committed" rule in a single place instead of relying on every
 * call site to remember it - most writes here are not idempotent, and a retry
 * of a call that actually succeeded produces a duplicate financial record.
 *
 * Renders nothing without a message, so call sites need no && guard.
 *
 * ⚠️ THE MESSAGE ITSELF IS NOT TRANSLATED. It is produced by the server
 * actions in pebble.ts, which return English prose. Localizing it means
 * changing what those actions RETURN - a key or a FailureKind rather than a
 * sentence - which is a change to a 'use server' module and belongs in its
 * own phase with its own build gate. Until then a Chinese user sees a
 * translated button under an English message. Known, tracked, not an
 * oversight.
 */
export function ActionError({ message, kind, onRetry, busy = false, style }: ActionErrorProps) {
  // Called before the early return: hooks must not sit behind a conditional.
  // Reuses d.error.retry rather than a second key - identical words, and one
  // entry means the two buttons cannot drift apart.
  const { d } = useTranslation();
  if (!message) return null;

  const showRetry = onRetry !== undefined && isRetryable(kind);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.45rem', ...style }}>
      <p style={{ fontSize: '0.8rem', color: 'var(--wine)', margin: 0, lineHeight: 1.45 }}>{message}</p>
      {showRetry && (
        <button
          type="button" onClick={onRetry} disabled={busy} className="pill"
          style={{ padding: '0.35rem 0.7rem', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: 5, opacity: busy ? 0.6 : 1 }}
        >
          <RefreshCw size={13} />{d.error.retry}
        </button>
      )}
    </div>
  );
}
