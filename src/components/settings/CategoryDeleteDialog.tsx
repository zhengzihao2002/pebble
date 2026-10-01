'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { LoadingBlock, LoadingOverlay } from '@/components/shared/Spinner';
import { ModalFrame } from '@/components/shared/ModalFrame';
import { ModalCloseButton } from '@/components/shared/ModalCloseButton';
import { SelectField, type SelectFieldOption } from '@/components/shared/SelectField';
import {
  deleteCategoryAction,
  getCategoryUsageAction,
  type CategoryDeletePlan,
  type CategoryUsage,
} from '@/lib/actions/pebble';
import { callAction } from '@/lib/actions/callAction';
import type { FailureKind } from '@/lib/actions/failureKind';
import { ActionError } from '@/components/shared/ActionError';
import type { CategoryItem } from '@/lib/data/mappers';
import { resolveCategoryIcon } from '@/lib/data/icons';
import { formatCurrency, formatDate } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { translateActionError } from '@/lib/i18n/actionErrors';

interface CategoryDeleteDialogProps {
  target: CategoryItem;
  allCategories: CategoryItem[];
  onClose: () => void;
  onDeleted: () => void;
}

type Mode = 'bulk' | 'individual';

const selectStyle: React.CSSProperties = {
  padding: '0.45rem 0.55rem', borderRadius: '0.5rem', border: '1px solid var(--line)',
  fontSize: '0.85rem', color: 'var(--ink)', backgroundColor: 'var(--paper)',
  boxSizing: 'border-box',
};

/**
 * Closes the dialog once the render that made it busy-free has settled.
 * ModalFrame reads `busy` through a ref refreshed in an effect, so calling
 * close() in the same tick as setDeleting(false) would be ignored.
 */
function CloseSoon({ close }: { close: () => void }) {
  useEffect(() => {
    const id = window.setTimeout(close, 0);
    return () => window.clearTimeout(id);
  }, [close]);
  return null;
}

/**
 * LAYOUT. Head (title, close) and foot (error, buttons) never scroll; the
 * body between them is the only scroller.
 *
 * CLOSING. After a confirmed delete the dialog closes quietly (the category
 * leaving the list is the confirmation). ModalFrame's onClose then runs
 * onDeleted - which refreshes the card's list - instead of onClose.
 */
export function CategoryDeleteDialog({
  target, allCategories, onClose, onDeleted,
}: CategoryDeleteDialogProps) {
  const { d, t, locale } = useTranslation();
  // ⚠️ Every option below carries a CATEGORY NAME as its value, and those
  // names are what the reassignment plan sends to the server. User data:
  // never translated, in either the value or the label.
  const destinations = allCategories.filter((c) => c.id !== target.id);
  const fallback = destinations.find((c) => c.isSystem) ?? destinations[0];

  const [usage, setUsage] = useState<CategoryUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  // Set ONLY below the failure return in handleDelete.
  const [deleted, setDeleted] = useState(false);
  const deletedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<FailureKind | undefined>(undefined);
  // Which call failed, so Try again repeats that one and not the other.
  const [loadFailed, setLoadFailed] = useState(false);
  const [mode, setMode] = useState<Mode>('bulk');
  const [bulkTarget, setBulkTarget] = useState(fallback?.name ?? '');
  const [assignments, setAssignments] = useState<Record<string, string>>({});

  // Was a per-effect-run `active` local. A manual retry is not tied to an
  // effect run, so the unmount guard has to outlive one.
  const aliveRef = useRef(true);
  // Re-armed on mount, not merely cleared on unmount: Strict Mode's dev
  // double-invoke unmounts and remounts, and a flag only ever cleared would
  // stay false and the dialog would spin on "checking" forever.
  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  const destinationOptions = useMemo<SelectFieldOption[]>(
    () => destinations.map((c) => ({
      value: c.name,
      label: c.name,
      icon: resolveCategoryIcon(c.iconKey),
      color: c.color,
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allCategories, target.id],
  );

  // Wrapped: a rejection here used to leave `loading` true forever, since
  // setLoading(false) only ran inside the .then().
  const loadUsage = () => {
    setLoading(true);
    setError(null);
    setLoadFailed(false);
    callAction(
      () => getCategoryUsageAction(target.id),
      d.categoryDelete.usageFailed,
    ).then((result) => {
      if (!aliveRef.current) return;
      if (!result.ok) {
        setError(translateActionError(d, locale, result));
        setErrorKind(result.kind);
        setLoadFailed(true);
        setLoading(false);
        return;
      }
      setUsage(result.usage);
      // Default every transaction to the fallback so the individual mode is
      // immediately valid; the user only changes the ones they care about.
      const defaults: Record<string, string> = {};
      result.usage.transactions.forEach((tx) => { defaults[tx.id] = fallback?.name ?? ''; });
      setAssignments(defaults);
      setLoading(false);
    });
  };

  useEffect(() => { loadUsage(); }, [target.id, fallback?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  // A delete in flight must not be cancellable: it reassigns transactions and
  // then removes the category. ModalFrame's busy prop blocks Escape, the
  // backdrop and the close dot; Cancel below is disabled the same way.
  const handleDelete = async () => {
    if (deleting || deleted) return;
    setDeleting(true);
    setError(null);

    let plan: CategoryDeletePlan = null;
    if (usage && usage.transactionCount > 0) {
      plan = mode === 'bulk'
        ? { mode: 'bulk', reassignToName: bulkTarget }
        : { mode: 'individual', assignments };
    }

    const result = await callAction(() => deleteCategoryAction({ id: target.id, plan }));
    setDeleting(false);
    if (!result.ok) { setError(translateActionError(d, locale, result)); setErrorKind(result.kind); setLoadFailed(false); return; }
    // Below the failure return. No celebration: CloseSoon plays the normal
    // exit, then ModalFrame's onClose runs onDeleted.
    deletedRef.current = true;
    setDeleted(true);
  };

  const hasTransactions = (usage?.transactionCount ?? 0) > 0;

  return (
    <ModalFrame
      onClose={() => { if (deletedRef.current) onDeleted(); else onClose(); }}
      busy={deleting}
      labelledBy="category-delete-title"
      maxWidth={520}
      zIndex={60}
    >
      {(close) => (
      <>
        {deleting && <LoadingOverlay label={d.categoryDelete.deleting} />}

        {/* HEAD: never scrolls. Names are user data and can be long. */}
        <div className="pb-modal-head">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
            <h2 id="category-delete-title" className="font-display" style={{ flex: 1, minWidth: 0, fontSize: '1.2rem', fontWeight: 600, overflowWrap: 'anywhere' }}>
              {t(d.categoryDelete.title, { name: target.name })}
            </h2>
            <ModalCloseButton onClick={close} disabled={deleting} />
          </div>
        </div>

        {/* BODY: the only scroller. */}
        <div className="pb-modal-body themed-scroll">
          {loading && <LoadingBlock label={d.categoryDelete.checking} />}

          {!loading && !hasTransactions && (
            <p style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', lineHeight: 1.5, margin: 0 }}>
              {d.categoryDelete.noUsage}
            </p>
          )}

          {!loading && hasTransactions && (
            <>
              <p style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', marginBottom: '1.1rem', lineHeight: 1.5 }}>
                {/* One whole sentence per form, chosen by count. English
                    inflects both the noun and the verb here; Chinese inflects
                    neither, so assembling from fragments could not serve both. */}
                {t(usage!.transactionCount === 1 ? d.categoryDelete.usageOne : d.categoryDelete.usageOther, { count: usage!.transactionCount })}
              </p>

              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.1rem' }}>
                <button type="button" onClick={() => setMode('bulk')} className={`pill ${mode === 'bulk' ? 'active' : ''}`} style={{ flex: 1, padding: '0.5rem' }}>
                  {d.categoryDelete.moveAll}
                </button>
                <button type="button" onClick={() => setMode('individual')} className={`pill ${mode === 'individual' ? 'active' : ''}`} style={{ flex: 1, padding: '0.5rem' }}>
                  {d.categoryDelete.oneByOne}
                </button>
              </div>

              {mode === 'bulk' ? (
                // A div, not a label: a click on the words must not reach the
                // dropdown's input and reopen the list.
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.8rem', color: 'var(--ink-soft)' }}>
                  <span>{t(d.categoryDelete.moveAllTo, { count: usage!.transactionCount })}</span>
                  <SelectField
                    value={bulkTarget}
                    onChange={setBulkTarget}
                    options={destinationOptions}
                    ariaLabel={t(d.categoryDelete.moveAllTo, { count: usage!.transactionCount })}
                  />
                </div>
              ) : (
                <div>
                  {usage!.transactions.map((tx) => (
                    <div key={tx.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', padding: '0.6rem 0', borderBottom: '1px solid var(--line)' }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p style={{ fontSize: '0.85rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {tx.description || d.categoryDelete.noDescription}
                        </p>
                        <p style={{ fontSize: '0.75rem', color: 'var(--ink-soft)' }}>
                          {formatDate(tx.date, locale)} · <span className="font-mono-tab">{formatCurrency(tx.amount)}</span>
                        </p>
                      </div>
                      <select
                        value={assignments[tx.id] ?? ''}
                        onChange={(e) => setAssignments((prev) => ({ ...prev, [tx.id]: e.target.value }))}
                        style={{ ...selectStyle, maxWidth: 170, flexShrink: 0 }}
                      >
                        {destinations.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* FOOT: never scrolls; the error sits directly above the buttons. */}
        <div className="pb-modal-foot">
          <ActionError
            message={error} kind={errorKind}
            onRetry={loadFailed ? loadUsage : handleDelete}
            busy={deleting || loading}
          />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" onClick={close} disabled={deleting || deleted} className="pill" style={{ flex: 1, padding: '0.65rem', opacity: deleting || deleted ? 0.6 : 1 }}>
              {d.categoryDelete.cancel}
            </button>
            <button
              type="button" onClick={handleDelete} disabled={loading || deleting || deleted}
              className="btn-primary"
              style={{ flex: 1, padding: '0.65rem', backgroundColor: 'var(--wine)', opacity: loading || deleting || deleted ? 0.6 : 1 }}
            >
              {deleting ? d.recurring.deleting : d.categoryDelete.confirm}
            </button>
          </div>
        </div>

        {deleted && <CloseSoon close={close} />}
      </>
      )}
    </ModalFrame>
  );
}
