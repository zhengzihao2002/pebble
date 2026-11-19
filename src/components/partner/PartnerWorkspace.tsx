'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Eye, Goal, ReceiptText, Wallet } from 'lucide-react';
import { SectionHeader } from '@/components/kit/SectionHeader';
import { LoadingBlock } from '@/components/shared/Spinner';
import { callAction } from '@/lib/actions/callAction';
import { changeSharedExpenseAction, leavePartnerViewAction, readPartnerWorkspaceAction } from '@/lib/actions/partner';
import { formatCurrency, formatDate } from '@/lib/format';
import { categoryLabel } from '@/lib/i18n/enumLabels';
import { useTranslation } from '@/lib/i18n/useTranslation';
import type { PartnerWorkspaceData, SharedTransaction } from '@/lib/partner';
import { MAX_TAG_NAME_LENGTH, normalizeTagSearch } from '@/lib/transactionTags';
import { PartnerDisconnectDialog } from './PartnerDisconnectDialog';
import { partnerError } from './partnerError';

export function PartnerWorkspace() {
  const { d, t } = useTranslation();
  const x = d.partner;
  const [data, setData] = useState<PartnerWorkspaceData | null>(null);
  const [error, setError] = useState<{ error: string; reason?: string } | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [disconnect, setDisconnect] = useState<{ name: string; pairId: string } | null>(null);

  useEffect(() => {
    let sequence = 0;
    let inFlight = false;
    const load = async () => {
      if (inFlight || document.visibilityState !== 'visible' || !navigator.onLine) return;
      inFlight = true;
      const attempt = ++sequence;
      const result = await callAction(readPartnerWorkspaceAction);
      if (sequence !== attempt) return;
      inFlight = false;
      if (result.ok) { setData(result.data); setError(null); }
      else { setData(null); setError(result); }
    };
    const hide = () => { sequence++; inFlight = false; setData(null); };
    const update = () => { if (document.visibilityState === 'visible') void load(); else hide(); };
    const offline = () => { hide(); setError({ error: 'offline', reason: 'offline' }); };
    if (navigator.onLine) void load(); else offline();
    window.addEventListener('online', load);
    window.addEventListener('offline', offline);
    window.addEventListener('pageshow', load);
    window.addEventListener('pagehide', hide);
    document.addEventListener('visibilitychange', update);
    const timer = window.setInterval(load, 15000);
    return () => {
      sequence++;
      clearInterval(timer);
      window.removeEventListener('online', load);
      window.removeEventListener('offline', offline);
      window.removeEventListener('pageshow', load);
      window.removeEventListener('pagehide', hide);
      document.removeEventListener('visibilitychange', update);
    };
  }, [refresh]);

  const exit = async () => {
    setLeaving(true);
    const result = await callAction(leavePartnerViewAction);
    if (result.ok) window.location.assign(new URL('/settings#settings-partner', window.location.origin));
    else { setLeaving(false); setData(null); setError(result); }
  };

  const total = data?.transactions.reduce((acc, row) => {
    acc[row.kind] += Math.round((row.amount ?? 0) * 100);
    return acc;
  }, { income: 0, expense: 0 });

  return (
    <div className="pb-partner-workspace">
      <header className="pb-partner-banner">
        <div className="pb-partner-banner-inner">
          <div className="pb-partner-identity">
            <span className="pb-partner-identity-icon"><Eye size={20} aria-hidden="true" /></span>
            <div>
              <p>{x.partnerSpace}</p>
              <h1>{data ? t(x.viewing, { name: data.name }) : x.title}</h1>
            </div>
          </div>
          <div className="pb-partner-actions">
            {data && <button type="button" className="pill" disabled={leaving} onClick={() => setDisconnect({ name: data.name, pairId: data.pairId })}>{x.unpair}</button>}
            <button className="pill" type="button" disabled={leaving} onClick={() => void exit()}><ArrowLeft size={16} aria-hidden="true" />{x.returnOwn}</button>
          </div>
        </div>
      </header>
      <main className="pb-partner-content">
        {error ? <section className="card pb-partner-card">
          <p role="alert">{error.reason === 'offline' ? d.ux.offline.needsConnection : partnerError(d, error)}</p>
          <button className="pill pb-partner-save" type="button" onClick={() => setRefresh(n => n + 1)}>{x.refresh}</button>
        </section> : !data ? <LoadingBlock /> : <>
          <section className="card pb-partner-card">
            <SectionHeader as="h2" title={x.visibleActivity} subtitle={x.viewHelp} />
            <div className="pb-partner-metrics">
              <span>{t(x.items, { count: data.transactions.length })}</span>
              {data.permissions.amounts && data.permissions.income && <div>
                <span>{x.income}</span><strong className="font-mono-tab">{formatCurrency((total?.income ?? 0) / 100)}</strong>
              </div>}
              {data.permissions.amounts && data.permissions.expenses && <div>
                <span>{x.spending}</span><strong className="font-mono-tab">{formatCurrency(Math.abs(total?.expense ?? 0) / 100)}</strong>
              </div>}
            </div>
          </section>
          {(data.permissions.expenses || data.permissions.income) && (
            <SharedTransactions rows={data.transactions} onChange={() => setRefresh(n => n + 1)} />
          )}
          {data.permissions.accounts && <section className="card pb-partner-card">
            <SectionHeader as="h2" icon={Wallet} title={x.accounts} />
            {data.accounts.length ? <ul className="pb-partner-list">{data.accounts.map((account, index) => <li className="pb-partner-list-row" key={index}>
              <bdi>{account.name}</bdi><span>{account.kind === 'credit' ? x.credit : account.kind === 'cash' ? x.cash : x.banking}</span>
            </li>)}</ul> : <p className="pb-partner-note">{x.noShared}</p>}
          </section>}
          {data.permissions.personalGoals && <section className="card pb-partner-card">
            <SectionHeader as="h2" icon={Goal} title={x.personalGoals} />
            {data.goals.length ? <ul className="pb-partner-list">{data.goals.map((goal, index) => <li className="pb-partner-list-row" key={index}>
              <bdi>{goal.name}</bdi>{goal.current !== null && goal.target !== null &&
                <span className="font-mono-tab">{formatCurrency(goal.current)} / {formatCurrency(goal.target)}</span>}
            </li>)}</ul> : <p className="pb-partner-note">{x.noShared}</p>}
          </section>}
          {!Object.values(data.permissions).some(Boolean) && <section className="card pb-partner-card"><p>{x.noShared}</p></section>}
        </>}
      </main>
      {disconnect && <PartnerDisconnectDialog name={disconnect.name} pairId={disconnect.pairId} onClose={() => setDisconnect(null)}
        onUnpaired={() => { setData(null); window.location.assign(new URL('/settings#settings-partner', window.location.origin)); }} />}
    </div>
  );
}

const LIST_SIZE = 25;

function SharedTransactions({ rows, onChange }: { rows: SharedTransaction[]; onChange: () => void }) {
  const { d, locale } = useTranslation();
  const x = d.partner;
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(LIST_SIZE);
  const [editing, setEditing] = useState<{ id: string; kind: 'tag' | 'delete' } | null>(null);
  const [tag, setTag] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const matches = useMemo(() => {
    const needle = normalizeTagSearch(query);
    return rows.filter(row => normalizeTagSearch([
      row.title, row.notes, categoryLabel(d, row.category), row.tag, row.date, formatDate(row.date, locale),
    ].join(' ')).includes(needle));
  }, [rows, query, d, locale]);

  const apply = async (id: string, kind: 'tag' | 'delete') => {
    setBusy(true);
    setError('');
    const result = await callAction(() => changeSharedExpenseAction(id, kind === 'tag' ? { kind, tag } : { kind }));
    setBusy(false);
    if (!result.ok) { setError(partnerError(d, result)); return; }
    setEditing(null);
    onChange();
  };

  return (
    <section className="card pb-partner-card">
      <SectionHeader as="h2" icon={ReceiptText} title={x.transactions} />
      <input type="search" className="pb-partner-input" value={query} placeholder={x.search} aria-label={x.search}
        onChange={event => { setQuery(event.target.value); setLimit(LIST_SIZE); }} />
      {matches.length === 0 && <p className="pb-partner-note">{x.noRows}</p>}
      <ul className="pb-partner-list">
        {matches.slice(0, limit).map(row => {
          const editingRow = editing?.id === row.id && editing.kind === 'tag' && row.canEditTag;
          const deletingRow = editing?.id === row.id && editing.kind === 'delete' && row.canDelete;
          return <li className="pb-partner-transaction" key={row.kind + row.id}>
            <div className="pb-partner-list-row">
              <div>
                <strong>{row.title || x.untitled}</strong>
                <p className="pb-partner-note">{[formatDate(row.date, locale), categoryLabel(d, row.category), row.tag].filter(Boolean).join(' · ')}</p>
              </div>
              {row.amount !== null && <span className="font-mono-tab">{formatCurrency(row.amount)}</span>}
            </div>
            {row.notes && <p className="pb-partner-note pb-partner-transaction-notes">{row.notes}</p>}
            {(row.canEditTag || row.canDelete) && !editingRow && !deletingRow && (
              <div className="pb-partner-actions">
                {row.canEditTag && <button type="button" className="link-btn" disabled={busy} onClick={() => { setTag(row.tag); setEditing({ id: row.id, kind: 'tag' }); setError(''); }}>{x.editTag}</button>}
                {row.canDelete && <button type="button" className="link-btn pb-settings-danger" disabled={busy} onClick={() => { setEditing({ id: row.id, kind: 'delete' }); setError(''); }}>{x.remove}</button>}
              </div>
            )}
            {editingRow && <form className="pb-partner-inline-edit" onSubmit={event => { event.preventDefault(); void apply(row.id, 'tag'); }}>
              <input type="text" className="pb-partner-input" aria-label={x.tag} placeholder={x.tag} maxLength={MAX_TAG_NAME_LENGTH}
                value={tag} onChange={event => setTag(event.target.value)} disabled={busy} />
              <p className="pb-partner-note">{x.tagHint}</p>
              <div className="pb-partner-actions">
                <button type="button" className="pill" disabled={busy} onClick={() => setEditing(null)}>{x.cancel}</button>
                <button type="submit" className="pill active" disabled={busy}>{x.apply}</button>
              </div>
            </form>}
            {deletingRow && <div className="pb-partner-inline-edit">
              <p>{x.removeHelp}</p>
              <div className="pb-partner-actions">
                <button type="button" className="pill" disabled={busy} onClick={() => setEditing(null)}>{x.cancel}</button>
                <button type="button" className="pill pb-settings-danger" disabled={busy} onClick={() => void apply(row.id, 'delete')}>{x.remove}</button>
              </div>
            </div>}
            {(editingRow || deletingRow) && error && <p className="pb-partner-error" role="alert">{error}</p>}
          </li>;
        })}
      </ul>
      {matches.length > limit && <button className="pill pb-partner-save" type="button" onClick={() => setLimit(n => n + LIST_SIZE)}>{x.showMore}</button>}
    </section>
  );
}
