'use client';

import { AmountInput } from '@/components/shared/AmountInput';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Scale } from 'lucide-react';
import { SectionHeader } from '@/components/kit/SectionHeader';
import { SegmentedControl } from '@/components/kit/SegmentedControl';
import { DeltaChip } from '@/components/kit/DeltaChip';
import type { Account } from '@/lib/data/mappers';
import { createBalanceAdjustmentAction } from '@/lib/actions/pebble';
import { callAction } from '@/lib/actions/callAction';
import type { FailureKind } from '@/lib/actions/failureKind';
import { ActionError } from '@/components/shared/ActionError';
import { SelectField, type SelectFieldOption } from '@/components/shared/SelectField';
import { formatCurrency, todayDateString } from '@/lib/format';
import { LoadingOverlay } from '@/components/shared/Spinner';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { translateActionError } from '@/lib/i18n/actionErrors';

interface ModifyBalanceCardProps {
  accounts: Account[];
  balancesByAccount: Record<string, number>;
}

type Mode = 'setTo' | 'changeBy';

const HOLD_MS = 2000;

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.5rem 0.6rem', borderRadius: '0.5rem',
  border: '1px solid var(--line)', fontSize: '0.87rem', color: 'var(--ink)',
  backgroundColor: 'var(--paper)', textAlign: 'right', boxSizing: 'border-box',
};
const labelStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: '0.35rem',
  fontSize: '0.8rem', color: 'var(--ink-soft)',
};
// Same large amount field as Add Transaction.
const bigAmountStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '0.8rem 0.9rem 0.8rem 2.2rem', borderRadius: '0.8rem', border: '1px solid var(--line)', fontSize: '1.6rem', fontWeight: 600, color: 'var(--ink)', backgroundColor: 'var(--paper)' };
const bigDollarStyle: React.CSSProperties = { position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: '1.5rem', color: 'var(--ink-soft)' };

/**
 * Sets or corrects an account balance.
 *
 * THE ONLY WAY A BALANCE MOVES WITHOUT A TRANSACTION. Opening balances were
 * removed outright: every account starts at zero, and a starting figure is
 * recorded here as a dated adjustment that appears in the statement but never
 * in Reports. Nothing moves the total without a visible row explaining it.
 *
 * CONFIRMATION. After the server confirms, a small overlay covers the card
 * (the Add to goal badge, scaled down). The form stays mounted and inert
 * underneath, so the card never changes height. It shows only what was
 * entered - never a computed balance.
 */
export function ModifyBalanceCard({ accounts, balancesByAccount }: ModifyBalanceCardProps) {
  const { d, t, locale } = useTranslation();
  // Account NAMES are user data and are never translated. Only active
  // accounts are adjustable: a closed one is settled at zero permanently.
  // Credit cards are never adjusted: their balance is their charges.
  const active = accounts.filter((a) => a.status === 'active' && a.kind !== 'credit');
  // Same label shape as every other account picker, so two accounts with the
  // same name can still be told apart on a write that moves money.
  const accountOptions: SelectFieldOption[] = active.map((a) => ({
    value: a.id,
    label: a.last4 ? `${a.name} ····${a.last4}` : a.name,
  }));
  const [accountId, setAccountId] = useState(active[0]?.id ?? '');
  const [mode, setMode] = useState<Mode>('setTo');
  const [value, setValue] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<FailureKind | undefined>(undefined);
  // Set ONLY after the server confirms, below the failure return.
  const [confirm, setConfirm] = useState<{ title: string; summary: string } | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  const dismiss = useCallback(() => {
    setConfirm(null);
    // The Record button is disabled once the form clears, so focus would be
    // lost. Returned to the amount field - on fine pointers only, so a phone's
    // keyboard does not pop up.
    if (window.matchMedia('(pointer: fine)').matches) {
      window.setTimeout(() => amountRef.current?.focus({ preventScroll: true }), 0);
    }
  }, []);

  useEffect(() => {
    if (!confirm) return;
    const timer = window.setTimeout(dismiss, HOLD_MS);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss(); };
    document.addEventListener('keydown', onKey);
    return () => { window.clearTimeout(timer); document.removeEventListener('keydown', onKey); };
  }, [confirm, dismiss]);

  const account = active.find((a) => a.id === accountId);
  const currentBalance = balancesByAccount[accountId] ?? 0;
  const entered = Number(value);
  const hasValue = value.trim() !== '' && Number.isFinite(entered);
  const delta = !hasValue ? 0 : mode === 'setTo' ? entered - currentBalance : entered;
  const resulting = currentBalance + delta;

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);

    // Read at submit time, not held in state. An adjustment is always dated
    // today, and a value captured at mount would still be yesterday's on a
    // card left open past midnight.
    const result = await callAction(() => createBalanceAdjustmentAction({
      accountId,
      delta,
      description,
      date: todayDateString(),
    }));

    setSaving(false);
    if (!result.ok) { setError(translateActionError(d, locale, result)); setErrorKind(result.kind); return; }

    // Below the failure return. Built from what was ENTERED, before the form
    // clears. In "set to" mode the delta is computed, so it is never shown.
    const name = account?.name ?? '';
    const summary = mode === 'setTo'
      ? t(d.modifyBalance.doneSetTo, { account: name, amount: formatCurrency(entered) })
      : t(d.modifyBalance.doneChangedBy, {
          account: name,
          // A true minus sign (U+2212), as in the field label.
          amount: `${entered < 0 ? '\u2212' : '+'}${formatCurrency(Math.abs(entered))}`,
        });
    setConfirm({ title: d.modifyBalance.done, summary });
    setValue('');
    setDescription('');
  };

  return (
    <div className="card pb-settings-card" style={{ position: 'relative' }}>
      {saving && <LoadingOverlay label={d.modifyBalance.saving} />}

      {/* inert while the confirmation shows: no focus, no clicks, hidden from
          assistive tech. It stays mounted so the card keeps its height. */}
      <div inert={confirm !== null} className="pb-settings-adjust">
        <SectionHeader icon={Scale} title={d.modifyBalance.title} subtitle={d.modifyBalance.blurb} />

        {/* The picker and the chosen account's balance read as one unit: the
            figure sits on the same soft band, right under the name.
            Was a button row. Same list (active only), same default (active[0]),
            so a dropdown removes no safety step - something is always selected. */}
        <div className="pb-settings-adjust-pick">
          <SelectField
            value={accountId}
            onChange={setAccountId}
            options={accountOptions}
            disabled={accountOptions.length === 0}
            ariaLabel={d.modifyBalance.account}
          />
          <div className="pb-settings-adjust-now">
            {/* Chinese drops the space between the account name and the noun,
                which is why this is a template rather than concatenation. */}
            <span>{t(d.modifyBalance.balanceNow, { account: account?.name ?? '' })}</span>
            <span className="font-mono-tab pb-settings-adjust-now-amt">{formatCurrency(currentBalance)}</span>
          </div>
        </div>

        {/* The kit radiogroup in place of two pills: same two choices, same
            stored mode, plus arrow keys and a sliding thumb. */}
        <SegmentedControl<Mode>
          options={[
            { value: 'setTo', label: d.modifyBalance.setTo },
            { value: 'changeBy', label: d.modifyBalance.changeBy },
          ]}
          value={mode} onChange={setMode} ariaLabel={d.modifyBalance.title} fullWidth
        />

        <label style={labelStyle}>
          {mode === 'setTo' ? d.modifyBalance.newBalance : d.modifyBalance.changeByLabel}
          <div style={{ position: 'relative' }}>
            {/* Stays '$' in every locale: real US dollars. */}
            <span className="font-display" style={bigDollarStyle}>$</span>
            <AmountInput allowNegative
              ref={amountRef}
              value={value}
              onValueChange={setValue}
              placeholder="0.00" className="font-mono-tab" style={bigAmountStyle}
            />
          </div>
        </label>

        <label style={labelStyle}>
          <span>{d.modifyBalance.note} <span style={{ opacity: 0.7 }}>{d.modifyBalance.optional}</span></span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={d.modifyBalance.notePlaceholder}
            style={{ ...inputStyle, textAlign: 'left' }}
          />
        </label>

        {/* Before -> after, with the change itself as a signed chip (an arrow
            as well as pine / wine, so colour is never the only signal). */}
        {hasValue && delta !== 0 && (
          <div className="pb-settings-adjust-preview">
            <span className="pb-settings-adjust-preview-label">{d.modifyBalance.adjustment}</span>
            <DeltaChip
              delta={delta} good="up" money
              text={`${delta > 0 ? '+' : '\u2212'}${formatCurrency(Math.abs(delta))}`}
            />
            <span className="pb-settings-adjust-flow">
              <span className="font-mono-tab pb-settings-adjust-before">{formatCurrency(currentBalance)}</span>
              <ArrowRight size={14} aria-hidden="true" />
              <span className="pb-settings-adjust-after">
                <span className="pb-settings-adjust-after-label">{d.ux.settings.balanceAfter}</span>
                <span className="font-mono-tab" style={{ color: delta > 0 ? 'var(--pine)' : 'var(--wine)' }}>{formatCurrency(resulting)}</span>
              </span>
            </span>
          </div>
        )}

        <ActionError message={error} kind={errorKind} onRetry={handleSave} busy={saving} />

        <button
          onClick={handleSave} disabled={saving || !hasValue || delta === 0}
          className="btn-primary"
          style={{ alignSelf: 'flex-start', padding: '0.65rem 1.1rem', opacity: saving || !hasValue || delta === 0 ? 0.6 : 1 }}
        >
          {saving ? d.common.saving : d.modifyBalance.record}
        </button>
      </div>

      {confirm && (
        <div className="pb-inline-done" role="status" onClick={dismiss}>
          <div className="goal-step" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem', textAlign: 'center' }}>
            <span
              className="goal-done-badge"
              style={{ width: 44, height: 44, borderRadius: '50%', backgroundColor: 'var(--pine)', color: 'var(--paper)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 18px -6px var(--pine)' }}
            >
              <Check size={22} />
            </span>
            <p className="font-display" style={{ fontSize: '1.15rem', fontWeight: 600, margin: 0 }}>{confirm.title}</p>
            <p style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', margin: 0 }}>{confirm.summary}</p>
          </div>
        </div>
      )}
    </div>
  );
}
