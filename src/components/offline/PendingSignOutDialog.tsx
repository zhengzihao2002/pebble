'use client';

import { ModalFrame } from '@/components/shared/ModalFrame';
import { ModalCloseButton } from '@/components/shared/ModalCloseButton';
import { useTranslation } from '@/lib/i18n/useTranslation';

/**
 * Shown by the sign-out button when transactions are still waiting to upload.
 * Three honest choices: stay, sign out and keep them on this device (they
 * upload next time THIS account signs in; no one else's session can see or
 * send them), or sign out and discard them.
 *
 * Rendered inside .pebble-root by the caller (ModalFrame renders in place).
 */
export function PendingSignOutDialog({ count, onCancel, onKeep, onDiscard }: {
  count: number;
  onCancel: () => void;
  onKeep: () => void;
  onDiscard: () => void;
}) {
  const { d, t } = useTranslation();
  const o = d.ux.offline;
  return (
    <ModalFrame onClose={onCancel} labelledBy="pb-off-signout-title" maxWidth={440} zIndex={60} cardClassName="pb-off-card">
      {(close) => (
        <>
          <div className="pb-modal-head">
            <div className="pb-off-head">
              <h2 id="pb-off-signout-title" className="font-display">{o.signOutTitle}</h2>
              <ModalCloseButton onClick={close} />
            </div>
          </div>
          <div className="pb-modal-body">
            <p className="pb-off-intro">{t(o.signOutBody, { count })}</p>
          </div>
          <div className="pb-modal-foot">
            <div className="pb-off-stack">
              <button type="button" className="btn-primary pb-off-btn" onClick={close}>{o.signOutCancel}</button>
              <button type="button" className="pill pb-off-btn" onClick={onKeep}>{o.signOutKeep}</button>
              <button type="button" className="pill pb-off-btn pb-off-danger" onClick={onDiscard}>{o.signOutDiscard}</button>
            </div>
          </div>
        </>
      )}
    </ModalFrame>
  );
}
