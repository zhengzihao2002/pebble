'use client';

import { useId, useState } from 'react';
import { ModalFrame } from '@/components/shared/ModalFrame';
import { ModalCloseButton } from '@/components/shared/ModalCloseButton';
import { callAction } from '@/lib/actions/callAction';
import { changeSharedTransactionAction } from '@/lib/actions/partner';
import { formatCurrency, formatDate } from '@/lib/format';
import { categoryLabel } from '@/lib/i18n/enumLabels';
import { useTranslation } from '@/lib/i18n/useTranslation';
import type { SharedTransaction, SharedTransactionChange } from '@/lib/partner';
import { MAX_TAG_NAME_LENGTH } from '@/lib/transactionTags';
import { partnerError } from './partnerError';

export function PartnerTransactionDetail({ row, onClose, onSaved }: {
  row: SharedTransaction;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { d, locale } = useTranslation();
  const x = d.partner;
  const labelId = useId();
  const [mode, setMode] = useState<'edit' | 'tag' | null>(null);
  const [replaceNotes, setReplaceNotes] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const title = row.hidden ? x.hiddenTransaction : row.title || x.untitled;
  const save = async (form: HTMLFormElement, complete: () => void) => {
    const input = new FormData(form);
    const field = (name: string) => String(input.get(name) ?? '');
    const notes = input.has('notes') && (replaceNotes || field('notes') !== (row.notes ?? '')) ? field('notes') : undefined;
    const change: SharedTransactionChange = mode === 'tag'
      ? { kind: 'tag', tag: field('tag') }
      : { kind: 'edit', title: field('title'), date: field('date'), notes };
    setPending(true);
    setError('');
    const result = await callAction(() => changeSharedTransactionAction(row.id, row.kind, change));
    setPending(false);
    if (result.ok) { onSaved(); complete(); }
    else setError(partnerError(d, result));
  };
  return <ModalFrame onClose={onClose} labelledBy={labelId} busy={pending}>
    {(close, complete) => <>
      <div className="pb-modal-head pb-partner-modal-head">
        <h2 id={labelId}>{title}</h2><ModalCloseButton onClick={close} disabled={pending} />
      </div>
      {mode ? <form className="pb-partner-record-form" onSubmit={event => { event.preventDefault(); void save(event.currentTarget, complete); }}>
        <div className="pb-modal-body pb-partner-record-fields">
          {mode === 'tag' ? <label>{x.tag}<input className="pb-partner-input" name="tag" defaultValue={row.tag} maxLength={MAX_TAG_NAME_LENGTH} /></label>
            : <>
              <label>{x.transactionTitle}<input className="pb-partner-input" name="title" required maxLength={300} defaultValue={row.title} /></label>
              <label>{x.transactionDate}<input className="pb-partner-input" name="date" type="date" required defaultValue={row.date} /></label>
              {!row.notesVisible && <label className="pb-partner-check"><input type="checkbox" checked={replaceNotes} onChange={e => setReplaceNotes(e.target.checked)} />{x.replaceHiddenNotes}</label>}
              {replaceNotes && <p className="pb-partner-note">{x.replaceHiddenNotesHint}</p>}
              {(row.notesVisible || replaceNotes) && <label>{x.transactionNotes}<textarea className="pb-partner-input" name="notes" maxLength={4000} defaultValue={row.notes ?? ''} /></label>}
            </>}
          {error && <p className="pb-partner-error" role="alert">{error}</p>}
        </div>
        <div className="pb-modal-foot pb-partner-modal-actions">
          <button type="button" className="pill" disabled={pending} onClick={() => { setMode(null); setReplaceNotes(false); setError(''); }}>{x.cancel}</button>
          <button type="submit" className="pill active" disabled={pending}>{x.apply}</button>
        </div>
      </form> : <>
        <div className="pb-modal-body pb-partner-record-fields">
          <p className="font-display pb-money pb-tdlg-amount">{row.amount === null ? x.censored : formatCurrency(row.amount)}</p>
          <p className="pb-partner-note">{[formatDate(row.date, locale), row.accountName, categoryLabel(d, row.category), row.tag].filter(Boolean).join(' · ')}</p>
          {row.notes && <p className="pb-partner-transaction-notes">{row.notes}</p>}
        </div>
        {(row.canEdit || row.canEditTag) && <div className="pb-modal-foot pb-partner-modal-actions">
          {row.canEditTag && <button type="button" className="pill" onClick={() => setMode('tag')}>{x.editTag}</button>}
          {row.canEdit && <button type="button" className="pill active" onClick={() => setMode('edit')}>{x.editTransaction}</button>}
        </div>}
      </>}
    </>}
  </ModalFrame>;
}
