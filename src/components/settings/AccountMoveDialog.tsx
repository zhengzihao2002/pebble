'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { LoadingBlock, LoadingOverlay } from '@/components/shared/Spinner';
import {
  getAccountUsageAction,
  moveAccountRecordsAction,
  type AccountUsage,
} from '@/lib/actions/pebble';
import { callAction } from '@/lib/actions/callAction';
import type { FailureKind } from '@/lib/actions/failureKind';
import { ActionError } from '@/components/shared/ActionError';
import type { Account } from '@/lib/data/mappers';
import { formatCurrency, formatDate } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { translateActionError } from '@/lib/i18n/actionErrors';

interface AccountMoveDialogProps {
  source: Account;
  allAccounts: Account[];
  onClose: () => void;
  onMoved: () => void;
}

type Mode = 'all' | 'some';

const selectStyle: React.CSSProperties = {
  padding: '0.45rem 0.55rem', borderRadius: '0.5rem', border: '1px solid var(--line)',
  fontSize: '0.85rem', color: 'var(--ink)', backgroundColor: 'var(--paper)',
  boxSizing: 'border-box', width: '100%',
};

/**
 * Moves records off an account, usually so it can be deleted.
 *
 * Destinations are ACTIVE accounts only - hibernation means no new activity,
 * and arriving records are activity. The source itself may be hibernated:
 * emptying one is exactly how it becomes deletable.
 */
export function AccountMoveDialog({ source, allAccounts, onClose, onMoved }: AccountMoveDialogProps) {
  const { d, t, locale } = useTranslation();

  const destinations = allAccounts.filter((a) => a.id !== source.id && a.status === 'active');

  const [usage, setUsage] = useState<AccountUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<FailureKind | undefined>(undefined);
  const [loadFailed, setLoadFailed] = useState(false);
  const [mode, setMode] = useState<Mode>('all');
  const [target, setTarget] = useState(destinations[0]?.id ?? '');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Re-armed on mount, not merely cleared on unmount: Strict Mode's dev
  // double-invoke would otherwise leave it false forever, and every setState
  // below the guard would be skipped - a permanent spinner with no error.
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  const loadUsage = () => {
    setLoading(true);
    setError(null);
    setLoadFailed(false);
    callAction(() => getAccountUsageAction(source.id), d.accounts.usageFailed).then((result) => {
      if (!aliveRef.current) return;
      if (!result.ok) {
        setError(translateActionError(d, locale, result));
        setErrorKind(result.kind);
        setLoadFailed(true);
        setLoading(false);
        return;
      }
      setUsage(result.usage);
      setLoading(false);
    });
  };

  useEffect(loadUsage, [source.id]);

  const requestClose = () => { if (moving) return; onClose(); };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleMove = async () => {
    if (moving || !target) return;
    setMoving(true);
    setError(null);

    const result = await callAction(() => moveAccountRecordsAction({
      fromAccountId: source.id,
      toAccountId: target,
      ...(mode === 'some' ? { transactionIds: [...selected] } : {}),
    }));

    setMoving(false);
    if (!result.ok) { setError(translateActionError(d, locale, result)); setErrorKind(result.kind); setLoadFailed(false); return; }
    onMoved();
  };

  const recordCount = usage?.records.length ?? 0;
  const canMove = !!target && (mode === 'all' || selected.size > 0);

  return (
    <div
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,20,18,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 60, overflowY: 'auto' }}
      onClick={requestClose}
    >
      <div className="card" style={{ padding: '1.75rem', width: '100%', maxWidth: 520, boxSizing: 'border-box', margin: '1rem 0', position: 'relative' }} onClick={(e) => e.stopPropagation()}>
        {moving && <LoadingOverlay label={d.accounts.moving} />}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <h2 className="font-display" style={{ fontSize: '1.2rem', fontWeight: 600 }}>
            {t(d.accounts.moveTitle, { name: source.name })}
          </h2>
          <button onClick={requestClose} disabled={moving} className="icon-btn" style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', flexShrink: 0, opacity: moving ? 0.4 : 1 }}>
            <X size={18} />
          </button>
        </div>

        {loading && <LoadingBlock label={d.accounts.checking} />}

        {!loading && destinations.length === 0 && (
          <p style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
            {d.accounts.noDestinations}
          </p>
        )}

        {!loading && destinations.length > 0 && (
          <>
            <p style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', marginBottom: '1.1rem', lineHeight: 1.5 }}>
              {t(recordCount === 1 ? d.accounts.usageOne : d.accounts.usageOther, { count: recordCount })}
            </p>

            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.1rem' }}>
              <button type="button" onClick={() => setMode('all')} className={`pill ${mode === 'all' ? 'active' : ''}`} style={{ flex: 1, padding: '0.5rem' }}>
                {d.accounts.moveAll}
              </button>
              <button type="button" onClick={() => setMode('some')} className={`pill ${mode === 'some' ? 'active' : ''}`} style={{ flex: 1, padding: '0.5rem' }}>
                {d.accounts.movePick}
              </button>
            </div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.8rem', color: 'var(--ink-soft)', marginBottom: '1.1rem' }}>
              {d.accounts.moveTo}
              <select value={target} onChange={(e) => setTarget(e.target.value)} style={selectStyle}>
                {destinations.map((a) => (
                  <option key={a.id} value={a.id}>{a.last4 ? `${a.name} ····${a.last4}` : a.name}</option>
                ))}
              </select>
            </label>

            {/* Scheduled payments move only with "everything". A rule is a
                schedule, not a ledger row, so it is not individually
                selectable - and a partial move therefore cannot empty an
                account that has any. Said plainly, since making the account
                deletable is usually the point. */}
            {mode === 'some' && (usage?.ruleCount ?? 0) > 0 && (
              <p style={{ fontSize: '0.78rem', color: 'var(--gold)', marginBottom: '1rem', lineHeight: 1.45 }}>
                {t(d.accounts.rulesStayBehind, { count: usage!.ruleCount })}
              </p>
            )}

            {mode === 'some' && (
              <div className="themed-scroll" style={{ maxHeight: '40vh', overflowY: 'auto', marginBottom: '1.1rem', paddingRight: '0.25rem' }}>
                {usage!.records.map((r) => (
                  <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.6rem 0', borderBottom: '1px solid var(--line)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} style={{ flexShrink: 0 }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ fontSize: '0.85rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.description || d.accounts.noDescription}
                      </p>
                      <p style={{ fontSize: '0.75rem', color: 'var(--ink-soft)' }}>
                        {formatDate(r.date, locale)} · <span className="font-mono-tab">{formatCurrency(r.amount)}</span>
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </>
        )}

        <ActionError
          message={error} kind={errorKind}
          onRetry={loadFailed ? loadUsage : handleMove}
          busy={moving || loading}
          style={{ marginBottom: '0.9rem' }}
        />

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="button" onClick={requestClose} disabled={moving} className="pill" style={{ flex: 1, padding: '0.65rem', opacity: moving ? 0.6 : 1 }}>
            {d.accounts.cancel}
          </button>
          <button
            type="button" onClick={handleMove} disabled={loading || moving || !canMove}
            className="btn-primary"
            style={{ flex: 1, padding: '0.65rem', opacity: loading || moving || !canMove ? 0.6 : 1 }}
          >
            {moving ? d.accounts.moving : d.accounts.moveConfirm}
          </button>
        </div>
      </div>
    </div>
  );
}
