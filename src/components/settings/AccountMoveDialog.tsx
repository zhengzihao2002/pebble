'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { LoadingBlock, LoadingOverlay } from '@/components/shared/Spinner';
import { ModalFrame } from '@/components/shared/ModalFrame';
import { ModalCloseButton } from '@/components/shared/ModalCloseButton';
import { SaveSuccess } from '@/components/shared/SaveSuccess';
import { SelectField, type SelectFieldOption } from '@/components/shared/SelectField';
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

/**
 * Moves records off an account, usually so it can be deleted.
 *
 * Destinations are ACTIVE accounts only - hibernation means no new activity,
 * and arriving records are activity. The source itself may be hibernated:
 * emptying one is exactly how it becomes deletable.
 *
 * LAYOUT. Head (title, close) and foot (error, buttons) never scroll; the
 * body between them is the only scroller.
 *
 * SUCCESS. After the server confirms, SaveSuccess names the destination (a
 * name only - no counts or balances, which would be stale or computed), then
 * closes; ModalFrame's onClose then runs onMoved instead of onClose.
 */
export function AccountMoveDialog({ source, allAccounts, onClose, onMoved }: AccountMoveDialogProps) {
  const { d, t, locale } = useTranslation();

  // Records may leave a card, never land on one.
  const destinations = allAccounts.filter((a) => a.id !== source.id && a.status === 'active' && a.kind !== 'credit');

  const [usage, setUsage] = useState<AccountUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<FailureKind | undefined>(undefined);
  const [loadFailed, setLoadFailed] = useState(false);
  const [mode, setMode] = useState<Mode>('all');
  const [target, setTarget] = useState(destinations[0]?.id ?? '');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Set ONLY below the failure return in handleMove. A snapshot, so the line
  // cannot change when the page re-renders underneath.
  const [success, setSuccess] = useState<{ title: string; summary: string } | null>(null);
  const movedRef = useRef(false);

  // Re-armed on mount, not merely cleared on unmount: Strict Mode's dev
  // double-invoke would otherwise leave it false forever, and every setState
  // below the guard would be skipped - a permanent spinner with no error.
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  // Account NAMES are user data and are never translated. Same label shape
  // as every other account picker.
  const destinationOptions = useMemo<SelectFieldOption[]>(
    () => destinations.map((a) => ({
      value: a.id,
      label: a.last4 ? `${a.name} ····${a.last4}` : a.name,
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allAccounts, source.id],
  );

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

  useEffect(loadUsage, [source.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // A move in flight must not be cancellable: ModalFrame's busy prop blocks
  // Escape, the backdrop and the close dot; Cancel below is disabled too.
  const handleMove = async () => {
    if (moving || !target || success) return;
    setMoving(true);
    setError(null);

    const result = await callAction(() => moveAccountRecordsAction({
      fromAccountId: source.id,
      toAccountId: target,
      ...(mode === 'some' ? { transactionIds: [...selected] } : {}),
    }));

    setMoving(false);
    if (!result.ok) { setError(translateActionError(d, locale, result)); setErrorKind(result.kind); setLoadFailed(false); return; }
    // Below the failure return: the confirmation only ever follows a move the
    // server confirmed.
    movedRef.current = true;
    const destinationLabel = destinationOptions.find((o) => o.value === target)?.label ?? '';
    setSuccess({
      title: d.accounts.moved,
      summary: t(d.accounts.movedTo, { account: destinationLabel }),
    });
  };

  const recordCount = usage?.records.length ?? 0;
  const canMove = !!target && (mode === 'all' || selected.size > 0);

  return (
    <ModalFrame
      onClose={() => { if (movedRef.current) onMoved(); else onClose(); }}
      busy={moving}
      labelledBy="account-move-title"
      maxWidth={520}
      zIndex={60}
    >
      {(close) => (
      <>
        {moving && <LoadingOverlay label={d.accounts.moving} />}

        {/* HEAD: never scrolls. Names are user data and can be long. */}
        <div className="pb-modal-head">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
            <h2 id="account-move-title" className="font-display" style={{ flex: 1, minWidth: 0, fontSize: '1.2rem', fontWeight: 600, overflowWrap: 'anywhere' }}>
              {t(d.accounts.moveTitle, { name: source.name })}
            </h2>
            <ModalCloseButton onClick={close} disabled={moving} />
          </div>
        </div>

        {/* BODY: the only scroller. */}
        <div className="pb-modal-body themed-scroll">
          {success ? (
            <SaveSuccess title={success.title} body={success.summary} onDone={close} />
          ) : (
            <>
              {loading && <LoadingBlock label={d.accounts.checking} />}

              {!loading && destinations.length === 0 && (
                <p style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', lineHeight: 1.5, margin: 0 }}>
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

                  {/* A div, not a label: a click on the words must not reach
                      the dropdown's input and reopen the list. */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.8rem', color: 'var(--ink-soft)', marginBottom: '1.1rem' }}>
                    <span>{d.accounts.moveTo}</span>
                    <SelectField
                      value={target}
                      onChange={setTarget}
                      options={destinationOptions}
                      ariaLabel={d.accounts.moveTo}
                    />
                  </div>

                  {/* Scheduled payments move only with "everything". A rule is
                      a schedule, not a ledger row, so it is not individually
                      selectable - and a partial move therefore cannot empty an
                      account that has any. Said plainly, since making the
                      account deletable is usually the point. */}
                  {mode === 'some' && (usage?.ruleCount ?? 0) > 0 && (
                    <p style={{ fontSize: '0.78rem', color: 'var(--gold)', marginBottom: '1rem', lineHeight: 1.45 }}>
                      {t(d.accounts.rulesStayBehind, { count: usage!.ruleCount })}
                    </p>
                  )}

                  {mode === 'some' && (
                    <div>
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
            </>
          )}
        </div>

        {/* FOOT: never scrolls; the error sits directly above the buttons.
            Absent on the confirmation. */}
        {!success && (
          <div className="pb-modal-foot">
            <ActionError
              message={error} kind={errorKind}
              onRetry={loadFailed ? loadUsage : handleMove}
              busy={moving || loading}
            />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" onClick={close} disabled={moving} className="pill" style={{ flex: 1, padding: '0.65rem', opacity: moving ? 0.6 : 1 }}>
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
        )}
      </>
      )}
    </ModalFrame>
  );
}
