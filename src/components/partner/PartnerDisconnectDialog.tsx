'use client';

import { useId, useState } from 'react';
import { ModalCloseButton } from '@/components/shared/ModalCloseButton';
import { ModalFrame } from '@/components/shared/ModalFrame';
import { callAction } from '@/lib/actions/callAction';
import { unpairPartnerAction } from '@/lib/actions/partner';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { partnerError } from './partnerError';

export function PartnerDisconnectDialog({ name, pairId, onClose, onUnpaired }: {
  name: string;
  pairId: string;
  onClose: () => void;
  onUnpaired: () => void;
}) {
  const { d, t } = useTranslation();
  const x = d.partner;
  const titleId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <ModalFrame onClose={onClose} busy={busy} labelledBy={titleId}>
      {(close, complete) => <>
        <div className="pb-modal-head pb-partner-modal-head">
          <h2 id={titleId}>{t(x.disconnectTitle, { name })}</h2>
          <ModalCloseButton onClick={close} disabled={busy} />
        </div>
        <div className="pb-modal-body">
          <p>{x.disconnectHelp}</p>
          {error && <p className="pb-partner-error" role="alert">{error}</p>}
        </div>
        <div className="pb-modal-foot pb-partner-modal-actions">
          <button type="button" className="pill" onClick={close} disabled={busy}>{x.cancel}</button>
          <button type="button" className="pill pb-settings-danger" disabled={busy} onClick={async () => {
            setBusy(true);
            setError('');
            const result = await callAction(() => unpairPartnerAction(pairId));
            setBusy(false);
            if (!result.ok) { setError(partnerError(d, result)); return; }
            complete();
            onUnpaired();
          }}>{x.disconnectConfirm}</button>
        </div>
      </>}
    </ModalFrame>
  );
}
