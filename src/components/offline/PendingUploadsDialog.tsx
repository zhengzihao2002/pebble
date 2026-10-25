'use client';

import { createElement, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Check, Clock, RefreshCw, WifiOff } from 'lucide-react';
import { ModalFrame } from '@/components/shared/ModalFrame';
import { ModalCloseButton } from '@/components/shared/ModalCloseButton';
import { SaveSuccess } from '@/components/shared/SaveSuccess';
import { Spinner } from '@/components/shared/Spinner';
import { resolveCategoryIcon } from '@/lib/data/icons';
import { formatCurrency, formatDate } from '@/lib/format';
import { categoryLabel } from '@/lib/i18n/enumLabels';
import { translateActionError } from '@/lib/i18n/actionErrors';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { descriptionTitle } from '@/lib/transactionDescription';
import type { QueuedTransaction } from '@/lib/offline/queueStore';
import { useOfflineQueue } from './OfflineProvider';

/**
 * "Waiting to upload": the transactions saved on this device while offline.
 *
 * One dialog, three situations:
 *  - back online: offered once, with Upload now / Later;
 *  - offline: reachable from the header badge to review or remove items, with
 *    Upload disabled and the reason beside it;
 *  - during and after a run: per-row state (waiting, uploading, uploaded,
 *    not uploaded + why + Retry), a summary, and on full success the same
 *    confirmation Add transaction uses before it closes.
 *
 * Nothing here changes a balance: waiting items are only listed, never added
 * to any figure, until the server has them and the page has refreshed.
 */

export function PendingUploadsDialog() {
  const { d, t, locale } = useTranslation();
  const o = d.ux.offline;
  const q = useOfflineQueue();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const allUploaded = q.result !== null && q.result.failed === 0 && q.items.length === 0;
  const canUpload = !q.offline && !q.running && q.items.length > 0;
  const failedCount = q.items.filter((i) => q.uploads[i.clientId]?.status === 'failed').length;

  return (
    <ModalFrame onClose={q.closeList} busy={q.running} labelledBy="pb-off-title" maxWidth={540} cardClassName="pb-off-card">
      {(close) => (
        <>
          <div className="pb-modal-head">
            <div className="pb-off-head">
              <h2 id="pb-off-title" className="font-display">
                {o.dialogTitle}
                {q.items.length > 0 && <span className="pb-off-count pb-tnum">{q.items.length}</span>}
              </h2>
              <ModalCloseButton onClick={close} disabled={q.running} />
            </div>
          </div>

          <div className="pb-modal-body">
            {allUploaded ? (
              // SaveSuccess closes the dialog itself after its hold, from a
              // settled render (the run has finished, so the frame is no
              // longer busy) - the same path a normal save takes.
              <SaveSuccess title={o.summaryAll} body={o.summaryAllBody} onDone={close} />
            ) : q.items.length === 0 ? (
              <div className="pb-off-empty" role="status">
                <span className="pb-off-empty-icon" aria-hidden="true"><Check size={20} /></span>
                <p className="pb-off-empty-title">{o.emptyTitle}</p>
                <p className="pb-off-empty-body">{o.emptyBody}</p>
              </div>
            ) : (
              <>
                <p className="pb-off-intro">
                  {q.running ? o.introRunning : q.offline ? o.introOffline : o.introOnline}
                </p>
                <p className="pb-off-note">{o.notCounted}{locale === 'zh' ? '' : ' '}{o.appOpenNote}</p>

                {q.banner && (
                  <div className="pb-off-banner" role="alert">
                    <AlertTriangle size={16} aria-hidden="true" />
                    <span>{q.banner === 'sessionExpired' ? o.sessionExpired : o.connectionLost}</span>
                    {q.banner === 'sessionExpired' && (
                      <Link className="pill pb-off-signin" href="/auth/sign-in" prefetch={false}>{o.signInAgain}</Link>
                    )}
                  </div>
                )}
                {q.result && q.items.length > 0 && !q.banner && (
                  <div className="pb-off-banner pb-off-banner-info" role="status">
                    <span>
                      <strong>{t(o.summarySome, { done: String(q.result.done), failed: String(q.items.length) })}</strong>
                      <br />{o.summarySomeBody}
                    </span>
                  </div>
                )}

                <ul className="pb-off-list">
                  {q.items.map((item) => (
                    <PendingRow
                      key={item.key}
                      item={item}
                      confirming={confirmId === item.clientId}
                      onAskRemove={() => setConfirmId(item.clientId)}
                      onCancelRemove={() => setConfirmId(null)}
                      onRemove={() => { setConfirmId(null); void q.removeItem(item.clientId); }}
                      onRetry={() => q.uploadOne(item.clientId)}
                    />
                  ))}
                </ul>
              </>
            )}
          </div>

          {!allUploaded && (
            <div className="pb-modal-foot">
              {q.items.length > 0 && q.offline && (
                <p id="pb-off-why" className="pb-off-why">
                  <WifiOff size={14} aria-hidden="true" /> {o.needsConnectionToUpload}
                </p>
              )}
              <div className="pb-off-actions">
                <button type="button" className="pill pb-off-btn" onClick={close} disabled={q.running}>
                  {q.items.length === 0 || q.offline ? o.close : o.later}
                </button>
                {q.items.length > 0 && (
                  <button
                    type="button" className="btn-primary pb-off-btn"
                    onClick={q.uploadAll} disabled={!canUpload}
                    aria-describedby={q.offline ? 'pb-off-why' : undefined}
                  >
                    {q.running ? <><Spinner size={14} /> {o.uploading}</> : failedCount > 0 ? o.retry : o.uploadNow}
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </ModalFrame>
  );
}

function PendingRow({ item, confirming, onAskRemove, onCancelRemove, onRemove, onRetry }: {
  item: QueuedTransaction;
  confirming: boolean;
  onAskRemove: () => void;
  onCancelRemove: () => void;
  onRemove: () => void;
  onRetry: () => void;
}) {
  const { d, locale } = useTranslation();
  const o = d.ux.offline;
  const q = useOfflineQueue();
  const state = q.uploads[item.clientId] ?? { status: 'waiting' as const };
  const isIncome = item.kind === 'income';
  const title = descriptionTitle(item.payload.description) || o.noDescription;
  const glyph = isIncome ? <ArrowUpRight size={16} />
    : item.display.iconKey ? createElement(resolveCategoryIcon(item.display.iconKey), { size: 16 })
    : <ArrowDownRight size={16} />;
  const tint = isIncome ? 'var(--pine)' : item.display.color || 'var(--ink-soft)';
  const busy = q.running;

  return (
    <li className="pb-off-row" data-status={state.status}>
      <div className="pb-off-row-main">
        <span className="pb-off-tile" aria-hidden="true" style={{ ['--pb-off-tint' as string]: tint }}>
          {glyph}
        </span>
        <div className="pb-off-text">
          <p className="pb-off-title-line">{title}</p>
          <p className="pb-off-meta">
            <span className="pb-tnum">{formatDate(item.payload.date, locale)}</span>
            {' · '}{item.display.accountLabel}
            {' · '}{categoryLabel(d, item.payload.category)}
          </p>
        </div>
        {/* Money: font-mono-tab so privacy mode blurs it like every other figure. */}
        <span className={`pb-off-amount font-mono-tab ${isIncome ? 'in' : 'out'}`}>
          {isIncome ? '+' : ''}{formatCurrency(isIncome ? item.display.amount : -item.display.amount)}
        </span>
      </div>

      <div className="pb-off-row-foot">
        <span className={`pb-off-status pb-off-status-${state.status}`}>
          {state.status === 'uploading' ? <Spinner size={12} />
            : state.status === 'done' ? <Check size={13} aria-hidden="true" />
            : state.status === 'failed' ? <AlertTriangle size={13} aria-hidden="true" />
            : <Clock size={13} aria-hidden="true" />}
          {state.status === 'uploading' ? o.statusUploading
            : state.status === 'done' ? o.statusDone
            : state.status === 'failed' ? o.statusFailed
            : o.statusWaiting}
        </span>

        {state.status !== 'done' && !confirming && (
          <span className="pb-off-row-actions">
            {state.status === 'failed' && (
              <button type="button" className="pill pb-off-mini" onClick={onRetry} disabled={busy || q.offline}>
                <RefreshCw size={13} aria-hidden="true" />{o.retry}
              </button>
            )}
            <button type="button" className="pill pb-off-mini" onClick={onAskRemove} disabled={busy} aria-label={`${o.removeAria}: ${title}`}>
              {o.remove}
            </button>
          </span>
        )}
      </div>

      {state.status === 'failed' && state.reason && (
        // The server's reason, in the app's language. A refusal with no code
        // (an id the server would not accept) has no wording of its own.
        <p className="pb-off-reason">
          {state.code ? translateActionError(d, locale, { error: state.reason, code: state.code, params: state.params }) : o.failedGeneric}
        </p>
      )}

      {confirming && (
        <div className="pb-off-confirm" role="group" aria-label={o.removeConfirm}>
          <p>{o.removeConfirm}</p>
          <span className="pb-off-row-actions">
            <button type="button" className="pill pb-off-mini" onClick={onCancelRemove}>{o.removeKeep}</button>
            <button type="button" className="pill pb-off-mini pb-off-danger" onClick={onRemove}>{o.removeYes}</button>
          </span>
        </div>
      )}
    </li>
  );
}
