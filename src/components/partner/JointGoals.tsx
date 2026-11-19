'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { Handshake, Plus } from 'lucide-react';
import { SectionHeader } from '@/components/kit/SectionHeader';
import { ModalCloseButton } from '@/components/shared/ModalCloseButton';
import { ModalFrame } from '@/components/shared/ModalFrame';
import { callAction } from '@/lib/actions/callAction';
import { contributeJointGoalAction, createJointGoalAction, readJointGoalsAction } from '@/lib/actions/partner';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import type { JointGoalSummary } from '@/lib/partner';
import { partnerError } from './partnerError';

const amount = (cents: number) => formatCurrency(cents / 100);
const parseCents = (value: string) => /^\d{1,9}(\.\d{1,2})?$/.test(value) ? Math.round(Number(value) * 100) : 0;

export function JointGoals() {
  const { d } = useTranslation();
  const x = d.partner.joint;
  const [data, setData] = useState<{ pairId: string | null; goals: JointGoalSummary[] } | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [editor, setEditor] = useState<{ pairId: string } | JointGoalSummary | null>(null);

  const load = useCallback(() => callAction(readJointGoalsAction).then(result => {
    if (result.ok) { setData(result); setError(''); }
    else { setData(null); setError(partnerError(d, result)); }
  }), [d]);

  useEffect(() => {
    void load();
    window.addEventListener('focus', load);
    return () => window.removeEventListener('focus', load);
  }, [load]);

  if (!data && !error) return null;
  const pairId = data?.pairId;
  const active = data?.goals.filter(goal => goal.active) ?? [];
  const history = data?.goals.filter(goal => !goal.active) ?? [];

  return (
    <section className="pb-joint-goals" aria-labelledby="pb-joint-goals-title">
      <div className="card pb-partner-card">
        <SectionHeader as="h2" id="pb-joint-goals-title" title={x.title} subtitle={x.hint} icon={Handshake}
          actions={pairId ? <button type="button" className="pill active" onClick={() => setEditor({ pairId })}>
            <Plus size={15} aria-hidden="true" />{x.create}
          </button> : undefined} />
        {error ? <p className="pb-partner-error" role="alert">{error}</p>
          : data?.pairId ? <p className="pb-partner-note">{x.ledger}</p>
          : <>
            <p className="pb-partner-note">{x.pairFirst}</p>
            <Link href="/settings#settings-partner" className="pill pb-partner-save">{x.openSettings}</Link>
          </>}
        <div className="pb-partner-note" role="status">{status}</div>
      </div>
      {!!data?.pairId && !active.length && <p className="pb-partner-note">{x.empty}</p>}
      {active.length > 0 && <div className="pb-joint-grid">
        {active.map(goal => <JointGoalCard key={goal.id} goal={goal} onContribute={() => setEditor(goal)} />)}
      </div>}
      {history.length > 0 && <details className="card pb-partner-card pb-joint-history">
        <summary>{x.history} · {history.length}</summary>
        <div className="pb-joint-grid">{history.map(goal => <JointGoalCard key={goal.id} goal={goal} />)}</div>
      </details>}
      {editor && <JointGoalDialog
        editor={editor}
        onClose={() => setEditor(null)}
        onSave={() => { setStatus('pairId' in editor ? x.created : x.added); void load(); }} />}
    </section>
  );
}

function JointGoalCard({ goal, onContribute }: { goal: JointGoalSummary; onContribute?: () => void }) {
  const { d, t } = useTranslation();
  const x = d.partner.joint;
  const total = goal.myCents + goal.partnerCents;
  const remaining = Math.max(0, goal.targetCents - total);
  return (
    <article className="card pb-partner-card pb-joint-goal">
      <div className="pb-partner-list-row">
        <h3 className="font-display"><bdi>{goal.name}</bdi></h3>
        {!goal.active && <span className="pb-partner-note">{x.archived}</span>}
      </div>
      <div className="pb-joint-total font-mono-tab"><strong>{amount(total)}</strong><span> / {amount(goal.targetCents)}</span></div>
      <div className="pb-joint-meter" role="progressbar" aria-label={x.progress} aria-valuenow={total} aria-valuemax={goal.targetCents} aria-valuemin={0}>
        <span style={{ width: `${goal.myCents / goal.targetCents * 100}%` }} />
        <span style={{ width: `${goal.partnerCents / goal.targetCents * 100}%` }} />
      </div>
      <div className="pb-joint-split">
        <span>{x.mine} <strong className="font-mono-tab">{amount(goal.myCents)}</strong></span>
        <span>{x.theirs} <strong className="font-mono-tab">{amount(goal.partnerCents)}</strong></span>
      </div>
      <div className="pb-partner-list-row">
        <span className={remaining ? 'pb-partner-note font-mono-tab' : 'pb-partner-note'}>
          {remaining ? t(x.left, { amount: amount(remaining) }) : x.complete}
        </span>
        {goal.active && remaining > 0 && onContribute && <button type="button" className="pill" onClick={onContribute}>{x.contribute}</button>}
      </div>
    </article>
  );
}

function JointGoalDialog({ editor, onClose, onSave }: { editor: { pairId: string } | JointGoalSummary; onClose: () => void; onSave: () => void }) {
  const goal = 'pairId' in editor ? null : editor;
  const { d, t } = useTranslation();
  const x = d.partner.joint;
  const titleId = useId();
  const requestId = useRef<string | null>(null);
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const cents = parseCents(value);
  const remaining = goal ? Math.max(0, goal.targetCents - goal.myCents - goal.partnerCents) : 99_999_999_999;
  const valid = cents > 0 && cents <= remaining && (goal || name.trim());

  const submit = async (complete: () => void) => {
    if (!valid || busy) return;
    const id = requestId.current ?? crypto.randomUUID();
    requestId.current = id;
    setBusy(true);
    setError('');
    const result = await callAction(() => 'pairId' in editor ? createJointGoalAction(editor.pairId, id, name, cents) : contributeJointGoalAction(id, editor.id, cents));
    setBusy(false);
    if (!result.ok) { setError(partnerError(d, result)); return; }
    onSave();
    complete();
  };

  return <ModalFrame onClose={onClose} busy={busy} labelledBy={titleId}>
    {(close, complete) => <>
      <div className="pb-modal-head pb-partner-modal-head">
        <h2 id={titleId}>{goal ? x.contribute : x.create}</h2>
        <ModalCloseButton onClick={close} disabled={busy} />
      </div>
      <form className="pb-joint-form" onSubmit={event => { event.preventDefault(); void submit(complete); }}>
        <div className="pb-modal-body pb-joint-fields">
          {goal ? <p><strong><bdi>{goal.name}</bdi></strong> · <span className="font-mono-tab">{t(x.left, { amount: amount(remaining) })}</span></p> : (
            <label>{x.name}<input className="pb-partner-input" value={name} onChange={event => {
              setName(event.target.value); requestId.current = null;
            }} required maxLength={80} disabled={busy} /></label>
          )}
          <label>{goal ? x.amount : x.target}<input className="pb-partner-input" value={value} onChange={event => {
            setValue(event.target.value); requestId.current = null;
          }} type="number" inputMode="decimal" min=".01" max={remaining / 100} step=".01" required disabled={busy} /></label>
          <p className="pb-partner-note">{x.ledger}</p>
          {error && <p className="pb-partner-error" role="alert">{error}</p>}
        </div>
        <div className="pb-modal-foot pb-partner-modal-actions">
          <button type="button" className="pill" onClick={close} disabled={busy}>{d.partner.cancel}</button>
          <button type="submit" className="pill active" disabled={!valid || busy}>{busy ? d.common.saving : d.partner.apply}</button>
        </div>
      </form>
    </>}
  </ModalFrame>;
}
