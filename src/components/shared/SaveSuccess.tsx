'use client';

import { useEffect, useRef } from 'react';
import { Check } from 'lucide-react';

interface SaveSuccessProps {
  title: string;
  /**
   * What was saved, in the person's own terms. SNAPSHOT it when the save
   * confirms: the page re-renders underneath with new figures, and this line
   * must not shift. Only ever what they entered - never a computed balance.
   */
  body?: string;
  /** Called after the hold. Pass ModalFrame's close() so the exit plays. */
  onDone: () => void;
  /** Badge colour. Defaults to pine; Add to goal passes the goal's own colour. */
  color?: string;
}

// The same hold as the Add to goal confirmation this copies.
const HOLD_MS = 1600;

/**
 * The save confirmation, identical to the one Add to goal has always shown:
 * a round badge that pops in (.goal-done-badge), the title and one line
 * beneath, rising in with .goal-step, then the dialog closes by itself.
 *
 * Mount it only in the success branch, after the failure return: it must
 * never appear for a write that did not land. It replaces the dialog's form
 * in place; the header, with its close button, stays above it.
 */
export function SaveSuccess({ title, body, onDone, color = 'var(--pine)' }: SaveSuccessProps) {
  // A ref, not the prop: the page hands a new onClose on every re-render,
  // which would keep restarting the timer (the same reason AddToGoalModal
  // uses one).
  const onDoneRef = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; });
  useEffect(() => {
    const id = window.setTimeout(() => onDoneRef.current(), HOLD_MS);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div className="goal-step" role="status" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.8rem', padding: '1.5rem 0', textAlign: 'center' }}>
      <span
        className="goal-done-badge"
        style={{ width: 64, height: 64, borderRadius: '50%', backgroundColor: color, color: 'var(--paper)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 8px 24px -8px ${color}` }}
      >
        <Check size={30} />
      </span>
      <p className="font-display" style={{ fontSize: '1.4rem', fontWeight: 600, margin: 0 }}>{title}</p>
      {body && <p style={{ fontSize: '0.88rem', color: 'var(--ink-soft)', margin: 0 }}>{body}</p>}
    </div>
  );
}
