'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { addGoalAction, deleteGoalAction, updateGoalAction } from '@/lib/actions/pebble';
import { callAction } from '@/lib/actions/callAction';
import type { FailureKind } from '@/lib/actions/failureKind';
import { ActionError } from '@/components/shared/ActionError';
import { LoadingOverlay } from '@/components/shared/Spinner';
import { ModalFrame } from '@/components/shared/ModalFrame';
import { ModalCloseButton } from '@/components/shared/ModalCloseButton';
import { SaveSuccess } from '@/components/shared/SaveSuccess';
import { playEventSound } from '@/lib/sound/useSound';
import { GOAL_ICON_OPTIONS, GOAL_COLOR_OPTIONS } from '@/data/seed';
import { resolveGoalIcon } from '@/lib/data/icons';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { translateActionError } from '@/lib/i18n/actionErrors';
import type { Goal } from '@/types';

interface GoalModalProps {
  onClose: () => void;
  // Absent means "add"; present means "edit that goal". One form rather than
  // two near-identical ones, so validation and layout cannot drift apart.
  goal?: Goal;
}

type Mode = 'form' | 'confirmDelete';

/**
 * ⚠️ Two stored values here are NOT text and are never translated: iconKey,
 * which resolveGoalIcon() looks up, and color, which is a hex string. The
 * goal's name is user data. The target date is a type="date" input, so its
 * value stays 'YYYY-MM-DD' whatever the browser's picker displays.
 */
export function GoalModal({ onClose, goal }: GoalModalProps) {
  const { d, locale } = useTranslation();
  const isEdit = goal !== undefined;

  const [mode, setMode] = useState<Mode>('form');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveErrorKind, setSaveErrorKind] = useState<FailureKind | undefined>(undefined);
  // Snapshot taken when the save confirms: only what the person entered.
  const [saved, setSaved] = useState<{ name: string; target: number } | null>(null);

  const [name, setName] = useState(goal?.name ?? '');
  const [target, setTarget] = useState(goal ? String(goal.target) : '');
  const [current, setCurrent] = useState(goal ? String(goal.current) : '');
  const [date, setDate] = useState(goal?.date ?? '');
  const [iconKey, setIconKey] = useState(goal?.iconKey ?? GOAL_ICON_OPTIONS[0].key);
  const [color, setColor] = useState(goal?.color ?? GOAL_COLOR_OPTIONS[0]);

  const PreviewIcon = resolveGoalIcon(iconKey);

  const inputStyle: React.CSSProperties = { padding: '0.6rem 0.75rem', borderRadius: '0.6rem', border: '1px solid var(--line)', fontSize: '0.9rem', color: 'var(--ink)', backgroundColor: 'var(--paper)', boxSizing: 'border-box', width: '100%' };
  const labelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.8rem', color: 'var(--ink-soft)' };
  // Row inputs: same height, allowed to shrink, and no native date styling,
  // because iOS Safari sizes type="date" by itself and overflows its cell.
  const rowInputStyle: React.CSSProperties = { ...inputStyle, minWidth: 0, maxWidth: '100%', height: '2.6rem', textAlign: 'left', WebkitAppearance: 'none', appearance: 'none' };
  const prefixStyle: React.CSSProperties = { position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-soft)', fontSize: '0.9rem' };

  // Compared the way each field is STORED, so an untouched edit stays disabled.
  const dirty = !goal || (
    name.trim() !== goal.name ||
    Number(target) !== goal.target ||
    (current ? Number(current) : 0) !== goal.current ||
    date.trim() !== goal.date ||
    iconKey !== goal.iconKey ||
    color !== goal.color
  );

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!name.trim() || !target || Number(target) <= 0 || !date.trim() || saving || !dirty) return;
    setSaving(true);
    setSaveError(null);

    // iconKey and color go through untouched - both are looked up, not read.
    const payload = {
      name: name.trim(), target: Number(target), current: current ? Number(current) : 0,
      date: date.trim(), iconKey, color,
    };
    const result = goal
      ? await callAction(() => updateGoalAction({ ...payload, id: goal.id }))
      : await callAction(() => addGoalAction(payload));

    setSaving(false);
    if (!result.ok) {
      setSaveError(translateActionError(d, locale, result));
      setSaveErrorKind(result.kind);
      playEventSound('saveFailed');
      return;
    }

    // Fires on the CROSSING, not the state: checking only whether the goal is
    // now complete would replay the sound on every later edit of an already
    // finished goal. A new goal created already at target counts - the
    // previous amount is 0, so that is a genuine crossing.
    const before = goal ? goal.current : 0;
    const wasIncomplete = !goal || before < goal.target;
    const nowComplete = payload.target > 0 && payload.current >= payload.target;
    // Only the crossing makes a sound. An ordinary goal save is silent.
    if (wasIncomplete && nowComplete) playEventSound('goalReached');
    setSaved({ name: payload.name, target: payload.target });
  };

  const handleDelete = async (close: () => void) => {
    if (!goal || saving) return;
    setSaving(true);
    setSaveError(null);
    const result = await callAction(() => deleteGoalAction({ id: goal.id }));
    setSaving(false);
    if (!result.ok) { setSaveError(translateActionError(d, locale, result)); setSaveErrorKind(result.kind); return; }
    // Quiet: no confirmation for a delete. Closed after saving has cleared.
    window.setTimeout(close, 0);
  };

  return (
    <ModalFrame onClose={onClose} busy={saving} labelledBy="goal-modal-title" maxWidth={440}>
      {(close) => (
      <>
        {saving && <LoadingOverlay label={mode === 'confirmDelete' ? d.goalModal.deletingOverlay : d.goalModal.saving} />}

        <div className="pb-modal-head">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 id="goal-modal-title" className="font-display" style={{ fontSize: '1.2rem', fontWeight: 600 }}>
              {isEdit ? d.goalModal.titleEdit : d.goalModal.titleAdd}
            </h2>
            <ModalCloseButton onClick={close} disabled={saving} />
          </div>
        </div>

        {saved ? (
          <div className="pb-modal-body">
            <SaveSuccess
              title={isEdit ? d.goalModal.savedTitleEdit : d.goalModal.savedTitleAdd}
              body={`${saved.name} · ${formatCurrency(saved.target)}`}
              color={color}
              onDone={close}
            />
          </div>
        ) : mode === 'confirmDelete' ? (
          <>
            <div className="pb-modal-body themed-scroll">
              <p style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem' }}>{d.goalModal.deleteConfirm}</p>
              <p style={{ fontSize: '0.83rem', color: 'var(--ink-soft)', lineHeight: 1.5 }}>
                {/* The goal's name is user data and leads the sentence in both
                    languages, so the remainder is a single key. */}
                <strong style={{ color: 'var(--ink)' }}>{goal?.name}</strong> {d.goalModal.deleteBody}
              </p>
            </div>
            <div className="pb-modal-foot">
              <ActionError message={saveError} kind={saveErrorKind} onRetry={() => void handleDelete(close)} busy={saving} />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" onClick={() => { setMode('form'); setSaveError(null); }} disabled={saving} className="pill" style={{ flex: 1, padding: '0.6rem' }}>{d.goalModal.keepIt}</button>
                <button type="button" onClick={() => void handleDelete(close)} disabled={saving} className="btn-primary" style={{ flex: 1, padding: '0.6rem', backgroundColor: 'var(--wine)', opacity: saving ? 0.6 : 1 }}>
                  {saving ? d.goalModal.deleting : d.goalModal.delete}
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="pb-modal-body themed-scroll" style={{ overflowX: 'hidden' }}>
              <form id="goal-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <label style={labelStyle}>
                  {d.goalModal.targetAmount}
                  <div style={{ position: 'relative' }}>
                    {/* Stays '$' in every locale - the user's real US dollars. */}
                    <span className="font-display" style={{ ...prefixStyle, left: 14, fontSize: '1.5rem' }}>$</span>
                    <input
                      type="number" min="0" step="0.01" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="0.00" required
                      className="font-mono-tab"
                      style={{ ...inputStyle, padding: '0.8rem 0.9rem 0.8rem 2.2rem', borderRadius: '0.8rem', fontSize: '1.6rem', fontWeight: 600 }}
                    />
                  </div>
                </label>

                <label style={labelStyle}>
                  {d.goalModal.name}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span aria-hidden="true" style={{ width: 38, height: 38, borderRadius: '0.7rem', backgroundColor: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <PreviewIcon size={18} style={{ color }} />
                    </span>
                    <input value={name} onChange={(e) => setName(e.target.value)} placeholder={d.goalModal.namePlaceholder} required style={{ ...inputStyle, flex: 1, minWidth: 0 }} />
                  </div>
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
                  <label style={{ ...labelStyle, minWidth: 0 }}>
                    <span>{isEdit ? d.goalModal.setAsideSoFar : d.goalModal.alreadySaved} <span style={{ opacity: 0.7 }}>{d.goalModal.optional}</span></span>
                    <div style={{ position: 'relative' }}>
                      <span style={prefixStyle}>$</span>
                      <input
                        type="number" min="0" step="0.01" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="0.00"
                        className="font-mono-tab" style={{ ...rowInputStyle, paddingLeft: '1.6rem' }}
                      />
                    </div>
                  </label>

                  <label style={{ ...labelStyle, minWidth: 0 }}>
                    {d.goalModal.targetDate}
                    {/* The browser localizes its own picker from <html lang>; the
                        value stays 'YYYY-MM-DD', which is what reaches the action. */}
                    <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required style={rowInputStyle} />
                  </label>
                </div>

                {/* A div, not a label: <label> forwards clicks to its first button. */}
                <div style={labelStyle}>
                  <span>{d.goalModal.icon}</span>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', padding: 3 }}>
                    {/* key is the stored iconKey, resolved by resolveGoalIcon().
                        Never translated, never a label. */}
                    {GOAL_ICON_OPTIONS.map(({ key, icon: OptIcon }, i) => (
                      <button
                        key={key} type="button" onClick={() => setIconKey(key)}
                        aria-label={`${d.goalModal.icon} ${i + 1}`} aria-pressed={iconKey === key}
                        style={{
                          width: 38, height: 38, borderRadius: '0.6rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          border: iconKey === key ? `2px solid ${color}` : '1px solid var(--line)',
                          backgroundColor: iconKey === key ? `${color}20` : 'transparent', color: iconKey === key ? color : 'var(--ink-soft)',
                          outlineOffset: 2,
                        }}
                      >
                        <OptIcon size={17} />
                      </button>
                    ))}
                  </div>
                </div>

                <div style={labelStyle}>
                  <span>{d.goalModal.color}</span>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', padding: 3 }}>
                    {GOAL_COLOR_OPTIONS.map((c, i) => (
                      <button
                        key={c} type="button" onClick={() => setColor(c)}
                        aria-label={`${d.goalModal.color} ${i + 1}`} aria-pressed={color === c}
                        style={{
                          width: 30, height: 30, borderRadius: '50%', backgroundColor: c,
                          border: color === c ? '2px solid var(--ink)' : '2px solid transparent', outlineOffset: 2,
                        }}
                      />
                    ))}
                  </div>
                </div>
              </form>
            </div>

            <div className="pb-modal-foot">
              <ActionError message={saveError} kind={saveErrorKind} onRetry={() => void handleSubmit()} busy={saving} />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {isEdit && (
                  <button
                    type="button" onClick={() => { setMode('confirmDelete'); setSaveError(null); }} disabled={saving}
                    className="pill"
                    style={{ padding: '0.72rem 1rem', color: 'var(--wine)', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <Trash2 size={14} />{d.goalModal.delete}
                  </button>
                )}
                <button type="submit" form="goal-form" disabled={saving || !dirty} className="btn-primary" style={{ flex: 1, padding: '0.72rem', opacity: saving || !dirty ? 0.6 : 1 }}>
                  {saving ? d.common.saving : isEdit ? d.goalModal.saveChanges : d.goalModal.titleAdd}
                </button>
              </div>
            </div>
          </>
        )}
      </>
      )}
    </ModalFrame>
  );
}
