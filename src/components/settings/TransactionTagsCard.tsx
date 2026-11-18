'use client';

import { useId, useMemo, useState } from 'react';
import { Pencil, Search, Tag } from 'lucide-react';
import { SectionHeader } from '@/components/kit/SectionHeader';
import { ActionError } from '@/components/shared/ActionError';
import { callAction } from '@/lib/actions/callAction';
import { renameTransactionTagAction } from '@/lib/actions/pebble';
import { translateActionError } from '@/lib/i18n/actionErrors';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { MAX_TAG_NAME_LENGTH, type TransactionTagGroup } from '@/lib/transactionTags';
import { SETTING_TARGETS } from './settingsTargets';

const PAGE_SIZE = 8;
const searchText = (text: string) => text.trim().normalize('NFKC').toLowerCase();

export function TransactionTagsCard({ tags }: { tags: TransactionTagGroup[] }) {
  const { d, t, locale } = useTranslation();
  const labels = d.ux.settings.tags;
  const inputId = useId();
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  const matches = useMemo(() => {
    const needle = searchText(query);
    return tags.filter(({ name }) => searchText(name).includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name, locale));
  }, [tags, query, locale]);
  const newName = draft.trim();
  const merging = tags.some(({ name }) => name === newName && name !== editing);
  const usage = (count: number) => count === 1 ? labels.oneTransaction : t(labels.transactions, { count: count.toLocaleString(locale) });

  const rename = async (source: string) => {
    if (busy || !newName || source === newName || newName.length > MAX_TAG_NAME_LENGTH) return;
    setBusy(true);
    setError(null);
    const result = await callAction(() => renameTransactionTagAction(source, newName));
    setBusy(false);
    if (!result.ok) {
      setError(translateActionError(d, locale, result));
      return;
    }
    setEditing(null);
    if (query && result.count) setQuery(newName);
    setStatus(result.count
      ? t(labels.renamed, { name: newName, usage: usage(result.count) })
      : labels.noLongerUsed);
  };

  return (
    <div id={SETTING_TARGETS.transactionTags} className="card pb-settings-tags">
      <SectionHeader title={labels.title} subtitle={labels.hint} icon={Tag} />
      {tags.length > 0 && (
        <label className="pb-settings-tag-search">
          <Search size={16} aria-hidden="true" />
          <input type="search" value={query} disabled={busy} placeholder={labels.search} aria-label={labels.search}
            onChange={(event) => {
              setQuery(event.target.value);
              setLimit(PAGE_SIZE);
              setEditing(null);
              setError(null);
            }} />
        </label>
      )}
      {matches.length > 0 && (
        <ul className="pb-settings-tag-list">
          {matches.slice(0, limit).map(({ name, count }) => (
            <li key={name} className="pb-settings-tag-item">
              <div className="pb-settings-tag-row">
                <div className="pb-settings-tag-label">
                  <bdi>{name}</bdi>
                  <span>{usage(count)}</span>
                </div>
                <button type="button" className="pill pb-settings-pill" disabled={busy}
                  aria-label={t(labels.renameTag, { name })} aria-expanded={editing === name}
                  aria-controls={editing === name ? `${inputId}-form` : undefined}
                  onClick={() => {
                    setEditing(editing === name ? null : name);
                    setDraft(name);
                    setError(null);
                    setStatus('');
                  }}>
                  <Pencil size={13} aria-hidden="true" />{labels.rename}
                </button>
              </div>
              {editing === name && (
                <form id={`${inputId}-form`} className="pb-settings-tag-editor" onSubmit={(event) => { event.preventDefault(); void rename(name); }}>
                  <label htmlFor={inputId}>{labels.newName}</label>
                  <input id={inputId} type="text" value={draft} required maxLength={MAX_TAG_NAME_LENGTH} disabled={busy}
                    onChange={(event) => setDraft(event.target.value)} />
                  <p className="pb-settings-quiet">{merging ? labels.mergeHint : t(labels.changeHint, { usage: usage(count) })}</p>
                  <ActionError message={error} />
                  <div className="pb-settings-tag-actions">
                    <button type="button" className="pill pb-settings-pill" disabled={busy} onClick={() => setEditing(null)}>{labels.cancel}</button>
                    <button type="submit" className="pill active pb-settings-pill" disabled={busy || !newName || newName === name}>
                      {busy ? labels.saving : labels.renameAll}
                    </button>
                  </div>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      {matches.length === 0 && <p className="pb-settings-quiet">{tags.length ? labels.noMatches : labels.empty}</p>}
      {matches.length > limit && (
        <button type="button" className="pill pb-settings-pill pb-settings-tag-more" onClick={() => setLimit(limit + PAGE_SIZE)}>
          {labels.showMore}
        </button>
      )}
      <div role="status" className="pb-settings-tag-status">{status}</div>
    </div>
  );
}
