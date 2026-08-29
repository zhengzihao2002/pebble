'use client';

import { useEffect, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import {
  createRecurringRuleAction,
  deleteRecurringRuleAction,
  getCategoriesAction,
  updateRecurringRuleAction,
} from '@/lib/actions/pebble';
import { callAction } from '@/lib/actions/callAction';
import type { FailureKind } from '@/lib/actions/failureKind';
import { ActionError } from '@/components/shared/ActionError';
import { LoadingOverlay } from '@/components/shared/Spinner';
import { SearchableSelect, type SearchableSelectOption } from '@/components/shared/SearchableSelect';
import { resolveCategoryIcon } from '@/lib/data/icons';
import { todayInZone } from '@/lib/recurring/occurrences';
import { resolveBrowserTimeZone } from '@/lib/time/timeZone';
import { useTimeZoneOverride } from '@/lib/time/TimeZoneOverrideContext';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { translateActionError } from '@/lib/i18n/actionErrors';
import type { CategoryItem } from '@/lib/data/mappers';
import type {
  PaymentMethod,
  RecurringEndMode,
  RecurringFrequency,
  RecurringKind,
  RecurringRule,
} from '@/types';

interface RecurringRuleModalProps {
  onClose: () => void;
  /** Absent means "add"; present means "edit that rule". One form, as GoalModal does. */
  rule?: RecurringRule;
}

type Mode = 'form' | 'confirmDelete';

// ⚠️ VALUES ONLY. Every entry is a CHECK-constrained column value in
// recurring_rule. These arrays are module scope and cannot call a hook, so
// they carry the value and the component looks the label up by it - the same
// arrangement navItems.ts uses.
//
// The ORDER here is the order of the dropdown, and it is not derived from the
// dictionary, so a translation can never reorder a control.
const FREQUENCY_VALUES: RecurringFrequency[] = ['once', 'weekly', 'biweekly', 'monthly', 'yearly'];
const END_MODE_VALUES: RecurringEndMode[] = ['never', 'after', 'on'];

export function RecurringRuleModal({ onClose, rule }: RecurringRuleModalProps) {
  const { d, locale } = useTranslation();
  const isEdit = rule !== undefined;
  const timeZoneOverride = useTimeZoneOverride();
  // Stored override wins; otherwise the browser's own zone, known directly
  // here with no cookie needed.
  const today = todayInZone(timeZoneOverride ?? resolveBrowserTimeZone());

  const [mode, setMode] = useState<Mode>('form');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveErrorKind, setSaveErrorKind] = useState<FailureKind | undefined>(undefined);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  const [kind, setKind] = useState<RecurringKind>(rule?.kind ?? 'expense');
  const [description, setDescription] = useState(rule?.description ?? '');
  const [category, setCategory] = useState(rule?.category ?? '');
  const [tag, setTag] = useState(rule?.tag ?? '');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(rule?.paymentMethod ?? 'Checking');
  // Stored negative for expenses; the form always works in positive magnitude
  // and the action re-applies the sign.
  const [amount, setAmount] = useState(rule ? String(Math.abs(rule.amount)) : '');
  const [grossAmount, setGrossAmount] = useState(rule?.grossAmount != null ? String(rule.grossAmount) : '');
  const [frequency, setFrequency] = useState<RecurringFrequency>(rule?.frequency ?? 'monthly');
  const [startDate, setStartDate] = useState(rule?.startDate ?? today);
  const [endMode, setEndMode] = useState<RecurringEndMode>(rule?.endMode ?? 'never');
  const [endCount, setEndCount] = useState(rule?.endCount != null ? String(rule.endCount) : '');
  const [endDate, setEndDate] = useState(rule?.endDate ?? '');
  const [backfill, setBackfill] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // A failure here used to return silently, leaving an empty category
    // dropdown with no explanation. Surfaced instead.
    callAction(getCategoriesAction, d.addTxn.categoriesFailed).then((result) => {
      if (cancelled) return;
      if (!result.ok) { setCategoryError(translateActionError(d, locale, result)); return; }
      setCategories(result.categories);
      setCategoryError(null);
      // Only default the picker when adding - never overwrite an edited rule's
      // category, and never clobber a choice the user has already made.
      setCategory((current) => current || result.categories[0]?.name || '');
    });
    return () => {
      cancelled = true;
    };
    // Deliberately empty: refetching categories because the language changed
    // would be pointless work, and a message already on screen stays in the
    // language it was raised in until the next attempt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inputStyle: React.CSSProperties = { padding: '0.6rem 0.75rem', borderRadius: '0.6rem', border: '1px solid var(--line)', fontSize: '0.9rem', color: 'var(--ink)', backgroundColor: 'var(--paper)', boxSizing: 'border-box', width: '100%' };
  const labelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.8rem', color: 'var(--ink-soft)' };
  const hintStyle: React.CSSProperties = { fontSize: '0.73rem', color: 'var(--ink-soft)', lineHeight: 1.45, margin: 0 };

  // Icons resolved here on the client from iconKey - they cannot cross the
  // RSC boundary. label === value deliberately: category names are USER DATA
  // and are never translated.
  const categoryOptions: SearchableSelectOption[] = categories.map((c) => ({
    value: c.name,
    label: c.name,
    icon: resolveCategoryIcon(c.iconKey),
    color: c.color,
  }));

  // Was a noun spliced into three sentences. Chinese cannot take a noun in
  // that position - 定期收入 and 定期支出 are compounds - so each sentence is
  // its own key, chosen by kind.
  const isIncome = kind === 'income';
  const titleText = isEdit
    ? (isIncome ? d.recurring.titleEditIncome : d.recurring.titleEditExpense)
    : (isIncome ? d.recurring.titleNewIncome : d.recurring.titleNewExpense);
  const deleteConfirmText = isIncome ? d.recurring.deleteConfirmIncome : d.recurring.deleteConfirmExpense;

  const isPastStart = startDate < today;
  const showBackfill = !isEdit && isPastStart && frequency !== 'once';

  // A write in flight must not be cancellable - see AddTransactionModal.
  const requestClose = () => { if (saving) return; onClose(); };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (saving) return;
    setSaving(true);
    setSaveError(null);

    // Every value below is the stored English literal, taken straight from
    // state. No label ever reaches this payload.
    const payload = {
      kind,
      description: description.trim(),
      category,
      tag: kind === 'expense' ? tag.trim() || undefined : undefined,
      paymentMethod,
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
    onClose();
  };

  const handleDelete = async () => {
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
    onClose();
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,20,18,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 50, overflowY: 'auto' }}
      onClick={requestClose}
    >
      {/* position: relative so LoadingOverlay - which pins to its nearest
          positioned ancestor - covers this card rather than escaping to the
          viewport. Capped at the viewport with the fields scrolling INSIDE, so
          the card itself never scrolls: a scrolling card would slide the
          overlay away from the visible region, since it pins with inset: 0.
          dvh, not vh: mobile browser chrome makes vh overshoot. */}
      <div className="card" style={{ padding: '1.75rem', width: '100%', maxWidth: 440, boxSizing: 'border-box', margin: '1rem 0', position: 'relative', display: 'flex', flexDirection: 'column', maxHeight: 'calc(100dvh - 4rem)' }} onClick={(e) => e.stopPropagation()}>
        {saving && <LoadingOverlay label={mode === 'confirmDelete' ? d.recurring.deletingSchedule : d.recurring.savingSchedule} />}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.3rem', flexShrink: 0 }}>
          <h2 className="font-display" style={{ fontSize: '1.2rem', fontWeight: 600 }}>
            {titleText}
          </h2>
          <button onClick={requestClose} disabled={saving} className="icon-btn" style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', opacity: saving ? 0.4 : 1 }}><X size={18} /></button>
        </div>

        {mode === 'confirmDelete' ? (
          <div style={{ minHeight: 0, overflowY: 'auto' }}>
            <p style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem' }}>{deleteConfirmText}</p>
            <p style={{ fontSize: '0.83rem', color: 'var(--ink-soft)', lineHeight: 1.5, marginBottom: '1.1rem' }}>
              {/* The rule's own description is USER DATA and leads the sentence
                  in both languages, so the remainder is one key. */}
              <strong style={{ color: 'var(--ink)' }}>{rule?.description}</strong> {d.recurring.deleteBody}
            </p>
            <ActionError message={saveError} kind={saveErrorKind} onRetry={handleDelete} busy={saving} style={{ marginBottom: '0.9rem' }} />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" onClick={() => { setMode('form'); setSaveError(null); }} className="pill" style={{ flex: 1, padding: '0.6rem' }}>{d.recurring.keepIt}</button>
              <button type="button" onClick={handleDelete} disabled={saving} className="btn-primary" style={{ flex: 1, padding: '0.6rem', backgroundColor: 'var(--wine)', opacity: saving ? 0.6 : 1 }}>
                {saving ? d.recurring.deleting : d.recurring.delete}
              </button>
            </div>
          </div>
        ) : (
          /* Plain comment, not a JSX one: this is an expression position.
             minHeight: 0 on both the form and the scroller because a flex
             child defaults to min-height: auto and will not shrink below its
             content - without it the cap holds but nothing ever scrolls. */
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1, minHeight: 0 }}>
            {/* overflowY: auto makes overflow-x compute to auto too, which clips
                focus-visible outlines at the edges. Padded on both sides to give
                the outline room, with matching negative margins so the fields
                still line up with the header instead of insetting. */}
            <div className="themed-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem', paddingLeft: '0.35rem', paddingRight: '0.35rem', marginLeft: '-0.35rem', marginRight: '-0.35rem' }}>
              <label style={labelStyle}>
                {d.recurring.type}
                <select
                  value={kind}
                  // Expense history lives in `expense`, income in `income`.
                  // Switching would orphan every row already created, so the
                  // action rejects it and the control is locked when editing.
                  disabled={isEdit}
                  onChange={(e) => {
                    const next = e.target.value as RecurringKind;
                    setKind(next);
                    setCategory(next === 'income' ? 'Standard Income' : categories[0]?.name ?? '');
                  }}
                  style={{ ...inputStyle, opacity: isEdit ? 0.6 : 1 }}
                >
                  {/* value stays the stored literal; only the child text is
                      translated. This is the whole pattern. */}
                  <option value="expense">{d.enums.kind.expense}</option>
                  <option value="income">{d.enums.kind.income}</option>
                </select>
                {isEdit && <p style={hintStyle}>{d.recurring.typeLocked}</p>}
              </label>

              <label style={labelStyle}>
                {d.recurring.description}
                <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={isIncome ? d.recurring.descriptionPlaceholderIncome : d.recurring.descriptionPlaceholderExpense} required style={inputStyle} />
              </label>

              {/* A div, not a label: <label> forwards clicks to its control, so
                  clicking the word "Category" would open the dropdown. Income keeps
                  a native select - a searchable combobox over two fixed options
                  would be worse than what it replaces. */}
              <div style={labelStyle}>
                <span>{d.recurring.category}</span>
                {kind === 'income' ? (
                  <select value={category} onChange={(e) => setCategory(e.target.value)} required style={inputStyle}>
                    {/* ⚠️ Matched as string literals by isSideCash() and the
                        income filters in stats.ts. */}
                    <option value="Standard Income">{d.enums.incomeCategory['Standard Income']}</option>
                    <option value="Side Cash">{d.enums.incomeCategory['Side Cash']}</option>
                  </select>
                ) : (
                  <SearchableSelect
                    value={category}
                    onChange={setCategory}
                    options={categoryOptions}
                    placeholder={categoryError ? d.select.unavailable : d.select.searchCategories}
                    disabled={categoryOptions.length === 0}
                    ariaLabel={d.recurring.category}
                  />
                )}
                {kind === 'expense' && categoryError && (
                  <p style={{ ...hintStyle, color: 'var(--wine)' }}>{categoryError}</p>
                )}
              </div>

              {kind === 'expense' && (
                <label style={labelStyle}>
                  {d.recurring.tag} <span style={{ opacity: 0.7 }}>{d.recurring.tagHint}</span>
                  <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder={d.recurring.tagPlaceholder} style={inputStyle} />
                </label>
              )}

              <label style={labelStyle}>
                {isIncome ? d.recurring.paidInto : d.recurring.paidFrom}
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)} style={inputStyle}>
                  {/* payment_method carries a CHECK constraint - a translated
                      value would fail the insert outright. */}
                  <option value="Checking">{d.enums.paymentMethod.Checking}</option>
                  <option value="Cash">{d.enums.paymentMethod.Cash}</option>
                </select>
              </label>

              {kind === 'income' && (
                <label style={labelStyle}>
                  {d.recurring.grossAmount}
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-soft)', fontSize: '0.9rem' }}>$</span>
                    <input type="number" min="0" step="0.01" value={grossAmount} onChange={(e) => setGrossAmount(e.target.value)} placeholder="0.00" required className="font-mono-tab" style={{ ...inputStyle, paddingLeft: '1.6rem' }} />
                  </div>
                </label>
              )}

              <label style={labelStyle}>
                {isIncome ? d.recurring.netAmount : d.recurring.amount}
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-soft)', fontSize: '0.9rem' }}>$</span>
                  <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" required className="font-mono-tab" style={{ ...inputStyle, paddingLeft: '1.6rem' }} />
                </div>
                {isIncome && <p style={hintStyle}>{d.recurring.netHint}</p>}
              </label>

              <label style={labelStyle}>
                {d.recurring.frequency}
                <select value={frequency} onChange={(e) => setFrequency(e.target.value as RecurringFrequency)} style={inputStyle}>
                  {FREQUENCY_VALUES.map((v) => <option key={v} value={v}>{d.recurring.frequencies[v]}</option>)}
                </select>
              </label>

              <label style={labelStyle}>
                {frequency === 'once' ? d.recurring.dateOnce : d.recurring.startsOn}
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required style={inputStyle} />
                {(frequency === 'monthly' || frequency === 'yearly') && (
                  <p style={hintStyle}>{d.recurring.monthEndHint}</p>
                )}
              </label>

              {frequency !== 'once' && (
                <label style={labelStyle}>
                  {d.recurring.ends}
                  <select value={endMode} onChange={(e) => setEndMode(e.target.value as RecurringEndMode)} style={inputStyle}>
                    {END_MODE_VALUES.map((v) => <option key={v} value={v}>{d.recurring.endModes[v]}</option>)}
                  </select>
                </label>
              )}

              {frequency !== 'once' && endMode === 'after' && (
                <label style={labelStyle}>
                  {d.recurring.endCount}
                  <input type="number" min="1" step="1" value={endCount} onChange={(e) => setEndCount(e.target.value)} placeholder={d.recurring.endCountPlaceholder} required className="font-mono-tab" style={inputStyle} />
                </label>
              )}

              {frequency !== 'once' && endMode === 'on' && (
                <label style={labelStyle}>
                  {d.recurring.endDate}
                  <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} required style={inputStyle} />
                </label>
              )}

              {showBackfill && (
                <div style={{ border: '1px solid var(--line)', borderRadius: '0.6rem', padding: '0.8rem' }}>
                  <label style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', fontSize: '0.83rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={backfill} onChange={(e) => setBackfill(e.target.checked)} style={{ marginTop: 2, flexShrink: 0 }} />
                    <span>
                      {d.recurring.backfillLabel}
                      <p style={{ ...hintStyle, marginTop: 3 }}>{d.recurring.backfillHint}</p>
                    </span>
                  </label>
                </div>
              )}

            </div>

            {/* Outside the scroller: an error rendered at the bottom of a long
                scrolled form, with its Try again button, would be unreachable. */}
            <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <ActionError message={saveError} kind={saveErrorKind} onRetry={() => void handleSubmit()} busy={saving} />

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {isEdit && (
                  <button type="button" onClick={() => { setMode('confirmDelete'); setSaveError(null); }} className="pill" style={{ padding: '0.72rem 1rem', color: 'var(--wine)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Trash2 size={14} />{d.recurring.delete}
                  </button>
                )}
                <button type="submit" disabled={saving} className="btn-primary" style={{ flex: 1, padding: '0.72rem', opacity: saving ? 0.6 : 1 }}>
                  {saving ? d.common.saving : isEdit ? d.recurring.saveChanges : isIncome ? d.recurring.addIncomeSchedule : d.recurring.addPaymentSchedule}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
