'use client';

import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { Goal } from '@/types';
import { formatCurrency } from '@/lib/format';
import { resolveGoalIcon } from '@/lib/data/icons';
import { addToGoalAction, getAllocationSummaryAction } from '@/lib/actions/pebble';
import { callAction } from '@/lib/actions/callAction';
import type { FailureKind } from '@/lib/actions/failureKind';
import { ActionError } from '@/components/shared/ActionError';
import { LoadingBlock, LoadingOverlay } from '@/components/shared/Spinner';
import { ModalFrame } from '@/components/shared/ModalFrame';
import { ModalCloseButton } from '@/components/shared/ModalCloseButton';
import { SaveSuccess } from '@/components/shared/SaveSuccess';
import { AmountInput } from '@/components/shared/AmountInput';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { translateActionError } from '@/lib/i18n/actionErrors';

interface AddToGoalModalProps {
  goal: Goal;
  onClose: () => void;
}

type Step = 'enter' | 'confirm' | 'done';

// Money in integer cents throughout, so no float drift reaches a comparison.
const toCents = (dollars: number) => Math.round(dollars * 100);
const money = (cents: number) => formatCurrency(cents / 100);

/** Digits with up to two decimals, above zero. Anything else is null. */
function parseAmountCents(raw: string): number | null {
  const s = raw.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const cents = Math.round(Number(s) * 100);
  return cents > 0 ? cents : null;
}

/**
 * Add to a goal without rewriting its total.
 *
 * Every figure here is FRESH - loaded when the modal opens, never taken from
 * the page - and the server re-checks on save, refusing anything past the
 * target or beyond Unallocated, race-safely (addToGoal in pebble.ts).
 */
export function AddToGoalModal({ goal, onClose }: AddToGoalModalProps) {
  const { d, t, locale } = useTranslation();
  const Icon = resolveGoalIcon(goal.iconKey);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [availableCents, setAvailableCents] = useState(0);
  const [raw, setRaw] = useState('');
  const [step, setStep] = useState<Step>('enter');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<FailureKind | undefined>(undefined);
  // Captured at the moment of saving. The page re-renders underneath with
  // the new goal figures right after, which would otherwise shift the
  // numbers in the success message.
  const [done, setDone] = useState<{ cents: number; reached: boolean } | null>(null);

  const currentCents = toCents(goal.current);
  const targetCents = toCents(goal.target);
  const remainingCents = Math.max(0, targetCents - currentCents);

  const loadSummary = async () => {
    setLoading(true);
    setLoadError(null);
    const result = await callAction(getAllocationSummaryAction, d.addToGoal.loadFailed);
    if (!result.ok) {
      setLoadError(translateActionError(d, locale, result));
      setLoading(false);
      return;
    }
    setAvailableCents(Math.max(0, toCents(result.totalBalance) - toCents(result.allocated)));
    setLoading(false);
  };

  useEffect(() => { void loadSummary(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const amountCents = parseAmountCents(raw);
  const maxCents = Math.min(availableCents, remainingCents);
  const problem =
    raw.trim() === '' ? null
    : amountCents === null ? d.addToGoal.invalidAmount
    : amountCents > remainingCents ? t(d.addToGoal.exceedsRemaining, { amount: money(remainingCents) })
    : amountCents > availableCents ? t(d.addToGoal.exceedsAvailable, { amount: money(availableCents) })
    : null;
  const canReview = !loading && !loadError && amountCents !== null && problem === null;

  const chips = [
    { key: 'quarter', label: d.addToGoal.quarter, cents: Math.min(Math.round(remainingCents * 0.25), availableCents) },
    { key: 'half', label: d.addToGoal.half, cents: Math.min(Math.round(remainingCents * 0.5), availableCents) },
    { key: 'fill', label: d.addToGoal.fill, cents: maxCents },
  ];

  const afterCents = currentCents + (amountCents ?? 0);
  const fromPct = targetCents > 0 ? currentCents / targetCents : 0;
  const toPct = targetCents > 0 ? afterCents / targetCents : 0;
  const reachesTarget = amountCents !== null && afterCents >= targetCents;

  const confirm = async () => {
    if (amountCents === null || saving) return;
    setSaving(true);
    setError(null);
    const result = await callAction(() => addToGoalAction({ id: goal.id, amount: amountCents / 100 }));
    setSaving(false);
    if (!result.ok) {
      setError(translateActionError(d, locale, result));
      setErrorKind(result.kind);
      // A refusal means the figures moved underneath (another tab, or a
      // simultaneous save): reload them and let the amount be re-entered.
      if (result.kind === 'validation') {
        setStep('enter');
        void loadSummary();
      }
      return;
    }
    setDone({ cents: amountCents, reached: reachesTarget });
    setStep('done');
  };

  return (
    <ModalFrame onClose={onClose} busy={saving} labelledBy="add-to-goal-title" maxWidth={420} cardStyle={{ minHeight: 460 }}>
      {(close) => (
      <>
        {saving && <LoadingOverlay label={d.addToGoal.saving} />}

        <div className="pb-modal-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 38, height: 38, borderRadius: '0.7rem', backgroundColor: `${goal.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon size={18} style={{ color: goal.color }} />
            </span>
            {/* goal.name is USER DATA and is inserted untranslated. */}
            <h2 id="add-to-goal-title" className="font-display" style={{ fontSize: '1.15rem', fontWeight: 600, flex: 1, minWidth: 0, margin: 0 }}>
              {t(d.addToGoal.title, { name: goal.name })}
            </h2>
            <ModalCloseButton onClick={close} disabled={saving} />
          </div>
        </div>

        <div className="pb-modal-body themed-scroll">
          {step === 'enter' && (
            loading ? (
              <LoadingBlock label={d.addToGoal.loading} minHeight={320} size={64} labelSize="0.95rem" />
            ) : loadError ? (
              <ActionError message={loadError} onRetry={() => void loadSummary()} />
            ) : (
              <div className="goal-step" style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem', minHeight: 320 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '0.6rem' }}>
                  <Figure label={d.addToGoal.needs} value={money(remainingCents)} />
                  <Figure label={d.addToGoal.available} value={money(availableCents)} />
                </div>

                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--ink-soft)' }}>
                  {d.addToGoal.amountLabel}
                  <div style={{ position: 'relative' }}>
                    <span className="font-display" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: '1.5rem', color: 'var(--ink-soft)' }}>$</span>
                    <AmountInput
                      value={raw} placeholder="0.00"
                      onValueChange={(v) => { setRaw(v); setError(null); }}
                      onKeyDown={(e) => { if (e.key === 'Enter' && canReview) setStep('confirm'); }}
                      aria-invalid={problem ? true : undefined}
                      className="font-mono-tab"
                      style={{
                        width: '100%', boxSizing: 'border-box', padding: '0.8rem 0.9rem 0.8rem 2.2rem',
                        borderRadius: '0.8rem', border: `1px solid ${problem ? 'var(--wine)' : 'var(--line)'}`,
                        fontSize: '1.6rem', fontWeight: 600, color: 'var(--ink)', backgroundColor: 'var(--paper)',
                      }}
                    />
                  </div>
                </label>

                <div style={{ display: 'flex', gap: '0.45rem' }}>
                  {chips.map((c) => (
                    <button
                      key={c.key} type="button" className="pill" disabled={c.cents <= 0}
                      onClick={() => { setRaw((c.cents / 100).toFixed(2)); setError(null); }}
                      style={{ flex: 1, padding: '0.45rem 0.6rem', fontSize: '0.8rem', opacity: c.cents <= 0 ? 0.5 : 1 }}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>

                {maxCents === 0 ? (
                  <p style={{ fontSize: '0.8rem', color: 'var(--wine)', lineHeight: 1.45, margin: 0 }}>{d.addToGoal.nothingAvailable}</p>
                ) : problem && (
                  <p style={{ fontSize: '0.8rem', color: 'var(--wine)', lineHeight: 1.45, margin: 0 }}>{problem}</p>
                )}

                <ActionError message={error} kind={errorKind} />

                <button
                  type="button" className="btn-primary" disabled={!canReview} onClick={() => setStep('confirm')}
                  style={{ padding: '0.72rem', opacity: canReview ? 1 : 0.6 }}
                >
                  {d.addToGoal.review}
                </button>
              </div>
            )
          )}

          {step === 'confirm' && amountCents !== null && (
            <div className="goal-step" style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
              <p style={{ fontSize: '0.78rem', color: 'var(--ink-soft)', textAlign: 'center', margin: 0 }}>{d.addToGoal.confirmTitle}</p>
              <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
                <ProgressRing from={fromPct} to={toPct} color={goal.color} />
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="font-display" style={{ fontSize: '1.6rem', fontWeight: 600 }}>{Math.floor(toPct * 100)}%</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--ink-soft)' }}>{t(d.addToGoal.was, { pct: Math.floor(fromPct * 100) })}</span>
                </div>
              </div>
              <p className="font-display" style={{ textAlign: 'center', fontSize: '1.35rem', fontWeight: 600, margin: 0, color: goal.color }}>
                +{money(amountCents)}
              </p>
              {reachesTarget && (
                <p style={{ textAlign: 'center', fontSize: '0.82rem', color: 'var(--pine)', fontWeight: 600, margin: 0 }}>{d.addToGoal.reachesTarget}</p>
              )}

              <div style={{ borderTop: '1px solid var(--line)', paddingTop: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                <ChangeRow label={d.addToGoal.rowGoal} before={money(currentCents)} after={money(afterCents)} accent={goal.color} />
                <ChangeRow label={d.addToGoal.rowLeft} before={money(remainingCents)} after={money(remainingCents - amountCents)} />
                <ChangeRow label={d.addToGoal.rowUnallocated} before={money(availableCents)} after={money(availableCents - amountCents)} />
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--ink-soft)' }}>{d.addToGoal.rowTotal}</span>
                  <span style={{ color: 'var(--ink-soft)', textAlign: 'right' }}>{d.addToGoal.unchanged}</span>
                </div>
              </div>

              <ActionError message={error} kind={errorKind} onRetry={() => void confirm()} busy={saving} />

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" className="pill" onClick={() => { setStep('enter'); setError(null); }} disabled={saving} style={{ flex: 1, padding: '0.65rem' }}>
                  {d.addToGoal.back}
                </button>
                <button
                  type="button" className="btn-primary" onClick={() => void confirm()} disabled={saving}
                  style={{ flex: 1.4, padding: '0.65rem', opacity: saving ? 0.6 : 1 }}
                >
                  {t(d.addToGoal.confirm, { amount: money(amountCents) })}
                </button>
              </div>
            </div>
          )}

          {step === 'done' && done && (
            <SaveSuccess
              title={done.reached ? d.addToGoal.doneReached : d.addToGoal.doneTitle}
              body={t(d.addToGoal.doneBody, { amount: money(done.cents), name: goal.name })}
              color={goal.color}
              onDone={close}
            />
          )}
        </div>
      </>
      )}
    </ModalFrame>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: '0.7rem 0.8rem', borderRadius: '0.75rem', backgroundColor: 'var(--mist)', border: '1px solid var(--line)', minWidth: 0 }}>
      <p style={{ fontSize: '0.68rem', color: 'var(--ink-soft)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0 }}>{label}</p>
      <p className="font-mono-tab" style={{ fontSize: '1rem', fontWeight: 600, margin: '0.2rem 0 0' }}>{value}</p>
    </div>
  );
}

function ChangeRow({ label, before, after, accent }: { label: string; before: string; after: string; accent?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.75rem', fontSize: '0.85rem' }}>
      <span style={{ color: 'var(--ink-soft)' }}>{label}</span>
      <span className="font-mono-tab" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <span style={{ color: 'var(--ink-soft)', textDecoration: 'line-through' }}>{before}</span>
        <ArrowRight size={12} style={{ color: 'var(--ink-soft)' }} />
        <span style={{ fontWeight: 600, color: accent ?? 'var(--ink)' }}>{after}</span>
      </span>
    </div>
  );
}

/**
 * Old progress as a faint arc, new progress drawn on top and animated from
 * the old value to the new one a moment after mounting. The global
 * reduced-motion rule removes the animation, leaving the final state.
 */
function ProgressRing({ from, to, color }: { from: number; to: number; color: string }) {
  const [shown, setShown] = useState(from);
  useEffect(() => {
    const id = window.setTimeout(() => setShown(to), 60);
    return () => window.clearTimeout(id);
  }, [to]);
  const r = 52;
  const c = 2 * Math.PI * r;
  const clamp = (p: number) => Math.max(0, Math.min(1, p));
  return (
    <svg width={132} height={132} viewBox="0 0 132 132" aria-hidden="true">
      <circle cx={66} cy={66} r={r} fill="none" stroke="var(--line)" strokeWidth={10} />
      <circle
        cx={66} cy={66} r={r} fill="none" stroke={color} strokeOpacity={0.3} strokeWidth={10} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - clamp(from))} transform="rotate(-90 66 66)"
      />
      <circle
        cx={66} cy={66} r={r} fill="none" stroke={color} strokeWidth={10} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - clamp(shown))} transform="rotate(-90 66 66)"
        style={{ transition: 'stroke-dashoffset 0.9s cubic-bezier(0.22, 1, 0.36, 1)' }}
      />
    </svg>
  );
}
