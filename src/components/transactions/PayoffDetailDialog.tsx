'use client';

import { useId, useState } from 'react';
import { ArrowRightLeft, CalendarDays, Trash2 } from 'lucide-react';
import { useQuietSync } from '@/components/offline/QuietSyncProvider';
import { ActionError } from '@/components/shared/ActionError';
import { CloseSoon } from '@/components/shared/CloseSoon';
import { ModalCloseButton } from '@/components/shared/ModalCloseButton';
import { ModalFrame } from '@/components/shared/ModalFrame';
import { callMutation } from '@/lib/actions/callAction';
import { undoCreditCardPayoffAction } from '@/lib/actions/pebble';
import { formatCurrency, formatLongDate } from '@/lib/format';
import { translateActionError } from '@/lib/i18n/actionErrors';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { quietSyncIsPaused } from '@/lib/offline/quietSync';
import { useSafetyLock } from '@/lib/useSafetyLock';
import type { StatementPayoff } from './statementMath';

export function PayoffDetailDialog({ payoff, cardName, funding, onClose }: {
  payoff: StatementPayoff;
  cardName: string;
  funding: string;
  onClose: () => void;
}) {
  const title = useId();
  const { d, t, locale } = useTranslation();
  const x = d.ux.transactions;
  const { refreshAfterSave } = useQuietSync();
  const locked = useSafetyLock('deleteTransactions');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [failure, setFailure] = useState<Extract<Awaited<ReturnType<typeof undoCreditCardPayoffAction>>, { ok: false }> | null>(null);

  const undo = async () => {
    if (busy || done || locked) return;
    setBusy(true);
    setFailure(null);
    const deferPageRefresh = quietSyncIsPaused();
    const result = await callMutation(undoCreditCardPayoffAction, { receiptId: payoff.id, cardId: payoff.cardId, deferPageRefresh });
    if (result.ok) {
      setDone(true);
      try {
        await refreshAfterSave('transaction', { refreshCurrent: deferPageRefresh });
      } finally {
        setBusy(false);
      }
    } else {
      setFailure(result);
      setBusy(false);
    }
  };

  const onCard = payoff.side === 'card';
  const date = formatLongDate(payoff.date, locale);

  return (
    <ModalFrame onClose={onClose} busy={busy} labelledBy={title} maxWidth={600} cardClassName="pb-tdlg-card">
      {close => <>
        {done && !busy && <CloseSoon close={close} />}
        <div className="pb-modal-head">
          <div className="pb-tdlg-head">
            <span className="pb-tdlg-tile pb-payoff-detail-tile" aria-hidden="true"><ArrowRightLeft size={24} /></span>
            <h2 id={title} className="font-display pb-tdlg-title">{x.cardPayoff}</h2>
            <ModalCloseButton onClick={close} disabled={busy || done} />
          </div>
        </div>
        <div className="pb-modal-body themed-scroll">
          <div className="pb-tdlg-view">
            <div className="pb-tdlg-receipt pb-tdlg-hero">
              <div className="pb-tdlg-amount font-display">{formatCurrency(onCard ? payoff.amount : -payoff.amount)}</div>
              <ul className="pb-tdlg-chips">
                <li className="pb-tdlg-chip"><CalendarDays size={13} aria-hidden="true" /><span className="pb-tdlg-chip-text">{date}</span></li>
              </ul>
            </div>
            <dl className="pb-tdlg-rows">
              {funding && <div className="pb-tdlg-row"><dt>{x.payoffSource}</dt><dd>{funding}</dd></div>}
              <div className="pb-tdlg-row"><dt>{x.payoffDestination}</dt><dd>{cardName}</dd></div>
            </dl>
            {confirming ? (
              <div className="pb-payoff-confirm">
                <h3>{x.deletePayoffTitle}</h3>
                <p className="pb-tdlg-note">{x.deletePayoffBody}</p>
              </div>
            ) : onCard && (
              <p className="pb-tdlg-note">{t(x.cardPayoffRemaining, { amount: formatCurrency(payoff.remainingBalance) })}</p>
            )}
          </div>
        </div>
        <div className="pb-modal-foot">
          {failure && <ActionError message={translateActionError(d, locale, failure)} kind={failure.kind} onRetry={undo} busy={busy} />}
          {confirming ? (
            <div className="pb-payoff-detail-actions">
              <button type="button" className="pill" onClick={() => { setConfirming(false); setFailure(null); }} disabled={busy || done}>{d.txnDetail.cancel}</button>
              <button type="button" className="btn-primary pb-payoff-delete-confirm" onClick={() => void undo()} disabled={busy || done}>
                {busy ? d.txnDetail.deletingOverlay : d.txnDetail.delete}
              </button>
            </div>
          ) : (
            <div className="pb-payoff-detail-actions">
              <button type="button" className="pill pb-payoff-delete" onClick={() => setConfirming(true)} disabled={locked} title={locked ? d.safetyLocks.lockedHint : undefined}>
                <Trash2 size={14} aria-hidden="true" />{d.txnDetail.delete}
              </button>
            </div>
          )}
        </div>
      </>}
    </ModalFrame>
  );
}
