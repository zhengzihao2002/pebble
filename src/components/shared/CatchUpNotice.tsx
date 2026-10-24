'use client';

import { useState } from 'react';
import { AlertTriangle, CalendarClock, X } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';

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

interface CatchUpSummary {
  expensesCreated: number;
  incomeCreated: number;
  truncated: boolean;
  failed: boolean;
}

const hasContent = (s: CatchUpSummary) => s.failed || s.truncated || s.expensesCreated + s.incomeCreated > 0;
const sameSummary = (a: CatchUpSummary, b: CatchUpSummary) =>
  a.expensesCreated === b.expensesCreated && a.incomeCreated === b.incomeCreated
  && a.truncated === b.truncated && a.failed === b.failed;
const mergeSummary = (a: CatchUpSummary, b: CatchUpSummary): CatchUpSummary => ({
  expensesCreated: a.expensesCreated + b.expensesCreated,
  incomeCreated: a.incomeCreated + b.incomeCreated,
  // The flags describe the LATEST run (a retry that succeeds resolves an
  // earlier failure); only the counts accumulate.
  truncated: b.truncated,
  failed: b.failed,
});

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
  const { d, t } = useTranslation();
  const [dismissed, setDismissed] = useState(false);

  // LATCHED. The server page runs catch-up on EVERY render of the route, and
  // the first render is the one that materialises the rows. Anything that
  // re-renders the route on the client afterwards - AppShell's router.refresh()
  // when the time-zone or language cookie was missing or stale (phones clear
  // script-written cookies more readily), a server action's revalidatePath -
  // fetches a fresh payload in which catch-up finds nothing left to do, so the
  // props arrive as 0 / 0 / false. Rendering the props directly therefore made
  // the notice flash and vanish by itself a moment after load (owner-reported
  // on a phone after an overnight payment).
  //
  // The client component instance survives router.refresh(), so what the first
  // non-empty payload said is kept in state and shown until the user dismisses
  // it or leaves the page (state resets when the page unmounts). A LATER
  // non-empty payload with different values is a different catch-up run and is
  // added on top; an identical repeat is the same run re-delivered (React
  // re-rendering the same props) and is not counted twice.
  const [latched, setLatched] = useState<CatchUpSummary | null>(null);
  const [seen, setSeen] = useState<CatchUpSummary | null>(null);
  const incoming: CatchUpSummary = { expensesCreated, incomeCreated, truncated, failed: Boolean(failed) };
  if (hasContent(incoming) && !(seen && sameSummary(seen, incoming))) {
    // Setting state during render for props-derived state is the documented
    // pattern; React re-renders immediately, before any paint or effect.
    setSeen(incoming);
    setLatched(latched ? mergeSummary(latched, incoming) : incoming);
  }

  if (dismissed || !latched) return null;

  const created = latched.expensesCreated + latched.incomeCreated;
  const truncatedNow = latched.truncated;
  const failedNow = latched.failed;
  const isProblem = failedNow || truncatedNow;

  return (
    <div
      className="card"
      style={{ padding: '0.9rem 1.1rem', borderLeft: `3px solid ${isProblem ? 'var(--wine)' : 'var(--pine)'}`, display: 'flex', gap: '0.7rem', alignItems: 'flex-start' }}
    >
      {isProblem
        ? <AlertTriangle size={16} style={{ color: 'var(--wine)', flexShrink: 0, marginTop: 2 }} />
        : <CalendarClock size={16} style={{ color: 'var(--pine)', flexShrink: 0, marginTop: 2 }} />}
      <div style={{ flex: 1, minWidth: 0, fontSize: '0.83rem', lineHeight: 1.5 }}>
        {/* The singular/plural choice is made HERE, by picking one of two
            dictionary keys, rather than by splicing a noun into a sentence.
            Chinese maps both keys to the same string, which is correct rather
            than a shortcut - it genuinely has no plural inflection. */}
        {failedNow ? (
          <>
            <strong>{d.catchUp.failedTitle}</strong> {d.catchUp.failedBody}
          </>
        ) : truncatedNow ? (
          <>
            <strong>{t(created === 1 ? d.catchUp.truncatedTitleOne : d.catchUp.truncatedTitleOther, { count: created })}</strong>{' '}
            {d.catchUp.truncatedBody}
          </>
        ) : (
          <>
            {t(created === 1 ? d.catchUp.addedOne : d.catchUp.addedOther, { count: created })}
          </>
        )}
      </div>
      <button
        type="button" onClick={() => setDismissed(true)} className="icon-btn"
        aria-label={d.catchUp.dismiss}
        style={{ width: 26, height: 26, borderRadius: '50%', border: 'none', flexShrink: 0, marginTop: -2 }}
      >
        <X size={14} />
      </button>
    </div>
  );
}
