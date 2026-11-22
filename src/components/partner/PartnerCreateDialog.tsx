'use client';

import { useId, useRef, useState } from 'react';
import { ModalCloseButton } from '@/components/shared/ModalCloseButton';
import { ModalFrame } from '@/components/shared/ModalFrame';
import { callMutation } from '@/lib/actions/callAction';
import { createSharedRecordAction } from '@/lib/actions/partner';
import { categoryLabel } from '@/lib/i18n/enumLabels';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { makeClientId } from '@/lib/offline/clientId';
import type { PartnerCreation, PartnerWorkspaceData } from '@/lib/partner';
import { partnerError } from './partnerError';

const cents = (value: string) => /^\d{1,9}(\.\d{1,2})?$/.test(value) ? Math.round(Number(value) * 100) : 0;

export type PartnerEditor = { kind: PartnerCreation['kind']; id?: string; categoryId?: string; name?: string; nameCensored?: boolean; date?: string;
  amount?: number | null; accountKind?: 'bank' | 'cash' };

export function PartnerCreateDialog({ editor, data, onClose, onCreated }: {
  editor: PartnerEditor;
  data: PartnerWorkspaceData;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { kind } = editor;
  const { d } = useTranslation();
  const x = d.partner;
  const c = x.creation;
  const labelId = useId();
  const retry = useRef<{ fingerprint: string; id: string } | null>(null);
  const [type, setType] = useState<'expense' | 'income'>(data.entryCategories.length ? 'expense' : 'income');
  const [category, setCategory] = useState(editor.kind === 'budget' ? editor.id ?? editor.categoryId ?? '' : '');
  const [accountKind, setAccountKind] = useState<'bank' | 'cash'>(editor.accountKind ?? 'cash');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const categoryOptions = kind === 'budget' ? data.budgetCategories : type === 'expense'
    ? data.entryCategories : data.entryIncome.map(name => ({ id: name, name: categoryLabel(d, name) }));
  const ledger = kind === 'transaction' || kind === 'schedule';
  const showGross = ledger && type === 'income' && category === 'Standard Income';
  const requiresAmount = ledger || kind === 'budget' || kind === 'goal' && !editor.id;
  const title = kind === 'scheduleEdit' ? c.editSchedule : editor.id
    ? kind === 'goal' ? c.editGoal : kind === 'account' ? c.editAccount : c.editBudget
    : kind === 'account' ? c.newAccount : c[kind];

  const save = async (form: HTMLFormElement, complete: () => void) => {
    if (busy) return;
    const values = new FormData(form);
    const value = (key: string) => String(values.get(key) ?? '');
    const rawAmount = value('amount');
    const target = cents(rawAmount);
    const gross = showGross ? cents(value('gross')) : target;
    if (((requiresAmount || rawAmount) && !target) || gross < target) { setError(x.errors.invalid); return; }
    const fingerprint = JSON.stringify([kind, type, accountKind, Array.from(values.entries())]);
    const id = editor.id ?? (retry.current?.fingerprint === fingerprint ? retry.current.id
      : kind === 'transaction' ? makeClientId() : crypto.randomUUID());
    retry.current = { fingerprint, id };
    let entry: PartnerCreation;
    if (kind === 'budget') entry = { kind, categoryId: category, target, edit: !!editor.id };
    else if (kind === 'goal') entry = { kind, id, name: editor.nameCensored ? undefined : value('title'), date: value('date'), target: rawAmount ? target : undefined, edit: !!editor.id };
    else if (kind === 'account') entry = { kind, id, name: value('title'), accountKind, last4: value('last4'), edit: !!editor.id };
    else if (kind === 'scheduleEdit') entry = { kind, id, title: value('title') };
    else {
      const fields = { id, type, accountId: value('account'), categoryId: category,
        title: value('title'), date: value('date'), amount: target, gross, notes: value('notes') };
      entry = kind === 'schedule'
        ? { ...fields, kind, frequency: value('frequency') as Extract<PartnerCreation, { kind: 'schedule' }>['frequency'] }
        : { ...fields, kind };
    }
    setBusy(true);
    setError('');
    const result = await callMutation(createSharedRecordAction, entry);
    setBusy(false);
    if (!result.ok) { setError(partnerError(d, result)); return; }
    onCreated();
    complete();
  };

  return (
    <ModalFrame onClose={onClose} busy={busy} labelledBy={labelId}>
      {(close, complete) => <>
        <div className="pb-modal-head pb-partner-modal-head">
          <h2 id={labelId}>{title}</h2>
          <ModalCloseButton onClick={close} disabled={busy} />
        </div>
        <form className="pb-partner-record-form" onSubmit={event => { event.preventDefault(); void save(event.currentTarget, complete); }}>
          <div className="pb-modal-body pb-partner-record-fields">
            <p className="pb-partner-note">{c.ownerHint}</p>
            {ledger && <>
              <label>{c.type}<select className="pb-partner-input" value={type} disabled={busy} onChange={event => {
                setType(event.target.value === 'income' ? 'income' : 'expense');
                setCategory('');
              }}>
                {data.entryCategories.length > 0 && <option value="expense">{c.expense}</option>}
                {data.entryIncome.length > 0 && <option value="income">{c.income}</option>}
              </select></label>
              <label>{c.account}<select className="pb-partner-input" name="account" required disabled={busy}>
                <option value="">{c.choose}</option>
                {data.entryAccounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select></label>
            </>}
            {(ledger || kind === 'budget' && !editor.id) && <label>{c.category}<select className="pb-partner-input" name="category" value={category}
              required disabled={busy} onChange={event => setCategory(event.target.value)}>
              <option value="">{c.choose}</option>
              {categoryOptions.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
            </select></label>}
            {kind === 'budget' && editor.name && <p>{editor.name}</p>}
            {kind !== 'budget' && <label>{kind === 'goal' ? c.goalName : kind === 'account' ? c.accountName : x.transactionTitle}
              <input className="pb-partner-input" name="title" defaultValue={editor.name}
                maxLength={ledger || kind === 'scheduleEdit' ? 300 : kind === 'account' ? 40 : 80}
                required={!editor.nameCensored} disabled={busy} readOnly={editor.nameCensored} />
            </label>}
            {(ledger || kind === 'goal') && <label>{kind === 'goal' ? c.targetDate : x.transactionDate}
              <input type="date" className="pb-partner-input" name="date" defaultValue={editor.date} required disabled={busy} />
            </label>}
            {kind === 'account' && !editor.id && <>
              <label>{c.accountType}<select className="pb-partner-input" value={accountKind} disabled={busy}
                onChange={event => setAccountKind(event.target.value === 'bank' ? 'bank' : 'cash')}>
                <option value="cash">{x.cash}</option><option value="bank">{x.banking}</option>
              </select></label>
              {accountKind === 'bank' && <label>{c.last4}<input className="pb-partner-input" name="last4"
                inputMode="numeric" maxLength={4} pattern="[0-9]{4}" required disabled={busy} /></label>}
            </>}
            {kind === 'schedule' && <label>{c.frequency}<select className="pb-partner-input" name="frequency" defaultValue="monthly" disabled={busy}>
              {Object.entries(c.frequencies).map(([value, label]) =>
                <option key={value} value={value}>{label}</option>)}
            </select></label>}
            {showGross && <label>{c.gross}<input type="number" inputMode="decimal" name="gross" min=".01" step=".01"
              className="pb-partner-input" required disabled={busy} /></label>}
            {(ledger || kind === 'goal' || kind === 'budget') && <label>{kind === 'budget' ? c.annualAmount : kind === 'goal' ? c.goalTarget : showGross ? c.net : c.amount}
              <input type="number" inputMode="decimal" name="amount" min=".01" step=".01" className="pb-partner-input"
                defaultValue={editor.amount ?? undefined} required={requiresAmount} disabled={busy} />
            </label>}
            {kind === 'goal' && editor.id && editor.amount == null && <p className="pb-partner-note">{c.keepTarget}</p>}
            {ledger && <label>{x.transactionNotes}
              <textarea className="pb-partner-input" name="notes" maxLength={4000} disabled={busy} />
            </label>}
            {kind === 'budget' && !editor.id && <p className="pb-partner-note">{c.budgetHint}</p>}
            {kind === 'schedule' && <p className="pb-partner-note">{c.scheduleHint}</p>}
            {error && <p className="pb-partner-error" role="alert">{error}</p>}
          </div>
          <div className="pb-modal-foot pb-partner-modal-actions">
            <button type="button" className="pill" onClick={close} disabled={busy}>{x.cancel}</button>
            <button type="submit" className="pill active" disabled={busy}>{busy ? d.common.saving : x.apply}</button>
          </div>
        </form>
      </>}
    </ModalFrame>
  );
}
