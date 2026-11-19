'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { ActionError } from '@/components/shared/ActionError';
import { ModalCloseButton } from '@/components/shared/ModalCloseButton';
import { ModalFrame } from '@/components/shared/ModalFrame';
import { LoadingBlock } from '@/components/shared/Spinner';
import { callAction } from '@/lib/actions/callAction';
import type { FailureKind } from '@/lib/actions/failureKind';
import { clearTransactionTagsAction, loadTaggedTransactionsAction, renameTransactionTagAction } from '@/lib/actions/pebble';
import { formatCurrency, formatDate } from '@/lib/format';
import { translateActionError } from '@/lib/i18n/actionErrors';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { descriptionTitle } from '@/lib/transactionDescription';
import { MAX_TAG_NAME_LENGTH, normalizeTagSearch, type TaggedTransaction, type TransactionTagGroup } from '@/lib/transactionTags';

const PAGE_SIZE = 40;
type TagFailure = { error: string; kind?: FailureKind; code?: string; params?: Record<string, string | string[]> };

interface Props {
  name: string;
  tags: TransactionTagGroup[];
  onClose: () => void;
  onRenamed: (name: string, count: number) => void;
  onCleared: (count: number) => void;
}

export function TransactionTagDialog({ name, tags, onClose, onRenamed, onCleared }: Props) {
  const { d, t, locale } = useTranslation();
  const labels = d.ux.settings.tags;
  const titleId = useId();
  const [rows, setRows] = useState<TaggedTransaction[] | null>(null);
  const [loadError, setLoadError] = useState<TagFailure | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [mode, setMode] = useState<'review' | 'rename' | 'clear'>('review');
  const [draft, setDraft] = useState(name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TagFailure | null>(null);
  const [clearedCount, setClearedCount] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    void callAction(() => loadTaggedTransactionsAction(name)).then(result => {
      if (!active) return;
      if (result.ok) setRows(result.rows);
      else setLoadError(result);
    });
    return () => { active = false; };
  }, [name, refresh]);

  const matches = useMemo(() => {
    const needle = normalizeTagSearch(query);
    return (rows ?? []).filter(row => !needle || normalizeTagSearch([
      row.description, row.category, row.accountName, row.date, formatDate(row.date, locale),
    ].join(' ')).includes(needle));
  }, [rows, query, locale]);

  const usage = (count: number) => count === 1 ? labels.oneTransaction : t(labels.transactions, { count: count.toLocaleString(locale) });
  const newName = draft.trim();
  const merging = tags.some(tag => tag.name !== name && tag.name === newName);
  const allMatched = matches.length > 0 && matches.every(row => selected.has(row.id));
  const setEditor = (next: typeof mode) => { setMode(next); setError(null); };
  const toggleRow = (id: string) => {
    setSelected(previous => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleMatches = () => {
    setSelected(previous => {
      const next = new Set(previous);
      for (const { id } of matches) {
        if (allMatched) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  };

  const rename = async (complete: () => void) => {
    if (busy || !newName || name === newName || newName.length > MAX_TAG_NAME_LENGTH) return;
    setBusy(true);
    setError(null);
    const result = await callAction(() => renameTransactionTagAction(name, newName));
    setBusy(false);
    if (!result.ok) { setError(result); return; }
    onRenamed(newName, result.count);
    complete();
  };

  const clear = async (complete: () => void) => {
    if (busy || selected.size === 0 || !rows) return;
    setBusy(true);
    setError(null);
    const result = await callAction(() => clearTransactionTagsAction(name, [...selected]));
    setBusy(false);
    if (!result.ok) { setError(result); return; }
    const remaining = rows.filter(row => !selected.has(row.id));
    setRows(remaining);
    setSelected(new Set());
    setClearedCount(result.count);
    setEditor('review');
    onCleared(result.count);
    if (!remaining.length) complete();
  };

  return (
    <ModalFrame onClose={onClose} busy={busy} labelledBy={titleId} maxWidth={660} cardClassName="pb-tag-dialog">
      {(close, complete) => <>
        <div className="pb-modal-head pb-tag-dialog-head">
          <div>
            <h2 id={titleId} className="font-display"><bdi>{name}</bdi></h2>
            {rows && <p className="pb-settings-quiet">{usage(rows.length)}</p>}
          </div>
          <ModalCloseButton onClick={close} disabled={busy} />
        </div>

        {rows && rows.length > 0 && (
          <div className="pb-tag-dialog-toolbar">
            <label className="pb-settings-tag-search">
              <Search size={16} aria-hidden="true" />
              <input type="search" value={query} placeholder={labels.searchTransactions} aria-label={labels.searchTransactions}
                disabled={busy || mode !== 'review'}
                onChange={event => { setQuery(event.target.value); setLimit(PAGE_SIZE); }} />
            </label>
            {matches.length > 0 && <button type="button" className="link-btn pb-tag-dialog-select"
              disabled={busy || mode !== 'review'} onClick={toggleMatches}>
              {allMatched ? labels.deselectMatches : t(labels.selectMatches, { usage: usage(matches.length) })}
            </button>}
          </div>
        )}

        <div className="pb-modal-body themed-scroll pb-tag-dialog-body">
          {!rows && (loadError ? (
            <ActionError message={translateActionError(d, locale, loadError)} kind={loadError.kind}
              onRetry={() => { setLoadError(null); setRefresh(n => n + 1); }} />
          ) : <LoadingBlock />)}
          {rows && matches.length === 0 && <p className="pb-settings-quiet">{rows.length ? labels.noMatchingTransactions : labels.noLongerUsed}</p>}
          {matches.length > 0 && (
            <ul className="pb-tag-dialog-transactions">
              {matches.slice(0, limit).map(row => (
                <li key={row.id}>
                  <label className="pb-tag-dialog-row">
                    <input type="checkbox" checked={selected.has(row.id)} disabled={busy || mode !== 'review'} onChange={() => toggleRow(row.id)} />
                    <span className="pb-tag-dialog-row-text">
                      <strong>{descriptionTitle(row.description) || row.category || labels.transaction}</strong>
                      <span>{[formatDate(row.date, locale), row.category, row.accountName].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className="font-mono-tab pb-tag-dialog-amount">{formatCurrency(row.amount)}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {matches.length > limit && <button type="button" className="pill pb-settings-pill" onClick={() => setLimit(n => n + PAGE_SIZE)}>{labels.showMoreTransactions}</button>}
        </div>

        {rows && rows.length > 0 && <div className="pb-modal-foot pb-tag-dialog-foot">
          <div role="status" className="pb-settings-tag-status">
            {clearedCount !== null && (clearedCount ? t(labels.cleared, { usage: usage(clearedCount) }) : labels.selectionChanged)}
          </div>
          {mode === 'review' && (
            <div className="pb-tag-dialog-review">
              <div className="pb-tag-dialog-selection">
                <span>{t(labels.selected, { count: selected.size.toLocaleString(locale) })}</span>
                {selected.size > 0 && <button type="button" className="link-btn" onClick={() => setSelected(new Set())}>{labels.resetSelection}</button>}
              </div>
              <div className="pb-settings-tag-actions">
                <button type="button" className="pill pb-settings-pill" onClick={() => setEditor('rename')}>{labels.rename}</button>
                <button type="button" className="pill pb-settings-pill pb-settings-danger" disabled={!selected.size} onClick={() => setEditor('clear')}>{labels.clearTag}</button>
              </div>
            </div>
          )}
          {mode === 'rename' && (
            <form className="pb-settings-tag-editor" onSubmit={event => { event.preventDefault(); void rename(complete); }}>
              <label htmlFor={`${titleId}-name`}>{labels.newName}</label>
              <input id={`${titleId}-name`} type="text" value={draft} required maxLength={MAX_TAG_NAME_LENGTH}
                disabled={busy} onChange={event => setDraft(event.target.value)} />
              <p className="pb-settings-quiet">{t(labels.changeHint, { usage: usage(rows.length) })} {merging && labels.mergeHint}</p>
              <ActionError message={error ? translateActionError(d, locale, error) : null} />
              <div className="pb-settings-tag-actions">
                <button type="button" className="pill pb-settings-pill" disabled={busy} onClick={() => setEditor('review')}>{labels.cancel}</button>
                <button type="submit" className="pill active pb-settings-pill" disabled={busy || !newName || newName === name}>
                  {busy ? labels.saving : labels.renameAll}
                </button>
              </div>
            </form>
          )}
          {mode === 'clear' && (
            <div className="pb-settings-tag-editor">
              <p className="pb-settings-quiet">{t(labels.clearHint, { usage: usage(selected.size) })}</p>
              <ActionError message={error ? translateActionError(d, locale, error) : null} />
              <div className="pb-settings-tag-actions">
                <button type="button" className="pill pb-settings-pill" disabled={busy} onClick={() => setEditor('review')}>{labels.cancel}</button>
                <button type="button" className="pill pb-settings-pill pb-settings-danger" disabled={busy} onClick={() => void clear(complete)}>
                  {busy ? labels.clearing : labels.confirmClear}
                </button>
              </div>
            </div>
          )}
        </div>}
      </>}
    </ModalFrame>
  );
}
