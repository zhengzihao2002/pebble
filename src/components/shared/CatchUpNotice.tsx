'use client';

import { useState } from 'react';
import { AlertTriangle, CalendarClock, X } from 'lucide-react';

interface CatchUpNoticeProps {
  expensesCreated: number;
  incomeCreated: number;
  truncated: boolean;
  /**
   * Whether the run failed - NOT the message. The underlying error string can
   * echo Postgres query fragments, and pebble.ts's policy is that those never
   * reach the client. The full error is logged server-side in catchUp.ts.
   */
  failed?: boolean;
}

/**
 * Reports what recurring catch-up did on this page load.
 *
 * This exists because the architecture was chosen on the argument that "cron
 * failures are silent; catch-up failures are visible because I'm right there".
 * Without this the feature had exactly the silent-failure property it was
 * designed to avoid: a rule that threw showed up as a payment that simply
 * never appeared, with no explanation anywhere.
 *
 * Props are primitives rather than the CatchUpResult type, so this client
 * component never imports the server-only catchUp module.
 *
 * awaitingTimeZone is deliberately NOT surfaced: it self-corrects within the
 * same load - AppShell writes the cookie and refreshes - so showing it would
 * be a warning about a state the user can never actually observe.
 *
 * PASSIVE AND NON-BLOCKING. Catch-up is idempotent and retries on the next
 * load, so this is information, never an obstacle. Dismissal is per-load
 * state, not persisted: if the failure is still happening on the next load,
 * the notice comes back, which is correct. Persisting a dismissal would let
 * someone permanently silence a warning about transactions that are still
 * not appearing.
 */
export function CatchUpNotice({ expensesCreated, incomeCreated, truncated, failed }: CatchUpNoticeProps) {
  const [dismissed, setDismissed] = useState(false);

  const created = expensesCreated + incomeCreated;
  if (dismissed) return null;
  if (!failed && !truncated && created === 0) return null;

  const isProblem = Boolean(failed) || truncated;

  return (
    <div
      className="card"
      style={{ padding: '0.9rem 1.1rem', borderLeft: `3px solid ${isProblem ? 'var(--wine)' : 'var(--pine)'}`, display: 'flex', gap: '0.7rem', alignItems: 'flex-start' }}
    >
      {isProblem
        ? <AlertTriangle size={16} style={{ color: 'var(--wine)', flexShrink: 0, marginTop: 2 }} />
        : <CalendarClock size={16} style={{ color: 'var(--pine)', flexShrink: 0, marginTop: 2 }} />}
      <div style={{ flex: 1, minWidth: 0, fontSize: '0.83rem', lineHeight: 1.5 }}>
        {failed ? (
          <>
            <strong>Some scheduled payments could not be added.</strong> They will be retried next
            time you open Pebble — nothing has been duplicated or lost. If it keeps happening, the
            details are in the server logs.
          </>
        ) : truncated ? (
          <>
            <strong>Added {created} scheduled {created === 1 ? 'transaction' : 'transactions'}, with more to come.</strong>{' '}
            There were too many to create at once. Reload the page to continue where it left off.
          </>
        ) : (
          <>
            Added {created} scheduled {created === 1 ? 'transaction' : 'transactions'} that came due
            since your last visit.
          </>
        )}
      </div>
      <button
        type="button" onClick={() => setDismissed(true)} className="icon-btn"
        aria-label="Dismiss"
        style={{ width: 26, height: 26, borderRadius: '50%', border: 'none', flexShrink: 0, marginTop: -2 }}
      >
        <X size={14} />
      </button>
    </div>
  );
}
