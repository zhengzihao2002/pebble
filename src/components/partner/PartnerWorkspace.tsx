'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Eye, Goal, ReceiptText, Wallet } from 'lucide-react';
import { SectionHeader } from '@/components/kit/SectionHeader';
import { LoadingBlock } from '@/components/shared/Spinner';
import { callAction } from '@/lib/actions/callAction';
import { changeSharedTransactionAction, leavePartnerViewAction, readPartnerWorkspaceAction } from '@/lib/actions/partner';
import { formatCurrency, formatDate } from '@/lib/format';
import { categoryLabel } from '@/lib/i18n/enumLabels';
import { useTranslation } from '@/lib/i18n/useTranslation';
import type { PartnerWorkspaceData, SharedTransaction, SharedTransactionChange } from '@/lib/partner';
import { MAX_TAG_NAME_LENGTH, normalizeTagSearch } from '@/lib/transactionTags';
import { PartnerCreateDialog, type PartnerEditor } from './PartnerCreateDialog';
import { PartnerDisconnectDialog } from './PartnerDisconnectDialog';
import { partnerError } from './partnerError';

export function PartnerWorkspace() {
  const { d, t } = useTranslation();
  const x = d.partner;
  const [data, setData] = useState<PartnerWorkspaceData | null>(null);
  const [error, setError] = useState<{ error: string; reason?: string } | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [creating, setCreating] = useState<PartnerEditor | null>(null);
  const [created, setCreated] = useState(false);
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
    const hide = () => { sequence++; inFlight = false; setData(null); setCreating(null); };
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

  const refreshWorkspace = () => setRefresh(n => n + 1);
  const canViewTransactions = !!(data?.permissions.expenses || data?.permissions.income);
  const hasEntryChoices = !!(data?.entryAccounts.length && (data.entryCategories.length || data.entryIncome.length));

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
            <div className="pb-partner-note" role="status">{created ? x.creation.created : ''}</div>
            <div className="pb-partner-metrics">
              {canViewTransactions && <span>{t(x.items, { count: data.transactions.length })}</span>}
              {data.permissions.amounts && data.permissions.income && <div>
                <span>{x.income}</span><strong className="font-mono-tab">{formatCurrency((total?.income ?? 0) / 100)}</strong>
              </div>}
              {data.permissions.amounts && data.permissions.expenses && <div>
                <span>{x.spending}</span><strong className="font-mono-tab">{formatCurrency(Math.abs(total?.expense ?? 0) / 100)}</strong>
              </div>}
            </div>
          </section>
          {(canViewTransactions || data.permissions.addTransactions) && (
            <SharedTransactions rows={data.transactions} onChange={refreshWorkspace}
              canView={canViewTransactions} canAdd={data.permissions.addTransactions === true} hasEntryChoices={hasEntryChoices}
              onAdd={() => setCreating({ kind: 'transaction' })} />
          )}
          {(data.permissions.accounts || data.permissions.addAccounts) && <section className="card pb-partner-card">
            <SectionHeader as="h2" icon={Wallet} title={x.accounts}
              actions={data.permissions.addAccounts && <button type="button" className="pill" onClick={() => setCreating({ kind: 'account' })}>{x.creation.newAccount}</button>} />
            {data.permissions.accounts && (data.accounts.length ? <ul className="pb-partner-list">{data.accounts.map(account => <li className="pb-partner-list-row" key={account.id}>
              <bdi>{account.name}</bdi><span>{account.kind === 'credit' ? x.credit : account.kind === 'cash' ? x.cash : x.banking}</span>
              {data.permissions.editAccounts && account.editable && <button type="button" className="link-btn" onClick={() => setCreating({
                kind: 'account', id: account.id, name: account.name, accountKind: account.kind === 'cash' ? 'cash' : 'bank',
              })}>{x.creation.editAccount}</button>}
            </li>)}</ul> : <p className="pb-partner-note">{x.noShared}</p>)}
          </section>}
          {(data.permissions.personalGoals || data.permissions.addPersonalGoals) && <section className="card pb-partner-card">
            <SectionHeader as="h2" icon={Goal} title={x.personalGoals}
              actions={data.permissions.addPersonalGoals && <button type="button" className="pill" onClick={() => setCreating({ kind: 'goal' })}>{x.creation.goal}</button>} />
            {data.permissions.personalGoals && (data.goals.length ? <ul className="pb-partner-list">{data.goals.map(goal => <li className="pb-partner-list-row" key={goal.id}>
              <bdi>{goal.name}</bdi>{goal.current !== null && goal.target !== null &&
                <span className="font-mono-tab">{formatCurrency(goal.current)} / {formatCurrency(goal.target)}</span>}
              {data.permissions.editPersonalGoals && <button type="button" className="link-btn" onClick={() => setCreating({
                kind: 'goal', id: goal.id, name: goal.name, date: goal.date, amount: goal.target,
              })}>{x.creation.editGoal}</button>}
            </li>)}</ul> : <p className="pb-partner-note">{x.noShared}</p>)}
          </section>}
          {(data.permissions.budgets || data.permissions.addBudgets) && <section className="card pb-partner-card">
            <SectionHeader as="h2" title={x.creation.budgets} subtitle={data.permissions.addBudgets ? x.creation.budgetHint : undefined}
              actions={data.permissions.addBudgets && <button type="button" className="pill" disabled={!data.budgetCategories.length}
                onClick={() => setCreating({ kind: 'budget' })}>{x.creation.budget}</button>} />
            {data.permissions.budgets && (data.budgets.length ? <ul className="pb-partner-list">{data.budgets.map(budget => <li className="pb-partner-list-row" key={budget.id}>
              <bdi>{budget.name}</bdi><span className="font-mono-tab">{formatCurrency(budget.amount)}</span>
              {data.permissions.editBudgets && <button className="link-btn" type="button" onClick={() => setCreating({
                kind: 'budget', id: budget.id, name: budget.name, amount: budget.amount,
              })}>{x.creation.editBudget}</button>}
            </li>)}</ul> : <p className="pb-partner-note">{x.noShared}</p>)}
          </section>}
          {(data.permissions.scheduled || data.permissions.addScheduled) && <section className="card pb-partner-card">
            <SectionHeader as="h2" title={x.creation.scheduled} subtitle={data.permissions.addScheduled ? x.creation.scheduleHint : undefined}
              actions={data.permissions.addScheduled && <button type="button" className="pill" disabled={!hasEntryChoices}
                onClick={() => setCreating({ kind: 'schedule' })}>{x.creation.schedule}</button>} />
            {data.permissions.addScheduled && !hasEntryChoices && <p className="pb-partner-note">{x.creation.entryAccessRequired}</p>}
            {data.permissions.scheduled && (data.scheduled.length ? <ul className="pb-partner-list">{data.scheduled.map(schedule => <li className="pb-partner-list-row" key={schedule.id}>
              <div><strong>{schedule.title || x.untitled}</strong><p className="pb-partner-note">
                {[schedule.date, x.creation.frequencies[schedule.frequency as keyof typeof x.creation.frequencies], schedule.paused ? x.creation.paused : null].filter(Boolean).join(' · ')}
              </p></div>
              {schedule.amount !== null && <span className="font-mono-tab">{formatCurrency(schedule.amount)}</span>}
              {data.permissions.editScheduled && <button className="link-btn" type="button" onClick={() => setCreating({
                kind: 'scheduleEdit', id: schedule.id, name: schedule.title,
              })}>{x.creation.editSchedule}</button>}
            </li>)}</ul> : <p className="pb-partner-note">{x.noShared}</p>)}
          </section>}
          {!Object.values(data.permissions).some(Boolean) && <section className="card pb-partner-card"><p>{x.noShared}</p></section>}
        </>}
      </main>
      {creating && data && <PartnerCreateDialog editor={creating} data={data}
        onClose={() => setCreating(null)} onCreated={() => { setCreated(true); refreshWorkspace(); }} />}
      {disconnect && <PartnerDisconnectDialog name={disconnect.name} pairId={disconnect.pairId} onClose={() => setDisconnect(null)}
        onUnpaired={() => { setData(null); window.location.assign(new URL('/settings#settings-partner', window.location.origin)); }} />}
    </div>
  );
}

const LIST_SIZE = 25;

function SharedTransactions({ rows, canView, canAdd, hasEntryChoices, onChange, onAdd }: {
  rows: SharedTransaction[]; canView: boolean; canAdd: boolean; hasEntryChoices: boolean; onChange: () => void; onAdd: () => void;
}) {
  const { d, locale } = useTranslation();
  const x = d.partner;
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(LIST_SIZE);
  const [editing, setEditing] = useState<{ id: string; type: SharedTransaction['kind']; kind: SharedTransactionChange['kind'] } | null>(null);
  const [tag, setTag] = useState('');
  const [replaceHidden, setReplaceHidden] = useState(false);
  const [replacement, setReplacement] = useState('');
  const [draft, setDraft] = useState({ title: '', date: '', notes: '', originalNotes: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const matches = useMemo(() => {
    const needle = normalizeTagSearch(query);
    return rows.filter(row => normalizeTagSearch([
      row.hidden ? x.hiddenTransaction : row.title, row.notes, categoryLabel(d, row.category), row.tag, row.accountName, row.date, formatDate(row.date, locale),
    ].join(' ')).includes(needle));
  }, [rows, query, d, locale, x.hiddenTransaction]);

  const apply = async (row: SharedTransaction, change: SharedTransactionChange) => {
    setBusy(true);
    setError('');
    const result = await callAction(() => changeSharedTransactionAction(row.id, row.kind, change));
    setBusy(false);
    if (!result.ok) { setError(partnerError(d, result)); return; }
    setEditing(null);
    onChange();
  };

  return (
    <section className="card pb-partner-card">
      <SectionHeader as="h2" icon={ReceiptText} title={x.transactions}
        actions={canAdd && <button type="button" className="pill" disabled={!hasEntryChoices} onClick={onAdd}>{x.creation.transaction}</button>} />
      {canAdd && !hasEntryChoices && <p className="pb-partner-note">{x.creation.entryAccessRequired}</p>}
      {canView && <><input type="search" className="pb-partner-input" value={query} placeholder={x.search} aria-label={x.search}
        onChange={event => { setQuery(event.target.value); setLimit(LIST_SIZE); }} />
      {matches.length === 0 && <p className="pb-partner-note">{x.noRows}</p>}
      <ul className="pb-partner-list">
        {matches.slice(0, limit).map(row => {
          const operation = editing?.id === row.id && editing.type === row.kind ? editing.kind : null;
          const editingRow = operation === 'tag' && row.canEditTag || operation === 'edit' && row.canEdit;
          const open = (kind: SharedTransactionChange['kind']) => {
            setTag(row.tag);
            setReplaceHidden(false);
            setReplacement('');
            const notes = row.notes ?? '';
            setDraft({ title: row.title, date: row.date, notes, originalNotes: notes });
            setEditing({ id: row.id, type: row.kind, kind });
            setError('');
          };
          return <li className="pb-partner-transaction" key={row.kind + row.id}>
            <div className="pb-partner-list-row">
              <div>
                <strong>{row.hidden ? x.hiddenTransaction : row.title || x.untitled}</strong>
                <p className="pb-partner-note">{[formatDate(row.date, locale), row.accountName, categoryLabel(d, row.category), row.tag].filter(Boolean).join(' · ')}</p>
              </div>
              {row.amount !== null && <span className="font-mono-tab">{formatCurrency(row.amount)}</span>}
            </div>
            {row.notes && <p className="pb-partner-note pb-partner-transaction-notes">{row.notes}</p>}
            {(row.canEdit || row.canEditTag) && !editingRow && (
              <div className="pb-partner-actions">
                {row.canEdit && <button type="button" className="link-btn" disabled={busy} onClick={() => open('edit')}>{x.editTransaction}</button>}
                {row.canEditTag && <button type="button" className="link-btn" disabled={busy} onClick={() => open('tag')}>{x.editTag}</button>}
              </div>
            )}
            {editingRow && <form className="pb-partner-inline-edit" onSubmit={event => {
              event.preventDefault();
              void apply(row, operation === 'tag' ? { kind: 'tag', tag } : {
                kind: 'edit', title: draft.title, date: draft.date,
                notes: row.notesVisible
                  ? (draft.notes !== draft.originalNotes ? draft.notes : undefined)
                  : (replaceHidden ? replacement : undefined),
              });
            }}>
              {operation === 'tag' ? <>
                <input type="text" className="pb-partner-input" aria-label={x.tag} placeholder={x.tag} maxLength={MAX_TAG_NAME_LENGTH}
                  value={tag} onChange={event => setTag(event.target.value)} disabled={busy} />
                <p className="pb-partner-note">{x.tagHint}</p>
              </> : <>
                <label>{x.transactionTitle}<input className="pb-partner-input" value={draft.title} required maxLength={300}
                  disabled={busy} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>
                <label>{x.transactionDate}<input className="pb-partner-input" type="date" value={draft.date} required
                  disabled={busy} onChange={event => setDraft({ ...draft, date: event.target.value })} /></label>
                {row.notesVisible ? <label>{x.transactionNotes}<textarea className="pb-partner-input" value={draft.notes} maxLength={4000}
                  disabled={busy} onChange={event => setDraft({ ...draft, notes: event.target.value })} /></label>
                  : <>
                    <label className="pb-partner-check"><input type="checkbox" checked={replaceHidden}
                      disabled={busy} onChange={event => setReplaceHidden(event.target.checked)} />{x.replaceHiddenNotes}</label>
                    {replaceHidden && <>
                      <p className="pb-partner-note">{x.replaceHiddenNotesHint}</p>
                      <label>{x.transactionNotes}<textarea className="pb-partner-input" value={replacement} maxLength={4000}
                        disabled={busy} onChange={event => setReplacement(event.target.value)} /></label>
                    </>}
                  </>}
              </>}
              <div className="pb-partner-actions">
                <button type="button" className="pill" disabled={busy} onClick={() => setEditing(null)}>{x.cancel}</button>
                <button type="submit" className="pill active" disabled={busy}>{x.apply}</button>
              </div>
            </form>}
            {editingRow && error && <p className="pb-partner-error" role="alert">{error}</p>}
          </li>;
        })}
      </ul>
      {matches.length > limit && <button className="pill pb-partner-save" type="button" onClick={() => setLimit(n => n + LIST_SIZE)}>{x.showMore}</button>}
      </>}
    </section>
  );
}
