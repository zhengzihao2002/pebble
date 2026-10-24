'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Pencil, Plus, Search, Shapes, Trash2, X } from 'lucide-react';
import { SectionHeader } from '@/components/kit/SectionHeader';
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
import { useSafetyLock } from '@/lib/useSafetyLock';
import { translateActionError } from '@/lib/i18n/actionErrors';

const inputStyle: React.CSSProperties = {
  padding: '0.5rem 0.6rem', borderRadius: '0.5rem', border: '1px solid var(--line)',
  fontSize: '0.87rem', color: 'var(--ink)', backgroundColor: 'var(--paper)',
  boxSizing: 'border-box', width: '100%',
};

// Visually hidden, still read by screen readers.
const srOnly: React.CSSProperties = {
  position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
  overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0,
};

// How long the saved row's check stays (the Add to goal hold).
const SAVED_HOLD_MS = 1600;

// Above this many categories a filter field appears.
const FILTER_FROM = 12;
// Above this many, a wide card caps the grid's height and scrolls it. Phones
// never nest a scroller: the page already scrolls, and a scroller inside a
// scroller traps the thumb.
const LONG_LIST_FROM = 24;

interface DraftState {
  name: string;
  iconKey: string;
  color: string;
}

function IconPicker({ value, color, onChange }: { value: string; color: string; onChange: (key: string) => void }) {
  return (
    <div className="themed-scroll" style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', maxHeight: 170, overflowY: 'auto', paddingRight: '0.25rem' }}>
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

const HEX6 = /^#[0-9a-fA-F]{6}$/;

function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  const { d } = useTranslation();
  // Compared ignoring case: the palette is uppercase, the browser's picker
  // reports lowercase, and a colour saved earlier could be either.
  const sameColor = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const isPalette = CATEGORY_COLOR_OPTIONS.some((c) => sameColor(c, value));
  return (
    <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'center' }}>
      {CATEGORY_COLOR_OPTIONS.map((c) => (
        <button
          key={c} type="button" onClick={() => onChange(c)}
          style={{
            width: 26, height: 26, borderRadius: '50%', backgroundColor: c,
            border: sameColor(value, c) ? '2px solid var(--ink)' : '2px solid transparent', outlineOffset: 2,
          }}
        />
      ))}
      {/* Any colour, via the browser's own picker (hue bar and colour square in
          Chrome, the system colour panel with its wheel on Apple devices) - no
          dependency. The input covers the swatch invisibly, so a click lands on
          it directly. Saved as uppercase #RRGGBB like the palette: several
          places append '20' for a tint, which only works on 6-digit hex. */}
      <label
        title={d.categoryManager.customColor}
        style={{
          position: 'relative', width: 26, height: 26, borderRadius: '50%', flexShrink: 0, boxSizing: 'border-box', cursor: 'pointer',
          background: isPalette ? 'conic-gradient(#E0605E, #E8B14F, #6FBF73, #4F9FE8, #9B6FE0, #E0605E)' : value,
          border: isPalette ? '2px solid transparent' : '2px solid var(--ink)',
        }}
      >
        <input
          type="color"
          aria-label={d.categoryManager.customColor}
          value={HEX6.test(value) ? value.toLowerCase() : '#1f5a45'}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', border: 'none', padding: 0, margin: 0 }}
        />
      </label>
    </div>
  );
}

export function CategoryManagerCard() {
  const deleteLocked = useSafetyLock('deleteCategories');
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
  // After the first successful load, refreshes happen in the background: the
  // list stays on screen and updates in place, instead of being swapped for
  // the loading block (which made the card flash and jump after every save).
  const loadedOnce = useRef(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftState>({ name: '', iconKey: 'Shapes', color: CATEGORY_COLOR_OPTIONS[0] });
  const [adding, setAdding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CategoryItem | null>(null);
  // The row whose save the server just confirmed. Set ONLY below the failure
  // return in submit(); shows a small check on that row for a moment.
  const [savedId, setSavedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  // Wrapped: previously a rejected call left `loading` true forever, since
  // setLoading(false) only ran on the resolved paths. The card would sit under
  // "Loading your categories…" with no error and no way out but a page reload -
  // precisely the DB-outage case this work exists to make visible.
  //
  // Returns the fresh list (or null on failure) so submit() can find a newly
  // added row. A failed background refresh keeps the list already shown.
  const load = async (): Promise<CategoryItem[] | null> => {
    const silent = loadedOnce.current;
    if (!silent) setLoading(true);
    const result = await callAction(getCategoriesAction, d.categoryManager.loadFailed);
    if (!result.ok) {
      setError(translateActionError(d, locale, result));
      setErrorKind(result.kind);
      setLoadFailed(true);
      setLoading(false);
      return null;
    }
    setCategories(result.categories);
    setError(null);
    setLoadFailed(false);
    setLoading(false);
    loadedOnce.current = true;
    return result.categories;
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // One timer for the check; a new save or unmounting clears it.
  useEffect(() => {
    if (!savedId) return;
    const id = window.setTimeout(() => setSavedId(null), SAVED_HOLD_MS);
    return () => window.clearTimeout(id);
  }, [savedId]);

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
    // Captured before cancel() clears them: which row to mark afterwards.
    const wasAdding = adding;
    const editedId = editingId;
    const idsBefore = new Set(categories.map((c) => c.id));
    setBusy(true);
    setError(null);
    setSavedId(null);
    const result = wasAdding
      ? await callAction(() => createCategoryAction(draft))
      : await callAction(() => updateCategoryAction({ id: editedId!, ...draft }));
    setBusy(false);
    if (!result.ok) { setError(translateActionError(d, locale, result)); setErrorKind(result.kind); setLoadFailed(false); return; }
    // Below the failure return: the check only ever marks a confirmed save.
    cancel();
    const fresh = await load();
    if (!fresh) return;
    const markId = wasAdding ? (fresh.find((c) => !idsBefore.has(c.id))?.id ?? null) : editedId;
    setSavedId(markId);
  };

  const editingSystem = !adding && categories.find((c) => c.id === editingId)?.isSystem;

  // The filter only exists for a long list; once the list is short again a
  // leftover query must not keep hiding rows behind a field that is gone.
  const showFilter = categories.length > FILTER_FROM;
  const q = showFilter ? query.trim().toLowerCase() : '';
  // The row being edited always stays, whatever the filter says.
  const shown = q ? categories.filter((c) => c.id === editingId || c.name.toLowerCase().includes(q)) : categories;

  // The editor, shared by edit and add. Opens with a live preview of the
  // chip as it will look - draft icon, colour and name.
  const editor = (mode: 'edit' | 'add') => {
    const PreviewIcon = resolveCategoryIcon(draft.iconKey);
    return (
      <div className="pb-settings-cat-editor goal-step">
        <div className="pb-settings-cat-preview" aria-hidden="true">
          <span className="pb-settings-cat-tile" style={{ backgroundColor: `${draft.color}20` }}>
            <PreviewIcon size={16} style={{ color: draft.color }} />
          </span>
          <span className={`pb-settings-cat-name${draft.name.trim() ? '' : ' is-empty'}`}>
            {draft.name.trim() || (mode === 'add' ? d.categoryManager.newCategory : d.categoryManager.namePlaceholder)}
          </span>
          <span className="pb-settings-cat-preview-tag">{d.ux.settings.previewChip}</span>
        </div>
        <input
          value={draft.name} disabled={mode === 'edit' && !!editingSystem} autoFocus={mode === 'add'}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          placeholder={mode === 'add' ? d.categoryManager.newNamePlaceholder : d.categoryManager.namePlaceholder} style={inputStyle}
        />
        {mode === 'edit' && editingSystem && (
          <span style={{ fontSize: '0.73rem', color: 'var(--ink-soft)' }}>
            {d.categoryManager.systemHint}
          </span>
        )}
        <IconPicker value={draft.iconKey} color={draft.color} onChange={(iconKey) => setDraft((d) => ({ ...d, iconKey }))} />
        <ColorPicker value={draft.color} onChange={(color) => setDraft((d) => ({ ...d, color }))} />
        {mode === 'edit' ? (
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button type="button" onClick={submit} disabled={busy} className="btn-primary" style={{ padding: '0.45rem 0.9rem', fontSize: '0.83rem', opacity: busy ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
              <Check size={14} />{busy ? d.common.saving : d.categoryManager.save}
            </button>
            <button type="button" onClick={cancel} className="pill" style={{ padding: '0.45rem 0.9rem', fontSize: '0.83rem' }}>{d.categoryManager.cancel}</button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button type="button" onClick={submit} disabled={busy} className="btn-primary" style={{ padding: '0.45rem 0.9rem', fontSize: '0.83rem', opacity: busy ? 0.6 : 1 }}>
              {busy ? d.categoryManager.adding : d.categoryManager.addCategory}
            </button>
            <button type="button" onClick={cancel} className="pill" style={{ padding: '0.45rem 0.9rem', fontSize: '0.83rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
              <X size={14} />{d.categoryManager.cancel}
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="card pb-settings-card" style={{ position: 'relative' }}>
      {busy && <LoadingOverlay label={d.common.saving} />}
      {/* Announces a confirmed save; the visible check is aria-hidden. */}
      <span role="status" style={srOnly}>{savedId ? d.categoryManager.saved : ''}</span>
      <SectionHeader
        icon={Shapes} title={d.categoryManager.title} subtitle={d.categoryManager.blurb}
        actions={!loading && categories.length > 0
          ? <span className="pb-settings-count pb-tnum">{t(d.ux.settings.categoryCount, { count: categories.length })}</span>
          : undefined}
      />

      {loading && <LoadingBlock label={d.categoryManager.loading} />}

      {!loading && (
        <>
          {showFilter && (
            <label className="pb-settings-filter">
              <Search size={15} aria-hidden="true" />
              <input
                type="search" value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder={d.ux.settings.filterCategories} aria-label={d.ux.settings.filterCategories}
              />
            </label>
          )}

          {/* A grid of chips (one column on a phone, more as the card
              widens - container query on this wrapper, which holds no
              dialog). The editor takes a whole grid row in place of the
              chip it edits. */}
          <div className="pb-settings-cat-wrap">
            <div className={`pb-settings-cat-grid themed-scroll${categories.length > LONG_LIST_FROM ? ' is-long' : ''}`}>
              {shown.map((c) => {
                const Icon = resolveCategoryIcon(c.iconKey);
                if (editingId === c.id) return <div key={c.id} className="pb-settings-cat-span">{editor('edit')}</div>;

                return (
                  <div key={c.id} className="pb-settings-cat">
                    {/* The whole chip opens the editor - a far bigger target
                        than the old 30px pencil, with the same name. */}
                    <button type="button" onClick={() => startEdit(c)} className="pb-settings-cat-main" aria-label={t(d.categoryManager.editAria, { name: c.name })}>
                      <span className="pb-settings-cat-tile" style={{ backgroundColor: `${c.color}20` }}>
                        <Icon size={16} style={{ color: c.color }} />
                      </span>
                      <span className="pb-settings-cat-name">
                        {c.name}
                        {c.isSystem && <span className="pb-settings-cat-tag">{d.categoryManager.fallbackTag}</span>}
                      </span>
                      {savedId === c.id ? (
                        // Smaller than the chip's icon, so the chip never changes height.
                        <span
                          className="goal-done-badge" aria-hidden="true"
                          style={{ width: 22, height: 22, borderRadius: '50%', backgroundColor: 'var(--pine)', color: 'var(--paper)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                        >
                          <Check size={13} strokeWidth={3} />
                        </span>
                      ) : (
                        <Pencil size={13} aria-hidden="true" className="pb-settings-cat-pen" />
                      )}
                    </button>
                    {!c.isSystem && (
                      <button type="button" onClick={() => setDeleteTarget(c)} disabled={deleteLocked} title={deleteLocked ? d.safetyLocks.lockedHint : undefined} className="icon-btn pb-settings-iconbtn" style={{ opacity: deleteLocked ? 0.4 : 1, cursor: deleteLocked ? 'not-allowed' : 'pointer' }} aria-label={t(d.categoryManager.deleteAria, { name: c.name })}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {q && shown.length === 0 && (
              <p className="pb-settings-quiet">{t(d.ux.settings.noCategoryMatch, { query: query.trim() })}</p>
            )}
          </div>

          {adding && editor('add')}

          {deleteLocked && categories.some((c) => !c.isSystem) && (
            <p data-lock-hint style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', lineHeight: 1.45, margin: 0 }}>
              {d.safetyLocks.lockedHint}
            </p>
          )}

          <ActionError
            message={error} kind={errorKind}
            onRetry={loadFailed ? () => void load() : submit}
            busy={busy || loading}
          />

          {!adding && !editingId && (
            <button type="button" onClick={startAdd} className="pill pb-settings-pill" style={{ alignSelf: 'flex-start' }}>
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
