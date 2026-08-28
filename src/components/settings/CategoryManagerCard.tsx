'use client';

import { useEffect, useState } from 'react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import {
  createCategoryAction,
  getCategoriesAction,
  updateCategoryAction,
} from '@/lib/actions/pebble';
import { callAction } from '@/lib/actions/callAction';
import type { FailureKind } from '@/lib/actions/failureKind';
import { ActionError } from '@/components/shared/ActionError';
import type { CategoryItem } from '@/lib/data/mappers';
import { resolveCategoryIcon } from '@/lib/data/icons';
import { CATEGORY_COLOR_OPTIONS, CATEGORY_ICON_OPTIONS } from '@/data/seed';
import { CategoryDeleteDialog } from './CategoryDeleteDialog';
import { LoadingBlock, LoadingOverlay } from '@/components/shared/Spinner';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { translateActionError } from '@/lib/i18n/actionErrors';

const inputStyle: React.CSSProperties = {
  padding: '0.5rem 0.6rem', borderRadius: '0.5rem', border: '1px solid var(--line)',
  fontSize: '0.87rem', color: 'var(--ink)', backgroundColor: 'var(--paper)',
  boxSizing: 'border-box', width: '100%',
};

interface DraftState {
  name: string;
  iconKey: string;
  color: string;
}

function IconPicker({ value, color, onChange }: { value: string; color: string; onChange: (key: string) => void }) {
  return (
    <div className="themed-scroll" style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', maxHeight: 120, overflowY: 'auto', paddingRight: '0.25rem' }}>
      {CATEGORY_ICON_OPTIONS.map(({ key, icon: OptIcon }) => (
        <button
          key={key} type="button" onClick={() => onChange(key)}
          style={{
            width: 34, height: 34, borderRadius: '0.55rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: value === key ? `2px solid ${color}` : '1px solid var(--line)',
            backgroundColor: value === key ? `${color}20` : 'transparent',
            color: value === key ? color : 'var(--ink-soft)', flexShrink: 0,
          }}
        >
          <OptIcon size={16} />
        </button>
      ))}
    </div>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
      {CATEGORY_COLOR_OPTIONS.map((c) => (
        <button
          key={c} type="button" onClick={() => onChange(c)}
          style={{
            width: 26, height: 26, borderRadius: '50%', backgroundColor: c,
            border: value === c ? '2px solid var(--ink)' : '2px solid transparent', outlineOffset: 2,
          }}
        />
      ))}
    </div>
  );
}

export function CategoryManagerCard() {
  // ⚠️ Category NAMES are user data. draft.name, c.name and everything sent
  // to createCategoryAction/updateCategoryAction pass through untranslated.
  // iconKey and color are looked-up values, never labels.
  const { d, t, locale } = useTranslation();
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<FailureKind | undefined>(undefined);
  // Which call failed, so Try again repeats that one rather than the other.
  // A failed initial load leaves nothing to save, so retrying the save would
  // be meaningless there.
  const [loadFailed, setLoadFailed] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftState>({ name: '', iconKey: 'Shapes', color: CATEGORY_COLOR_OPTIONS[0] });
  const [adding, setAdding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CategoryItem | null>(null);

  // Wrapped: previously a rejected call left `loading` true forever, since
  // setLoading(false) only ran on the resolved paths. The card would sit under
  // "Loading your categories…" with no error and no way out but a page reload -
  // precisely the DB-outage case this work exists to make visible.
  const load = async () => {
    setLoading(true);
    const result = await callAction(getCategoriesAction, d.categoryManager.loadFailed);
    if (!result.ok) {
      setError(translateActionError(d, locale, result));
      setErrorKind(result.kind);
      setLoadFailed(true);
      setLoading(false);
      return;
    }
    setCategories(result.categories);
    setError(null);
    setLoadFailed(false);
    setLoading(false);
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startEdit = (c: CategoryItem) => {
    setAdding(false);
    setEditingId(c.id);
    setError(null);
    setDraft({ name: c.name, iconKey: c.iconKey, color: c.color });
  };

  const startAdd = () => {
    setEditingId(null);
    setAdding(true);
    setError(null);
    setDraft({ name: '', iconKey: 'Shapes', color: CATEGORY_COLOR_OPTIONS[0] });
  };

  const cancel = () => { setEditingId(null); setAdding(false); setError(null); };

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = adding
      ? await callAction(() => createCategoryAction(draft))
      : await callAction(() => updateCategoryAction({ id: editingId!, ...draft }));
    setBusy(false);
    if (!result.ok) { setError(translateActionError(d, locale, result)); setErrorKind(result.kind); setLoadFailed(false); return; }
    cancel();
    await load();
  };

  const editingSystem = !adding && categories.find((c) => c.id === editingId)?.isSystem;

  return (
    <div className="card" style={{ padding: '1.5rem', position: 'relative' }}>
      {busy && <LoadingOverlay label={d.common.saving} />}
      <h3 style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.3rem' }}>{d.categoryManager.title}</h3>
      <p style={{ fontSize: '0.8rem', color: 'var(--ink-soft)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
        {d.categoryManager.blurb}
      </p>

      {loading && <LoadingBlock label={d.categoryManager.loading} />}

      {!loading && (
        <>
          <div className="themed-scroll" style={{ maxHeight: '42vh', overflowY: 'auto', paddingRight: '0.25rem', marginBottom: '1rem' }}>
            {categories.map((c) => {
              const Icon = resolveCategoryIcon(c.iconKey);
              const isEditing = editingId === c.id;

              if (isEditing) {
                return (
                  <div key={c.id} style={{ padding: '0.85rem 0', borderBottom: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                    <input
                      value={draft.name} disabled={!!editingSystem}
                      onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                      placeholder={d.categoryManager.namePlaceholder} style={inputStyle}
                    />
                    {editingSystem && (
                      <span style={{ fontSize: '0.73rem', color: 'var(--ink-soft)' }}>
                        {d.categoryManager.systemHint}
                      </span>
                    )}
                    <IconPicker value={draft.iconKey} color={draft.color} onChange={(iconKey) => setDraft((d) => ({ ...d, iconKey }))} />
                    <ColorPicker value={draft.color} onChange={(color) => setDraft((d) => ({ ...d, color }))} />
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button type="button" onClick={submit} disabled={busy} className="btn-primary" style={{ padding: '0.45rem 0.9rem', fontSize: '0.83rem', opacity: busy ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                        <Check size={14} />{busy ? d.common.saving : d.categoryManager.save}
                      </button>
                      <button type="button" onClick={cancel} className="pill" style={{ padding: '0.45rem 0.9rem', fontSize: '0.83rem' }}>{d.categoryManager.cancel}</button>
                    </div>
                  </div>
                );
              }

              return (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', padding: '0.6rem 0', borderBottom: '1px solid var(--line)' }}>
                  <span style={{ width: 32, height: 32, borderRadius: '0.55rem', backgroundColor: `${c.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={16} style={{ color: c.color }} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.name}
                    {c.isSystem && <span style={{ fontSize: '0.72rem', color: 'var(--ink-soft)', marginLeft: 6 }}>{d.categoryManager.fallbackTag}</span>}
                  </span>
                  <button type="button" onClick={() => startEdit(c)} className="icon-btn" style={{ width: 30, height: 30, borderRadius: '0.5rem', flexShrink: 0 }} aria-label={t(d.categoryManager.editAria, { name: c.name })}>
                    <Pencil size={14} />
                  </button>
                  {!c.isSystem && (
                    <button type="button" onClick={() => setDeleteTarget(c)} className="icon-btn" style={{ width: 30, height: 30, borderRadius: '0.5rem', flexShrink: 0 }} aria-label={t(d.categoryManager.deleteAria, { name: c.name })}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {adding && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem', marginBottom: '1rem' }}>
              <input
                value={draft.name} autoFocus
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder={d.categoryManager.newNamePlaceholder} style={inputStyle}
              />
              <IconPicker value={draft.iconKey} color={draft.color} onChange={(iconKey) => setDraft((d) => ({ ...d, iconKey }))} />
              <ColorPicker value={draft.color} onChange={(color) => setDraft((d) => ({ ...d, color }))} />
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <button type="button" onClick={submit} disabled={busy} className="btn-primary" style={{ padding: '0.45rem 0.9rem', fontSize: '0.83rem', opacity: busy ? 0.6 : 1 }}>
                  {busy ? d.categoryManager.adding : d.categoryManager.addCategory}
                </button>
                <button type="button" onClick={cancel} className="pill" style={{ padding: '0.45rem 0.9rem', fontSize: '0.83rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                  <X size={14} />{d.categoryManager.cancel}
                </button>
              </div>
            </div>
          )}

          <ActionError
            message={error} kind={errorKind}
            onRetry={loadFailed ? () => void load() : submit}
            busy={busy || loading}
            style={{ marginBottom: '0.8rem' }}
          />

          {!adding && !editingId && (
            <button type="button" onClick={startAdd} className="pill" style={{ padding: '0.5rem 0.95rem', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
              <Plus size={15} />{d.categoryManager.newCategory}
            </button>
          )}
        </>
      )}

      {deleteTarget && (
        <CategoryDeleteDialog
          target={deleteTarget}
          allCategories={categories}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => { setDeleteTarget(null); load(); }}
        />
      )}
    </div>
  );
}
