'use client';

import { useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { addGoalAction, deleteGoalAction, updateGoalAction } from '@/lib/actions/pebble';
import { callAction } from '@/lib/actions/callAction';
import type { FailureKind } from '@/lib/actions/failureKind';
import { ActionError } from '@/components/shared/ActionError';
import { LoadingOverlay } from '@/components/shared/Spinner';
import { playEventSound } from '@/lib/sound/useSound';
import { GOAL_ICON_OPTIONS, GOAL_COLOR_OPTIONS } from '@/data/seed';
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

  const [name, setName] = useState(goal?.name ?? '');
  const [target, setTarget] = useState(goal ? String(goal.target) : '');
  const [current, setCurrent] = useState(goal ? String(goal.current) : '');
  const [date, setDate] = useState(goal?.date ?? '');
  const [iconKey, setIconKey] = useState(goal?.iconKey ?? GOAL_ICON_OPTIONS[0].key);
  const [color, setColor] = useState(goal?.color ?? GOAL_COLOR_OPTIONS[0]);

  const inputStyle: React.CSSProperties = { padding: '0.6rem 0.75rem', borderRadius: '0.6rem', border: '1px solid var(--line)', fontSize: '0.9rem', color: 'var(--ink)', backgroundColor: 'var(--paper)', boxSizing: 'border-box' };
  const labelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.8rem', color: 'var(--ink-soft)' };

  // A write in flight must not be cancellable - see AddTransactionModal.
  const requestClose = () => { if (saving) return; onClose(); };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!name.trim() || !target || Number(target) <= 0 || !date.trim() || saving) return;
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
    // finished goal. Same reasoning as the overspend warning elsewhere.
    //
    // A new goal created already at target counts - the previous amount is 0,
    // so that is a genuine crossing.
    const before = goal ? goal.current : 0;
    const wasIncomplete = !goal || before < goal.target;
    const nowComplete = payload.target > 0 && payload.current >= payload.target;
    // Instead of the generic save sound, not on top of it.
    playEventSound(wasIncomplete && nowComplete ? 'goalReached' : 'expenseSaved');
    onClose();
  };

  const handleDelete = async () => {
    if (!goal || saving) return;
    setSaving(true);
    setSaveError(null);
    const result = await callAction(() => deleteGoalAction({ id: goal.id }));
    setSaving(false);
    if (!result.ok) { setSaveError(translateActionError(d, locale, result)); setSaveErrorKind(result.kind); return; }
    onClose();
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,20,18,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 50, overflowY: 'auto' }}
      onClick={requestClose}
    >
      {/* position: relative added so LoadingOverlay - which pins to its nearest
          positioned ancestor - covers this card and blocks the form beneath it.
          Without it the overlay would escape to the viewport. */}
      <div className="card" style={{ padding: '1.75rem', width: '100%', maxWidth: 420, boxSizing: 'border-box', margin: '1rem 0', position: 'relative' }} onClick={(e) => e.stopPropagation()}>
        {saving && <LoadingOverlay label={mode === 'confirmDelete' ? d.goalModal.deletingOverlay : d.goalModal.saving} />}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.3rem' }}>
          <h2 className="font-display" style={{ fontSize: '1.2rem', fontWeight: 600 }}>{isEdit ? d.goalModal.titleEdit : d.goalModal.titleAdd}</h2>
          <button onClick={requestClose} disabled={saving} className="icon-btn" style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', opacity: saving ? 0.4 : 1 }}><X size={18} /></button>
        </div>

        {mode === 'confirmDelete' ? (
          <div>
            <p style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem' }}>{d.goalModal.deleteConfirm}</p>
            <p style={{ fontSize: '0.83rem', color: 'var(--ink-soft)', lineHeight: 1.5, marginBottom: '1.1rem' }}>
              {/* The goal's name is user data and leads the sentence in both
                  languages, so the remainder is a single key. */}
              <strong style={{ color: 'var(--ink)' }}>{goal?.name}</strong> {d.goalModal.deleteBody}
            </p>
            <ActionError message={saveError} kind={saveErrorKind} onRetry={handleDelete} busy={saving} style={{ marginBottom: '0.9rem' }} />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" onClick={() => { setMode('form'); setSaveError(null); }} className="pill" style={{ flex: 1, padding: '0.6rem' }}>{d.goalModal.keepIt}</button>
              <button type="button" onClick={handleDelete} disabled={saving} className="btn-primary" style={{ flex: 1, padding: '0.6rem', backgroundColor: 'var(--wine)', opacity: saving ? 0.6 : 1 }}>
                {saving ? d.goalModal.deleting : d.goalModal.delete}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <label style={labelStyle}>
              {d.goalModal.name}
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={d.goalModal.namePlaceholder} required style={inputStyle} />
            </label>

            <label style={labelStyle}>
              {d.goalModal.targetAmount}
              <div style={{ position: 'relative' }}>
                {/* Stays '$' in every locale - the user's real US dollars. */}
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-soft)', fontSize: '0.9rem' }}>$</span>
                <input
                  type="number" min="0" step="0.01" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="0.00" required
                  className="font-mono-tab" style={{ ...inputStyle, width: '100%', paddingLeft: '1.6rem' }}
                />
              </div>
            </label>

            <label style={labelStyle}>
              {isEdit ? d.goalModal.setAsideSoFar : d.goalModal.alreadySaved} <span style={{ opacity: 0.7 }}>{d.goalModal.optional}</span>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-soft)', fontSize: '0.9rem' }}>$</span>
                <input
                  type="number" min="0" step="0.01" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="0.00"
                  className="font-mono-tab" style={{ ...inputStyle, width: '100%', paddingLeft: '1.6rem' }}
                />
              </div>
            </label>

            <label style={labelStyle}>
              {d.goalModal.targetDate}
              {/* The browser localizes its own picker from <html lang>; the
                  value stays 'YYYY-MM-DD', which is what reaches the action. */}
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required style={inputStyle} />
            </label>

            <label style={labelStyle}>
              {d.goalModal.icon}
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {/* key is the stored iconKey, resolved by resolveGoalIcon().
                    Never translated, never a label. */}
                {GOAL_ICON_OPTIONS.map(({ key, icon: OptIcon }) => (
                  <button
                    key={key} type="button" onClick={() => setIconKey(key)}
                    style={{
                      width: 38, height: 38, borderRadius: '0.6rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: iconKey === key ? `2px solid ${color}` : '1px solid var(--line)',
                      backgroundColor: iconKey === key ? `${color}20` : 'transparent', color: iconKey === key ? color : 'var(--ink-soft)',
                    }}
                  >
                    <OptIcon size={17} />
                  </button>
                ))}
              </div>
            </label>

            <label style={labelStyle}>
              {d.goalModal.color}
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {GOAL_COLOR_OPTIONS.map((c) => (
                  <button
                    key={c} type="button" onClick={() => setColor(c)}
                    style={{
                      width: 30, height: 30, borderRadius: '50%', backgroundColor: c,
                      border: color === c ? '2px solid var(--ink)' : '2px solid transparent', outlineOffset: 2,
                    }}
                  />
                ))}
              </div>
            </label>

            <ActionError message={saveError} kind={saveErrorKind} onRetry={() => void handleSubmit()} busy={saving} />

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              {isEdit && (
                <button
                  type="button" onClick={() => { setMode('confirmDelete'); setSaveError(null); }}
                  className="pill"
                  style={{ padding: '0.72rem 1rem', color: 'var(--wine)', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <Trash2 size={14} />{d.goalModal.delete}
                </button>
              )}
              <button type="submit" disabled={saving} className="btn-primary" style={{ flex: 1, padding: '0.72rem', opacity: saving ? 0.6 : 1 }}>
                {saving ? d.common.saving : isEdit ? d.goalModal.saveChanges : d.goalModal.titleAdd}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
