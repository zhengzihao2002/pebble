'use client';

import { useId, useState } from 'react';
import { useQuietSync } from '@/components/offline/QuietSyncProvider';
import { ActionError } from '@/components/shared/ActionError';
import { CloseSoon } from '@/components/shared/CloseSoon';
import { ModalCloseButton } from '@/components/shared/ModalCloseButton';
import { ModalFrame } from '@/components/shared/ModalFrame';
import { callMutation } from '@/lib/actions/callAction';
import { undoCreditCardPayoffAction } from '@/lib/actions/pebble';
import { formatDate } from '@/lib/format';
import { translateActionError } from '@/lib/i18n/actionErrors';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { quietSyncIsPaused } from '@/lib/offline/quietSync';
import type { CreditCardPayoff } from '@/types';

export function UndoPayoffDialog({ payoff, cardName, onClose }: {
  payoff: CreditCardPayoff;
  cardName: string;
  onClose: () => void;
}) {
  const title = useId();
  const { d, t, locale } = useTranslation();
  const x = d.ux.transactions;
  const { refreshAfterSave } = useQuietSync();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [failure, setFailure] = useState<Extract<Awaited<ReturnType<typeof undoCreditCardPayoffAction>>, { ok: false }> | null>(null);

  const undo = async () => {
    if (busy || done) return;
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

  return (
    <ModalFrame onClose={onClose} busy={busy} labelledBy={title} maxWidth={420}>
      {close => <>
        {done && !busy && <CloseSoon close={close} />}
        <div className="pb-modal-head">
          <h2 id={title} className="font-display">{x.undoPayoffTitle}</h2>
          <ModalCloseButton onClick={close} disabled={busy || done} />
        </div>
        <div className="pb-modal-body themed-scroll">
          <strong>{t(x.undoPayoffFor, { card: cardName, date: formatDate(payoff.date, locale) })}</strong>
          <p>{x.undoPayoffBody}</p>
        </div>
        <div className="pb-modal-foot">
          {failure && <ActionError message={translateActionError(d, locale, failure)} kind={failure.kind} onRetry={undo} busy={busy} />}
          <button type="button" className="pill" onClick={close} disabled={busy || done}>{d.accounts.cancel}</button>
          <button type="button" className="btn-primary" onClick={() => void undo()} disabled={busy || done}>
            {busy ? d.common.saving : x.undoPayoff}
          </button>
        </div>
      </>}
    </ModalFrame>
  );
}
