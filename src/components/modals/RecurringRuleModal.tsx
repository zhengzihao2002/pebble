'use client';

import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import {
  createRecurringRuleAction,
  deleteRecurringRuleAction,
  getCategoriesAction,
  getAccountsAction,
  updateRecurringRuleAction,
} from '@/lib/actions/pebble';
import { callAction } from '@/lib/actions/callAction';
import type { FailureKind } from '@/lib/actions/failureKind';
import { ActionError } from '@/components/shared/ActionError';
import { NoAccountsNotice } from '@/components/shared/NoAccountsNotice';
import { TitleDescriptionFields } from '@/components/shared/TitleDescriptionFields';
import { composeDescription, descriptionTitle, parseDescription, resolveEditedDescription } from '@/lib/transactionDescription';
import { LoadingOverlay } from '@/components/shared/Spinner';
import { ModalFrame } from '@/components/shared/ModalFrame';
import { ModalCloseButton } from '@/components/shared/ModalCloseButton';
import { SaveSuccess } from '@/components/shared/SaveSuccess';
import { AmountInput } from '@/components/shared/AmountInput';
import { SelectField, type SelectFieldOption } from '@/components/shared/SelectField';
import { resolveCategoryIcon } from '@/lib/data/icons';
import { formatCurrency } from '@/lib/format';
import { todayInZone } from '@/lib/recurring/occurrences';
import { resolveBrowserTimeZone } from '@/lib/time/timeZone';
import { useTimeZoneOverride } from '@/lib/time/TimeZoneOverrideContext';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { translateActionError } from '@/lib/i18n/actionErrors';
import type { CategoryItem, Account } from '@/lib/data/mappers';
import type {
  RecurringEndMode,
  RecurringFrequency,
  RecurringKind,
  RecurringRule,
} from '@/types';

interface RecurringRuleModalProps {
  onClose: () => void;
  /** Absent means "add"; present means "edit that rule". One form, as GoalModal does. */
  rule?: RecurringRule;
  /** Starting values for a NEW schedule (Insights' possible subscription). Ignored when editing. */
  prefill?: { description: string; category: string; accountId: string; amount: number; startDate: string };
}

type Mode = 'form' | 'confirmDelete';

// ⚠️ VALUES ONLY. Every entry is a CHECK-constrained column value in
// recurring_rule. The ORDER here is the order of the control, and it is not
// derived from the dictionary, so a translation can never reorder it.
const FREQUENCY_VALUES: RecurringFrequency[] = ['once', 'weekly', 'biweekly', 'monthly', 'yearly'];
const END_MODE_VALUES: RecurringEndMode[] = ['never', 'after', 'on'];

/** A row of buttons for a small fixed choice. value stays the stored literal. */
function Segmented<T extends string>({ options, value, onChange, disabled }: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: 'flex', gap: '0.4rem' }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value} type="button" aria-pressed={on} disabled={disabled} onClick={() => onChange(o.value)}
            style={{
              flex: 1, minWidth: 0, padding: '0.6rem 0.5rem', borderRadius: '0.6rem', fontSize: '0.85rem', fontWeight: 500,
              border: on ? '1px solid var(--pine)' : '1px solid var(--line)',
              backgroundColor: on ? 'var(--pine)' : 'transparent',
              color: on ? 'var(--paper)' : 'var(--ink-soft)',
              opacity: disabled && !on ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer',
              outlineOffset: 2,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function RecurringRuleModal({ onClose, rule, prefill: rawPrefill }: RecurringRuleModalProps) {
  const prefill = rule ? undefined : rawPrefill;
  const { d, locale } = useTranslation();
  const isEdit = rule !== undefined;
  const timeZoneOverride = useTimeZoneOverride();
  // Stored override wins; otherwise the browser's own zone.
  const today = todayInZone(timeZoneOverride ?? resolveBrowserTimeZone());

  const [mode, setMode] = useState<Mode>('form');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveErrorKind, setSaveErrorKind] = useState<FailureKind | undefined>(undefined);
  // Snapshot taken when the save confirms: only what the person entered.
  const [saved, setSaved] = useState<{ title: string; amount: number } | null>(null);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  const [kind, setKind] = useState<RecurringKind>(rule?.kind ?? 'expense');
  // The rule's stored description, split once for the two fields. An edit
  // that leaves both untouched sends this exact string back.
  const initialParts = parseDescription(rule?.description ?? prefill?.description ?? '');
  const [title, setTitle] = useState(initialParts.title);
  const [description, setDescription] = useState(initialParts.description);
  const [category, setCategory] = useState(rule?.category ?? prefill?.category ?? '');
  const [tag, setTag] = useState(rule?.tag ?? '');
  // Account ID, not name: names are user data and can repeat.
  const [accountId, setAccountId] = useState(rule?.accountId ?? prefill?.accountId ?? '');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountError, setAccountError] = useState<string | null>(null);
  // Distinguishes 'none yet loaded' from 'the user has no accounts'.
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  // Stored negative for expenses; the form works in positive magnitude and
  // the action re-applies the sign.
  const [amount, setAmount] = useState(rule ? String(Math.abs(rule.amount)) : prefill ? String(prefill.amount) : '');
  const [grossAmount, setGrossAmount] = useState(rule?.grossAmount != null ? String(rule.grossAmount) : '');
  const [frequency, setFrequency] = useState<RecurringFrequency>(rule?.frequency ?? 'monthly');
  const [startDate, setStartDate] = useState(rule?.startDate ?? prefill?.startDate ?? today);
  const [endMode, setEndMode] = useState<RecurringEndMode>(rule?.endMode ?? 'never');
  const [endCount, setEndCount] = useState(rule?.endCount != null ? String(rule.endCount) : '');
  const [endDate, setEndDate] = useState(rule?.endDate ?? '');
  const [backfill, setBackfill] = useState(false);

  useEffect(() => {
    let cancelled = false;
    callAction(getCategoriesAction, d.addTxn.categoriesFailed).then((result) => {
      if (cancelled) return;
      if (!result.ok) { setCategoryError(translateActionError(d, locale, result)); return; }
      setCategories(result.categories);
      setCategoryError(null);
      // Only default the picker when adding - never overwrite an edited rule's
      // category, and never clobber a choice the user has already made.
      setCategory((current) => current || result.categories[0]?.name || '');
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    callAction(getAccountsAction, d.addTxn.accountsFailed).then((result) => {
      if (cancelled) return;
      if (!result.ok) { setAccountError(translateActionError(d, locale, result)); return; }
      setAccounts(result.accounts);
      setAccountError(null);
      setAccountsLoaded(true);
      // ⚠️ CREATE ONLY. An existing rule keeps the account it was saved with,
      // always.
      if (!isEdit) {
        const preferred = result.accounts.find((a) => a.isPreferred);
        setAccountId((current) => current || preferred?.id || result.accounts[0]?.id || '');
      }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inputStyle: React.CSSProperties = { padding: '0.6rem 0.75rem', borderRadius: '0.6rem', border: '1px solid var(--line)', fontSize: '0.9rem', color: 'var(--ink)', backgroundColor: 'var(--paper)', boxSizing: 'border-box', width: '100%' };
  const labelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.8rem', color: 'var(--ink-soft)', minWidth: 0 };
  const hintStyle: React.CSSProperties = { fontSize: '0.73rem', color: 'var(--ink-soft)', lineHeight: 1.45, margin: 0 };
  // Same height, allowed to shrink, no native date styling: iOS Safari sizes
  // type="date" by itself and overflows its cell otherwise.
  const rowInputStyle: React.CSSProperties = { ...inputStyle, minWidth: 0, maxWidth: '100%', height: '2.6rem', textAlign: 'left', WebkitAppearance: 'none', appearance: 'none' };
  const prefixStyle: React.CSSProperties = { position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-soft)', fontSize: '0.9rem' };
  const twoCol: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem' };

  // Icons resolved here on the client from iconKey. label === value
  // deliberately: category names are USER DATA and are never translated.
  const categoryOptions: SelectFieldOption[] = categories.map((c) => ({
    value: c.name,
    label: c.name,
    icon: resolveCategoryIcon(c.iconKey),
    color: c.color,
  }));
  const incomeCategoryOptions: SelectFieldOption[] = [
    { value: 'Standard Income', label: d.enums.incomeCategory['Standard Income'] },
    { value: 'Side Cash', label: d.enums.incomeCategory['Side Cash'] },
  ];
  // Account names are USER DATA and are never translated.
  // Credit cards take charges only: offered for expense schedules alone.
  const accountOptions: SelectFieldOption[] = accounts.filter((a) => kind === 'expense' || a.kind !== 'credit').map((a) => ({
    value: a.id,
    label: a.last4 ? `${a.name} ····${a.last4}` : a.name,
  }));
  const frequencyOptions: SelectFieldOption[] = FREQUENCY_VALUES.map((v) => ({ value: v, label: d.recurring.frequencies[v] }));

  // Each sentence is its own key, chosen by kind (Chinese cannot take a noun
  // in that position).
  const isIncome = kind === 'income';
  const titleText = isEdit
    ? (isIncome ? d.recurring.titleEditIncome : d.recurring.titleEditExpense)
    : (isIncome ? d.recurring.titleNewIncome : d.recurring.titleNewExpense);
  const deleteConfirmText = isIncome ? d.recurring.deleteConfirmIncome : d.recurring.deleteConfirmExpense;

  const isPastStart = startDate < today;
  const showBackfill = !isEdit && isPastStart && frequency !== 'once';

  // Nothing changed means nothing to save. Comparisons match how each field
  // is STORED, not how the form holds it: expense amounts are negative in the
  // database but positive here, and tag is null there but '' here.
  const outgoingDescription = rule
    ? resolveEditedDescription(rule.description, title, description)
    : composeDescription(title, description);

  const dirty = !isEdit || !rule || (
    outgoingDescription.trim() !== rule.description ||
    category !== rule.category ||
    (kind === 'expense' ? (tag.trim() || null) : null) !== rule.tag ||
    accountId !== rule.accountId ||
    Number(amount) !== Math.abs(rule.amount) ||
    (kind === 'income' ? Number(grossAmount) : null) !== rule.grossAmount ||
    frequency !== rule.frequency ||
    startDate !== rule.startDate ||
    endMode !== rule.endMode ||
    (endMode === 'after' ? Number(endCount) : null) !== rule.endCount ||
    (endMode === 'on' ? endDate : null) !== rule.endDate
  );

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    // Also reached from Try again, past the native required check.
    if (saving || !title.trim() || !accountId) return;
    setSaving(true);
    setSaveError(null);

    // Every value below is the stored English literal, taken straight from
    // state. No label ever reaches this payload.
    const payload = {
      kind,
      description: outgoingDescription.trim(),
      category,
      tag: kind === 'expense' ? tag.trim() || undefined : undefined,
      accountId,
      amount: Number(amount),
      grossAmount: kind === 'income' ? Number(grossAmount) : undefined,
      frequency,
      startDate,
      endMode,
      endCount: endMode === 'after' ? Number(endCount) : null,
      endDate: endMode === 'on' ? endDate : null,
    };

    const result = rule
      ? await callAction(() => updateRecurringRuleAction({ ...payload, id: rule.id }))
      : await callAction(() => createRecurringRuleAction({ ...payload, backfill: showBackfill && backfill }));

    setSaving(false);
    if (!result.ok) {
      setSaveError(translateActionError(d, locale, result));
      setSaveErrorKind(result.kind);
      return;
    }
    setSaved({ title: title.trim(), amount: Number(amount) });
  };

  const handleDelete = async (close: () => void) => {
    if (!rule || saving) return;
    setSaving(true);
    setSaveError(null);
    const result = await callAction(() => deleteRecurringRuleAction({ id: rule.id }));
    setSaving(false);
    if (!result.ok) {
      setSaveError(translateActionError(d, locale, result));
      setSaveErrorKind(result.kind);
      return;
    }
    // Quiet: no confirmation for a delete. Closed after saving has cleared.
    window.setTimeout(close, 0);
  };

  return (
    <ModalFrame onClose={onClose} busy={saving} labelledBy="rule-modal-title" maxWidth={640}>
      {(close) => (
      <>
        {saving && <LoadingOverlay label={mode === 'confirmDelete' ? d.recurring.deletingSchedule : d.recurring.savingSchedule} />}

        <div className="pb-modal-head">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 id="rule-modal-title" className="font-display" style={{ fontSize: '1.2rem', fontWeight: 600 }}>{titleText}</h2>
            <ModalCloseButton onClick={close} disabled={saving} />
          </div>
        </div>

        {saved ? (
          <div className="pb-modal-body">
            <SaveSuccess
              title={isEdit ? d.recurring.savedTitleEdit : d.recurring.savedTitleAdd}
              body={`${saved.title} · ${formatCurrency(saved.amount)}`}
              onDone={close}
            />
          </div>
        ) : mode === 'confirmDelete' ? (
          <>
            <div className="pb-modal-body themed-scroll">
              <p style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem' }}>{deleteConfirmText}</p>
              <p style={{ fontSize: '0.83rem', color: 'var(--ink-soft)', lineHeight: 1.5 }}>
                {/* The rule's own description is USER DATA and leads the
                    sentence in both languages, so the remainder is one key. */}
                <strong style={{ color: 'var(--ink)' }}>{descriptionTitle(rule?.description ?? '')}</strong> {d.recurring.deleteBody}
              </p>
            </div>
            <div className="pb-modal-foot">
              <ActionError message={saveError} kind={saveErrorKind} onRetry={() => void handleDelete(close)} busy={saving} />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" onClick={() => { setMode('form'); setSaveError(null); }} disabled={saving} className="pill" style={{ flex: 1, padding: '0.6rem' }}>{d.recurring.keepIt}</button>
                <button type="button" onClick={() => void handleDelete(close)} disabled={saving} className="btn-primary" style={{ flex: 1, padding: '0.6rem', backgroundColor: 'var(--wine)', opacity: saving ? 0.6 : 1 }}>
                  {saving ? d.recurring.deleting : d.recurring.delete}
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="pb-modal-body themed-scroll" style={{ overflowX: 'hidden' }}>
              <form id="rule-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={labelStyle}>
                  <span>{d.recurring.type}</span>
                  {/* Expense history lives in `expense`, income in `income`.
                      Switching would orphan every row already created, so the
                      action rejects it and the control is locked when editing. */}
                  <Segmented<RecurringKind>
                    value={kind}
                    disabled={isEdit}
                    onChange={(next) => {
                      setKind(next);
                      // A card cannot hold income: move the choice to an allowed account.
                      if (next === 'income' && accounts.find((a) => a.id === accountId)?.kind === 'credit') {
                        const usable = accounts.filter((a) => a.kind !== 'credit');
                        setAccountId(usable.find((a) => a.isPreferred)?.id ?? usable[0]?.id ?? '');
                      }
                      setCategory(next === 'income' ? 'Standard Income' : categories[0]?.name ?? '');
                    }}
                    options={[
                      { value: 'expense', label: d.enums.kind.expense },
                      { value: 'income', label: d.enums.kind.income },
                    ]}
                  />
                  {isEdit && <p style={hintStyle}>{d.recurring.typeLocked}</p>}
                </div>

                <label style={labelStyle}>
                  {isIncome ? d.recurring.netAmount : d.recurring.amount}
                  <div style={{ position: 'relative' }}>
                    {/* Stays '$' in every locale - the user's real US dollars. */}
                    <span className="font-display" style={{ ...prefixStyle, left: 14, fontSize: '1.5rem' }}>$</span>
                    <AmountInput
                      value={amount} onValueChange={setAmount} placeholder="0.00" required
                      className="font-mono-tab"
                      style={{ ...inputStyle, padding: '0.8rem 0.9rem 0.8rem 2.2rem', borderRadius: '0.8rem', fontSize: '1.6rem', fontWeight: 600 }}
                    />
                  </div>
                  {isIncome && <p style={hintStyle}>{d.recurring.netHint}</p>}
                </label>

                {isIncome && (
                  <label style={labelStyle}>
                    {d.recurring.grossAmount}
                    <div style={{ position: 'relative' }}>
                      <span style={prefixStyle}>$</span>
                      <AmountInput value={grossAmount} onValueChange={setGrossAmount} placeholder="0.00" required className="font-mono-tab" style={{ ...inputStyle, paddingLeft: '1.6rem' }} />
                    </div>
                  </label>
                )}

                <TitleDescriptionFields
                  title={title}
                  description={description}
                  onTitleChange={setTitle}
                  onDescriptionChange={setDescription}
                  inputStyle={inputStyle}
                  labelStyle={labelStyle}
                  optionalLabel={d.txnDetail.optional}
                  titlePlaceholder={isIncome ? d.recurring.descriptionPlaceholderIncome : d.recurring.descriptionPlaceholderExpense}
                />

                <div style={twoCol}>
                  {/* A div, not a label: <label> forwards clicks to its control. */}
                  <div style={labelStyle}>
                    <span>{d.recurring.category}</span>
                    {isIncome ? (
                      /* ⚠️ Matched as string literals by isSideCash() and the
                          income filters in stats.ts. */
                      <SelectField value={category} onChange={setCategory} options={incomeCategoryOptions} placeholder={d.select.choose} ariaLabel={d.recurring.category} />
                    ) : (
                      <SelectField
                        value={category}
                        onChange={setCategory}
                        options={categoryOptions}
                        placeholder={categoryError ? d.select.unavailable : d.select.searchCategories}
                        disabled={categoryOptions.length === 0}
                        ariaLabel={d.recurring.category}
                      />
                    )}
                    {!isIncome && categoryError && <p style={{ ...hintStyle, color: 'var(--wine)' }}>{categoryError}</p>}
                  </div>

                  {!isIncome && (
                    <label style={labelStyle}>
                      <span>{d.recurring.tag} <span style={{ opacity: 0.7 }}>{d.recurring.tagHint}</span></span>
                      <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder={d.recurring.tagPlaceholder} style={inputStyle} />
                    </label>
                  )}
                </div>

                <div style={twoCol}>
                  <div style={labelStyle}>
                    <span>{isIncome ? d.recurring.paidInto : d.recurring.paidFrom}</span>
                    <SelectField
                      value={accountId} onChange={setAccountId} options={accountOptions}
                      placeholder={accountError ?? d.select.choose}
                      disabled={accountOptions.length === 0}
                      ariaLabel={isIncome ? d.recurring.paidInto : d.recurring.paidFrom}
                    />
                    {accountsLoaded && accounts.length === 0 && <NoAccountsNotice onNavigate={onClose} />}
                  </div>

                  <div style={labelStyle}>
                    <span>{d.recurring.frequency}</span>
                    <SelectField
                      value={frequency} onChange={(v) => setFrequency(v as RecurringFrequency)} options={frequencyOptions}
                      placeholder={d.select.choose} ariaLabel={d.recurring.frequency}
                    />
                  </div>
                </div>

                <label style={labelStyle}>
                  {frequency === 'once' ? d.recurring.dateOnce : d.recurring.startsOn}
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required style={rowInputStyle} />
                  {(frequency === 'monthly' || frequency === 'yearly') && <p style={hintStyle}>{d.recurring.monthEndHint}</p>}
                </label>

                {frequency !== 'once' && (
                  <div style={labelStyle}>
                    <span>{d.recurring.ends}</span>
                    <Segmented<RecurringEndMode>
                      value={endMode} onChange={setEndMode}
                      options={END_MODE_VALUES.map((v) => ({ value: v, label: d.recurring.endModes[v] }))}
                    />
                  </div>
                )}

                {frequency !== 'once' && endMode === 'after' && (
                  <label style={labelStyle}>
                    {d.recurring.endCount}
                    <input type="number" min="1" step="1" value={endCount} onChange={(e) => setEndCount(e.target.value)} placeholder={d.recurring.endCountPlaceholder} required className="font-mono-tab" style={rowInputStyle} />
                  </label>
                )}

                {frequency !== 'once' && endMode === 'on' && (
                  <label style={labelStyle}>
                    {d.recurring.endDate}
                    <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} required style={rowInputStyle} />
                  </label>
                )}

                {showBackfill && (
                  <div style={{ border: '1px solid var(--line)', borderRadius: '0.6rem', padding: '0.8rem' }}>
                    <label style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', fontSize: '0.83rem', cursor: 'pointer' }}>
                      <input type="checkbox" checked={backfill} onChange={(e) => setBackfill(e.target.checked)} style={{ marginTop: 2, flexShrink: 0 }} />
                      <span>
                        {d.recurring.backfillLabel}
                        <span style={{ ...hintStyle, display: 'block', marginTop: 3 }}>{d.recurring.backfillHint}</span>
                      </span>
                    </label>
                  </div>
                )}
              </form>
            </div>

            <div className="pb-modal-foot">
              <ActionError message={saveError} kind={saveErrorKind} onRetry={() => void handleSubmit()} busy={saving} />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {isEdit && (
                  <button type="button" onClick={() => { setMode('confirmDelete'); setSaveError(null); }} disabled={saving} className="pill" style={{ padding: '0.72rem 1rem', color: 'var(--wine)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Trash2 size={14} />{d.recurring.delete}
                  </button>
                )}
                <button type="submit" form="rule-form" disabled={saving || !dirty} className="btn-primary" style={{ flex: 1, padding: '0.72rem', opacity: saving || !dirty ? 0.6 : 1 }}>
                  {saving ? d.common.saving : isEdit ? d.recurring.saveChanges : isIncome ? d.recurring.addIncomeSchedule : d.recurring.addPaymentSchedule}
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
