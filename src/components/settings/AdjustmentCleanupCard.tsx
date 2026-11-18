'use client';

import { useId, useState } from 'react';
import { Layers, ChevronRight } from 'lucide-react';
import type { Account } from '@/lib/data/mappers';
import { formatCurrency, formatLongDate } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { adjustmentCleanupGroup, MAX_CLEANUP_DESCRIPTION, MAX_CLEANUP_ROWS, type AdjustmentCleanupGroup, type CleanupSource } from '@/lib/adjustmentCleanup';
import { applyAdjustmentCleanupAction } from '@/lib/actions/pebble';
import { callAction } from '@/lib/actions/callAction';
import { translateActionError } from '@/lib/i18n/actionErrors';
import { ModalFrame } from '@/components/shared/ModalFrame';
import { ModalCloseButton } from '@/components/shared/ModalCloseButton';
import { SelectField } from '@/components/shared/SelectField';
import { ghostAccountLabel } from '@/components/shared/GhostAccountChoice';
import { useSafetyLock } from '@/lib/useSafetyLock';
import { SETTING_TARGETS } from './settingsTargets';

export function AdjustmentCleanupCard({ groups, sources, accounts }: {
  groups: AdjustmentCleanupGroup[];
  sources: (CleanupSource & { accountId: string })[];
  accounts: Account[];
}) {
  const { d, t, locale } = useTranslation();
  const x = d.ux.settings.adjustmentCleanup;
  const locked = useSafetyLock('deleteTransactions');
  const titleId = useId();
  const [reviewGroups, setReviewGroups] = useState<AdjustmentCleanupGroup[] | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualGroup, setManualGroup] = useState<AdjustmentCleanupGroup>();
  const [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastRemoved, setLastRemoved] = useState(0);
  const [applied, setApplied] = useState<string[]>([]);
  const available = groups.filter(group => group.rows.every(row => !applied.includes(row.id)));
  const group = manualGroup ?? reviewGroups?.find(item => item.id === selectedId);
  const manualSources = sources.filter(row => !applied.includes(row.id));
  const manualAccounts = accounts.filter(account => manualSources.filter(row => row.accountId === account.id).length >= 2);
  const nameOf = (id: string) => {
    const account = accounts.find(item => item.id === id);
    if (!account) return '';
    return ghostAccountLabel(account.last4 ? `${account.name} ····${account.last4}` : account.name, account.isGhost, locale);
  };

  return (
    <section className="card pb-set-cleanup" id={SETTING_TARGETS.adjustmentCleanup}>
      <div className="pb-set-cleanup-header">
        <span className="pb-set-cleanup-icon"><Layers size={18} aria-hidden="true" /></span>
        <div>
          <h3 className="font-display">{x.title}</h3>
          <p>{x.hint}</p>
        </div>
        {available.length > 0 && (
          <button className="pill" type="button" onClick={() => { setSelectedId(available[0].id); setReviewGroups(available); }}>
            {x.review}<ChevronRight size={14} aria-hidden="true" />
          </button>
        )}
      </div>
      {manualAccounts.length > 0 && (
        <button type="button" className="link-btn pb-set-cleanup-manual" onClick={() => setManualOpen(true)}>
          {x.chooseManually}
        </button>
      )}
      <p className="pb-set-cleanup-status" role="status">
        {lastRemoved > 0 && t(x.removed, { count: lastRemoved })}{lastRemoved > 0 && ' '}
        {available.length > 0 ? t(available.length === 1 ? x.oneGroup : x.groups, { count: available.length }) : x.noGroups}
      </p>
      {(manualOpen || reviewGroups) && (
        <ModalFrame onClose={() => { setReviewGroups(null); setManualOpen(false); setManualGroup(undefined); }} busy={busy} labelledBy={titleId} maxWidth={680}>
          {(close, complete) => <>
            <div className="pb-modal-head pb-set-cleanup-dialog-head">
              <h2 id={titleId} className="font-display">{x.reviewTitle}</h2>
              <ModalCloseButton onClick={close} disabled={busy} />
            </div>
            {group ? <CleanupReview key={group.id} group={group} accountName={nameOf(group.accountId)} locked={locked} manual={manualOpen}
                busy={busy} onBusy={setBusy} onClose={close}
                onApplied={count => {
                  const ids = group.rows.filter(row => group.total === 0 || row.id !== group.id).map(row => row.id);
                  setApplied(previous => [...previous, ...ids]);
                  setLastRemoved(count);
                  complete();
                }}>
                {reviewGroups && reviewGroups.length > 1 && (
                  <SelectField value={group.id} onChange={setSelectedId} ariaLabel={x.groupLabel} disabled={busy}
                    options={reviewGroups.map(item => ({
                      value: item.id, label: `${nameOf(item.accountId)} · ${formatLongDate(item.date, locale)}`,
                    }))} />
                )}
            </CleanupReview> : (
              <CleanupPicker sources={manualSources} accounts={manualAccounts} nameOf={nameOf}
                onClose={close} onReview={setManualGroup} />
            )}
          </>}
        </ModalFrame>
      )}
    </section>
  );
}

function CleanupPicker({ sources, accounts, nameOf, onClose, onReview }: {
  sources: (CleanupSource & { accountId: string })[];
  accounts: Account[];
  nameOf: (id: string) => string;
  onClose: () => void;
  onReview: (group: AdjustmentCleanupGroup) => void;
}) {
  const { d, locale } = useTranslation();
  const x = d.ux.settings.adjustmentCleanup;
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [selected, setSelected] = useState<string[]>([]);
  const rows = sources.filter(row => row.accountId === accountId);
  const group = adjustmentCleanupGroup(accountId, rows.filter(row => selected.includes(row.id)));

  return (
    <>
      <div className="pb-modal-body themed-scroll pb-set-cleanup-body">
        <p className="pb-set-cleanup-history">{x.pickHint}</p>
        <SelectField value={accountId} onChange={id => { setAccountId(id); setSelected([]); }} ariaLabel={d.txnDetail.rowAccount}
          options={accounts.map(account => ({ value: account.id, label: nameOf(account.id) }))} />
        <ul className="pb-set-cleanup-rows">
          {rows.map(row => <li key={row.id}>
            <label className="pb-set-cleanup-pick">
              <input type="checkbox" checked={selected.includes(row.id)}
                disabled={!selected.includes(row.id) && selected.length >= MAX_CLEANUP_ROWS}
                onChange={event => setSelected(event.target.checked ? [...selected, row.id] : selected.filter(id => id !== row.id))} />
              <span>{row.description || x.noDescription}<small>{formatLongDate(row.date, locale)}</small></span>
            </label>
            <span className="font-mono-tab">{formatCurrency(row.amount)}</span>
          </li>)}
        </ul>
        {!group && selected.length >= 2 && <p className="pb-set-cleanup-history">{x.amountTooLarge}</p>}
      </div>
      <div className="pb-modal-foot">
        <button type="button" className="pill" onClick={onClose}>{d.accounts.cancel}</button>
        <button type="button" className="btn-primary" disabled={!group} onClick={() => { if (group) onReview(group); }}>{x.reviewSelection}</button>
      </div>
    </>
  );
}

function CleanupReview({ group, accountName, locked, manual, busy, onBusy, onClose, onApplied, children }: {
  group: AdjustmentCleanupGroup; accountName: string; locked: boolean; busy: boolean;
  manual: boolean;
  onBusy: (busy: boolean) => void; onClose: () => void; onApplied: (count: number) => void;
  children: React.ReactNode;
}) {
  const { d, t, locale } = useTranslation();
  const x = d.ux.settings.adjustmentCleanup;
  const [description, setDescription] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const removesAll = group.total === 0;
  const count = removesAll ? group.rows.length : group.rows.length - 1;
  const canApply = !busy && !locked && confirmed && (removesAll || description.trim().length > 0);

  const submit = async () => {
    if (!canApply) return;
    onBusy(true);
    setError('');
    const result = await callAction(() => applyAdjustmentCleanupAction({
      accountId: group.accountId, retainedId: group.id, sources: group.rows, description, confirmed, manual,
    }));
    onBusy(false);
    if (result.ok) onApplied(result.removed);
    else setError(translateActionError(d, locale, result));
  };
  const signed = (amount: number) => `${amount > 0 ? '+' : ''}${formatCurrency(amount)}`;

  return (
    <>
      <div className="pb-modal-body themed-scroll pb-set-cleanup-body">
        {children}
        <p className="pb-set-cleanup-account">{accountName}</p>
        <div className="pb-set-cleanup-preview">
          <div>
            <h3>{x.originals}</h3>
            <ul className="pb-set-cleanup-rows">
              {group.rows.map(row => <li key={row.id}>
                <span>{row.description || x.noDescription}<small>{formatLongDate(row.date, locale)}</small></span>
                <span className="font-mono-tab">{signed(row.amount)}</span>
              </li>)}
            </ul>
          </div>
          <div className="pb-set-cleanup-result">
            <h3>{removesAll ? x.cancelOut : x.combined}</h3>
            <strong className="font-mono-tab">{signed(group.total)}</strong>
            {!removesAll && <>
              <small>{formatLongDate(group.date, locale)}</small>
              <label>
                <span>{x.description}</span>
                <input value={description} onChange={event => setDescription(event.target.value)}
                  maxLength={MAX_CLEANUP_DESCRIPTION} disabled={busy} required />
              </label>
            </>}
            <p>{t(x.willRemove, { count })}</p>
          </div>
        </div>
        <p className="pb-set-cleanup-history">{x.history}</p>
        {locked ? <p className="pb-set-cleanup-history">{d.safetyLocks.deleteTransactions}</p> : (
          <label className="pb-set-cleanup-agree">
            <input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />
            {removesAll ? x.agreeRemove : x.agreeCombine}
          </label>
        )}
        {error && <p role="alert" className="pb-set-cleanup-error">{error}</p>}
      </div>
      <div className="pb-modal-foot">
        <button type="button" className="pill" onClick={onClose} disabled={busy}>{d.accounts.cancel}</button>
        <button type="button" className="btn-primary" onClick={() => void submit()} disabled={!canApply}>
          {busy ? d.common.saving : removesAll ? x.remove : x.combine}
        </button>
      </div>
    </>
  );
}
