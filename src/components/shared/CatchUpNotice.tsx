'use client';

import { AlertTriangle, CalendarClock } from 'lucide-react';

interface CatchUpNoticeProps {
  expensesCreated: number;
  incomeCreated: number;
  truncated: boolean;
  error?: string;
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
 */
export function CatchUpNotice({ expensesCreated, incomeCreated, truncated, error }: CatchUpNoticeProps) {
  const created = expensesCreated + incomeCreated;
  if (!error && !truncated && created === 0) return null;

  const isProblem = Boolean(error) || truncated;

  return (
    <div
      className="card"
      style={{ padding: '0.9rem 1.1rem', borderLeft: `3px solid ${isProblem ? 'var(--wine)' : 'var(--pine)'}`, display: 'flex', gap: '0.7rem', alignItems: 'flex-start' }}
    >
      {isProblem
        ? <AlertTriangle size={16} style={{ color: 'var(--wine)', flexShrink: 0, marginTop: 2 }} />
        : <CalendarClock size={16} style={{ color: 'var(--pine)', flexShrink: 0, marginTop: 2 }} />}
      <div style={{ flex: 1, minWidth: 0, fontSize: '0.83rem', lineHeight: 1.5 }}>
        {error ? (
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
    </div>
  );
}
