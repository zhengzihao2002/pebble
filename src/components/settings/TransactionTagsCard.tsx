'use client';

import { useMemo, useState } from 'react';
import { ChevronRight, Search, Tag } from 'lucide-react';
import { SectionHeader } from '@/components/kit/SectionHeader';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { normalizeTagSearch, type TransactionTagGroup } from '@/lib/transactionTags';
import { SETTING_TARGETS } from './settingsTargets';
import { TransactionTagDialog } from './TransactionTagDialog';

const PAGE_SIZE = 8;

export function TransactionTagsCard({ tags }: { tags: TransactionTagGroup[] }) {
  const { d, t, locale } = useTranslation();
  const labels = d.ux.settings.tags;
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  const matches = useMemo(() => {
    const needle = normalizeTagSearch(query);
    return tags.filter(({ name }) => normalizeTagSearch(name).includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name, locale));
  }, [tags, query, locale]);
  const usage = (count: number) => count === 1 ? labels.oneTransaction : t(labels.transactions, { count: count.toLocaleString(locale) });

  return (
    <div id={SETTING_TARGETS.transactionTags} className="card pb-settings-tags">
      <SectionHeader title={labels.title} subtitle={labels.hint} icon={Tag} />
      {tags.length > 0 && (
        <label className="pb-settings-tag-search">
          <Search size={16} aria-hidden="true" />
          <input type="search" value={query} placeholder={labels.search} aria-label={labels.search}
            onChange={(event) => { setQuery(event.target.value); setLimit(PAGE_SIZE); }} />
        </label>
      )}
      {matches.length > 0 && (
        <ul className="pb-settings-tag-list">
          {matches.slice(0, limit).map(({ name, count }) => (
            <li key={name} className="pb-settings-tag-item">
              <button type="button" className="pb-settings-tag-row" aria-haspopup="dialog"
                aria-label={t(labels.reviewTag, { name, usage: usage(count) })}
                onClick={() => setActiveTag(name)}>
                <span className="pb-settings-tag-label">
                  <bdi>{name}</bdi>
                  <span>{usage(count)}</span>
                </span>
                <ChevronRight size={17} aria-hidden="true" />
              </button>
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
      {activeTag !== null && (
        <TransactionTagDialog name={activeTag} tags={tags} onClose={() => setActiveTag(null)}
          onRenamed={(name, count) => {
            if (query && count) setQuery(name);
            setStatus(count ? t(labels.renamed, { name, usage: usage(count) }) : labels.noLongerUsed);
          }}
          onCleared={count => setStatus(count ? t(labels.cleared, { usage: usage(count) }) : labels.selectionChanged)} />
      )}
    </div>
  );
}
