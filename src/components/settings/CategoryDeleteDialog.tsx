'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { LoadingBlock, LoadingOverlay } from '@/components/shared/Spinner';
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
import { formatCurrency, formatDate } from '@/lib/format';

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

export function CategoryDeleteDialog({
  target, allCategories, onClose, onDeleted,
}: CategoryDeleteDialogProps) {
  const destinations = allCategories.filter((c) => c.id !== target.id);
  const fallback = destinations.find((c) => c.isSystem) ?? destinations[0];

  const [usage, setUsage] = useState<CategoryUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
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
  useEffect(() => () => { aliveRef.current = false; }, []);

  // Wrapped: a rejection here used to leave `loading` true forever, since
  // setLoading(false) only ran inside the .then().
  const loadUsage = () => {
    setLoading(true);
    setError(null);
    setLoadFailed(false);
    callAction(
      () => getCategoryUsageAction(target.id),
      "Couldn't check what uses this category.",
    ).then((result) => {
      if (!aliveRef.current) return;
      if (!result.ok) {
        setError(result.error);
        setErrorKind(result.kind);
        setLoadFailed(true);
        setLoading(false);
        return;
      }
      setUsage(result.usage);
      // Default every transaction to the fallback so the individual mode is
      // immediately valid; the user only changes the ones they care about.
      const defaults: Record<string, string> = {};
      result.usage.transactions.forEach((t) => { defaults[t.id] = fallback?.name ?? ''; });
      setAssignments(defaults);
      setLoading(false);
    });
  };

  useEffect(() => { loadUsage(); }, [target.id, fallback?.name]);

  // A delete in flight must not be cancellable. It reassigns transactions and
  // then removes the category; closing mid-write would read as success for
  // something unresolved and leave any error with nowhere to land.
  // LoadingOverlay covers the card only, so the backdrop, the X and the Cancel
  // button each need this guard.
  const requestClose = () => { if (deleting) return; onClose(); };

  const handleDelete = async () => {
    if (deleting) return;
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
    if (!result.ok) { setError(result.error); setErrorKind(result.kind); setLoadFailed(false); return; }
    onDeleted();
  };

  const hasTransactions = (usage?.transactionCount ?? 0) > 0;

  return (
    <div
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,20,18,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 60, overflowY: 'auto' }}
      onClick={requestClose}
    >
      <div className="card" style={{ padding: '1.75rem', width: '100%', maxWidth: 520, boxSizing: 'border-box', margin: '1rem 0', position: 'relative' }} onClick={(e) => e.stopPropagation()}>
        {deleting && <LoadingOverlay label="Deleting category…" />}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <h2 className="font-display" style={{ fontSize: '1.2rem', fontWeight: 600 }}>Delete {target.name}</h2>
          <button onClick={requestClose} disabled={deleting} className="icon-btn" style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', flexShrink: 0, opacity: deleting ? 0.4 : 1 }}><X size={18} /></button>
        </div>

        {loading && <LoadingBlock label="Checking what uses this category…" />}

        {!loading && !hasTransactions && (
          <p style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
            Nothing is using this category, so it can be removed safely. Its budget will be cleared too.
            This cannot be undone.
          </p>
        )}

        {!loading && hasTransactions && (
          <>
            <p style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', marginBottom: '1.1rem', lineHeight: 1.5 }}>
              {usage!.transactionCount} transaction{usage!.transactionCount === 1 ? '' : 's'} still
              use{usage!.transactionCount === 1 ? 's' : ''} this category. Choose where they should go —
              nothing is deleted, only recategorised.
            </p>

            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.1rem' }}>
              <button type="button" onClick={() => setMode('bulk')} className={`pill ${mode === 'bulk' ? 'active' : ''}`} style={{ flex: 1, padding: '0.5rem' }}>
                Move all together
              </button>
              <button type="button" onClick={() => setMode('individual')} className={`pill ${mode === 'individual' ? 'active' : ''}`} style={{ flex: 1, padding: '0.5rem' }}>
                Choose one by one
              </button>
            </div>

            {mode === 'bulk' ? (
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.8rem', color: 'var(--ink-soft)', marginBottom: '1.1rem' }}>
                Move all {usage!.transactionCount} to
                <select value={bulkTarget} onChange={(e) => setBulkTarget(e.target.value)} style={selectStyle}>
                  {destinations.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </label>
            ) : (
              <div className="themed-scroll" style={{ maxHeight: '40vh', overflowY: 'auto', marginBottom: '1.1rem', paddingRight: '0.25rem' }}>
                {usage!.transactions.map((t) => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', padding: '0.6rem 0', borderBottom: '1px solid var(--line)' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ fontSize: '0.85rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.description || 'No description'}
                      </p>
                      <p style={{ fontSize: '0.75rem', color: 'var(--ink-soft)' }}>
                        {formatDate(t.date)} · <span className="font-mono-tab">{formatCurrency(t.amount)}</span>
                      </p>
                    </div>
                    <select
                      value={assignments[t.id] ?? ''}
                      onChange={(e) => setAssignments((prev) => ({ ...prev, [t.id]: e.target.value }))}
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

        <ActionError
          message={error} kind={errorKind}
          onRetry={loadFailed ? loadUsage : handleDelete}
          busy={deleting || loading}
          style={{ marginBottom: '0.9rem' }}
        />

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="button" onClick={requestClose} disabled={deleting} className="pill" style={{ flex: 1, padding: '0.65rem', opacity: deleting ? 0.6 : 1 }}>
            Cancel
          </button>
          <button
            type="button" onClick={handleDelete} disabled={loading || deleting}
            className="btn-primary"
            style={{ flex: 1, padding: '0.65rem', backgroundColor: 'var(--wine)', opacity: loading || deleting ? 0.6 : 1 }}
          >
            {deleting ? 'Deleting…' : 'Delete category'}
          </button>
        </div>
      </div>
    </div>
  );
}
