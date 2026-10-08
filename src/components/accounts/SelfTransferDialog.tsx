'use client';

import { useState } from 'react';
import { LoadingOverlay } from '@/components/shared/Spinner';
import { ModalFrame } from '@/components/shared/ModalFrame';
import { ModalCloseButton } from '@/components/shared/ModalCloseButton';
import { SaveSuccess } from '@/components/shared/SaveSuccess';
import { ActionError } from '@/components/shared/ActionError';
import { deleteSelfTransfersAction } from '@/lib/actions/pebble';
import { callAction } from '@/lib/actions/callAction';
import type { FailureKind } from '@/lib/actions/failureKind';
import type { Account } from '@/lib/data/mappers';
import { formatCurrency, formatDate } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { translateActionError } from '@/lib/i18n/actionErrors';

export interface SelfTransferPair {
  groupId: string;
  accountId: string;
  date: string;
  description: string;
  /** The size of each half (one is -amount, the other +amount). */
  amount: number;
}

/**
 * Reviews and removes transfers whose two halves sit on one account. Shows
 * each affected account's balance before and after - equal, because each
 * pair cancels out - so the user can see nothing changes.
 */
export function SelfTransferDialog({ pairs, accounts, balances, onClose }: {
  pairs: SelfTransferPair[];
  accounts: Account[];
  /** accountId -> balance today, from the page's own data. */
  balances: Record<string, number>;
  onClose: () => void;
}) {
  const { d, t, locale } = useTranslation();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(pairs.map((p) => p.groupId)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<FailureKind | undefined>(undefined);
  const [done, setDone] = useState(false);

  const nameOf = (id: string) => {
    const a = accounts.find((x) => x.id === id);
    return a ? (a.last4 ? `${a.name} ····${a.last4}` : a.name) : '—';
  };
  const picked = pairs.filter((p) => selected.has(p.groupId));
  const affected = [...new Set(picked.map((p) => p.accountId))];
  // Each pair is -amount and +amount on one account: removing it changes that
  // account by their sum, which is zero.
  const changeFor = (id: string) => picked.filter((p) => p.accountId === id).reduce((s, p) => s + (p.amount - p.amount), 0);

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const handleDelete = async () => {
    if (busy || picked.length === 0 || done) return;
    setBusy(true);
    setError(null);
    const result = await callAction(() => deleteSelfTransfersAction({ groupIds: picked.map((p) => p.groupId) }));
    setBusy(false);
    if (!result.ok) { setError(translateActionError(d, locale, result)); setErrorKind(result.kind); return; }
    setDone(true);
  };

  return (
    <ModalFrame onClose={onClose} busy={busy} labelledBy="self-transfer-title" maxWidth={540} zIndex={60}>
      {(close) => (
      <>
        {busy && <LoadingOverlay label={d.accountsPage.selfDeleting} />}

        <div className="pb-modal-head">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
            <h2 id="self-transfer-title" className="font-display" style={{ flex: 1, minWidth: 0, fontSize: '1.2rem', fontWeight: 600 }}>
              {d.accountsPage.selfTitle}
            </h2>
            <ModalCloseButton onClick={close} disabled={busy} />
          </div>
        </div>

        <div className="pb-modal-body themed-scroll">
          {done ? (
            <SaveSuccess title={d.accountsPage.selfDone} body={d.accountsPage.selfDoneBody} onDone={close} />
          ) : (
            <>
              <p style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', lineHeight: 1.5, margin: '0 0 0.9rem' }}>{d.accountsPage.selfIntro}</p>

              <div>
                {pairs.map((p) => (
                  <label key={p.groupId} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.6rem 0', borderBottom: '1px solid var(--line)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={selected.has(p.groupId)} onChange={() => toggle(p.groupId)} style={{ flexShrink: 0 }} />
                    <span style={{ minWidth: 0, flex: 1 }}>
                      {/* Descriptions and account names are USER DATA. */}
                      <span style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.description || nameOf(p.accountId)}
                      </span>
                      <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--ink-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {formatDate(p.date, locale)} · {nameOf(p.accountId)}
                      </span>
                    </span>
                    <span className="font-mono-tab" style={{ fontSize: '0.82rem', whiteSpace: 'nowrap', color: 'var(--ink-soft)' }}>
                      −{formatCurrency(p.amount)} / +{formatCurrency(p.amount)}
                    </span>
                  </label>
                ))}
              </div>

              {affected.length > 0 && (
                <div style={{ marginTop: '1.1rem' }}>
                  <p style={{ fontSize: '0.8rem', fontWeight: 600, margin: '0 0 0.4rem' }}>{d.accountsPage.selfBalances}</p>
                  {affected.map((id) => {
                    const before = balances[id] ?? 0;
                    const after = before - changeFor(id);
                    return (
                      <div key={id} style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', padding: '0.35rem 0', fontSize: '0.82rem' }}>
                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nameOf(id)}</span>
                        <span className="font-mono-tab" style={{ whiteSpace: 'nowrap', color: 'var(--ink-soft)' }}>
                          {d.accountsPage.selfBefore} {formatCurrency(before)} → {d.accountsPage.selfAfter} <strong style={{ color: 'var(--ink)' }}>{formatCurrency(after)}</strong>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {!done && (
          <div className="pb-modal-foot">
            <ActionError message={error} kind={errorKind} onRetry={handleDelete} busy={busy} />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" onClick={close} disabled={busy} className="pill" style={{ flex: 1, padding: '0.65rem' }}>
                {d.accounts.cancel}
              </button>
              <button
                type="button" onClick={handleDelete} disabled={busy || picked.length === 0} className="btn-primary"
                style={{ flex: 1, padding: '0.65rem', opacity: busy || picked.length === 0 ? 0.6 : 1 }}
              >
                {picked.length === 1 ? d.accountsPage.selfDeleteOne : t(d.accountsPage.selfDelete, { count: picked.length })}
              </button>
            </div>
          </div>
        )}
      </>
      )}
    </ModalFrame>
  );
}
