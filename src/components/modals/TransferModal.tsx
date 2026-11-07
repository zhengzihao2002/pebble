'use client';

import { AmountInput } from '@/components/shared/AmountInput';
import { useEffect, useMemo, useState } from 'react';
import Link from '@/components/loading/PendingLink';
import { ArrowRight, Coins, Landmark } from 'lucide-react';
import { LoadingOverlay, Spinner } from '@/components/shared/Spinner';
import { SelectField, type SelectFieldOption } from '@/components/shared/SelectField';
import { ModalFrame } from '@/components/shared/ModalFrame';
import { ModalCloseButton } from '@/components/shared/ModalCloseButton';
import { SaveSuccess } from '@/components/shared/SaveSuccess';
import { createTransferAction, getAccountsAction } from '@/lib/actions/pebble';
import { callAction } from '@/lib/actions/callAction';
import type { FailureKind } from '@/lib/actions/failureKind';
import { ActionError } from '@/components/shared/ActionError';
import { NoAccountsNotice } from '@/components/shared/NoAccountsNotice';
import { TitleDescriptionFields } from '@/components/shared/TitleDescriptionFields';
import { composeDescription } from '@/lib/transactionDescription';
import type { Account } from '@/lib/data/mappers';
import { formatCurrency, todayDateString } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { translateActionError } from '@/lib/i18n/actionErrors';

interface TransferModalProps {
  onClose: () => void;
  /** Preselect this account as From (the Accounts page's "Transfer from this
      account"). Ignored when it cannot send. Default: the preferred account. */
  initialFromId?: string;
  /** accountId -> balance today, from a page that already has them. When
      given, each side shows its balance now and after this transfer. */
  balances?: Record<string, number>;
}

const FORM_ID = 'transfer-form';

/** The amount as entered, when it is a positive number; else 0. */
const amountValidNumber = (v: string) => {
  const n = Number(v);
  return v.trim() !== '' && Number.isFinite(n) && n > 0 ? n : 0;
};

const inputStyle: React.CSSProperties = {
  padding: '0.6rem 0.75rem', borderRadius: '0.6rem', border: '1px solid var(--line)',
  fontSize: '0.9rem', color: 'var(--ink)', backgroundColor: 'var(--paper)',
  boxSizing: 'border-box', width: '100%',
};
const labelStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: '0.35rem',
  fontSize: '0.8rem', color: 'var(--ink-soft)',
};
// Same amount field as Add Transaction: the figure is what this form is for.
const bigAmountStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '0.8rem 0.9rem 0.8rem 2.2rem', borderRadius: '0.8rem', border: '1px solid var(--line)', fontSize: '1.6rem', fontWeight: 600, color: 'var(--ink)', backgroundColor: 'var(--paper)' };
const bigDollarStyle: React.CSSProperties = { position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: '1.5rem', color: 'var(--ink-soft)' };

/**
 * Moves money between two accounts.
 *
 * Recorded as two balance_adjustment rows, so it never reaches Reports: a
 * transfer is neither spending nor income, and counting it as either would
 * inflate both sides of every total. The pair sums to zero, so the user's
 * total balance cannot move - only its distribution.
 *
 * Both accounts must be active; hibernated accounts take no new activity.
 *
 * LAYOUT. From and To are two equal blocks with an arrow badge between them.
 * Wide card: side by side, arrow points right. Narrow: stacked, arrow points
 * down. One icon, rotated by the same container query that sets the layout.
 * Head (title, close) and foot (error, submit) never scroll.
 */
export function TransferModal({ onClose, initialFromId, balances }: TransferModalProps) {
  const { d, t, locale } = useTranslation();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountError, setAccountError] = useState<string | null>(null);
  // Distinguishes 'none yet loaded' from 'the user has no accounts'.
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayDateString());
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<FailureKind | undefined>(undefined);
  // Set ONLY after the server confirms. A snapshot of what was entered, so the
  // confirmation cannot change when the page re-renders underneath.
  const [success, setSuccess] = useState<{ title: string; summary: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    callAction(getAccountsAction, d.addTxn.accountsFailed).then((result) => {
      if (cancelled) return;
      if (!result.ok) { setAccountError(translateActionError(d, locale, result)); return; }
      setAccounts(result.accounts);
      setAccountError(null);
      setAccountsLoaded(true);
      // Preferred account as the source, since money usually leaves the
      // account the user treats as primary.
      // Cards never take part in a transfer, and the server refuses
      // hibernated accounts, so the first picks skip both.
      const usable = result.accounts.filter((a) => a.kind !== 'credit' && a.status === 'active');
      const asked = initialFromId ? usable.find((a) => a.id === initialFromId) : undefined;
      const preferred = asked ?? usable.find((a) => a.isPreferred);
      setFromId((c) => c || preferred?.id || usable[0]?.id || '');
      setToId((c) => c || usable.find((a) => a.id !== (preferred?.id ?? usable[0]?.id))?.id || '');
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const options = useMemo<SelectFieldOption[]>(
    // Credit cards never send or receive transfers. Hibernated accounts take
    // no new activity - the server refuses them - so they are listed last and
    // labelled, and choosing one says why before Transfer is pressed rather
    // than failing after it.
    () => {
      const usable = accounts.filter((a) => a.kind !== 'credit');
      return [...usable.filter((a) => a.status === 'active'), ...usable.filter((a) => a.status !== 'active')].map((a) => {
        const name = a.last4 ? `${a.name} ····${a.last4}` : a.name;
        return {
          value: a.id,
          label: a.status === 'active' ? name : t(d.ux.accounts.optionHibernated, { name }),
          icon: a.kind === 'cash' ? Coins : Landmark,
        };
      });
    },
    [accounts, d, t],
  );
  const activeIds = useMemo(() => new Set(accounts.filter((a) => a.kind !== 'credit' && a.status === 'active').map((a) => a.id)), [accounts]);
  const sleepingPicked = [fromId, toId].some((id) => id !== '' && !activeIds.has(id));
  const swap = () => { setFromId(toId); setToId(fromId); };
  const amountNum = amountValidNumber(amount);
  // "Balance $X → $Y" under each side, live from the amount (only when the
  // page supplied balances).
  const balanceLine = (id: string, sign: -1 | 1) => {
    if (!balances || !id || balances[id] === undefined) return null;
    const now = balances[id];
    return (
      <span className="font-mono-tab pb-accounts-transfer-bal">
        {amountNum > 0
          ? t(d.ux.accounts.balanceAfter, { now: formatCurrency(now), after: formatCurrency(Math.round((now + sign * amountNum) * 100) / 100) })
          : t(d.ux.accounts.balanceNow, { now: formatCurrency(now) })}
      </span>
    );
  };

  const sameAccount = fromId !== '' && fromId === toId;
  const amountValid = amount.trim() !== '' && Number(amount) > 0;
  const canSubmit = !!fromId && !!toId && !sameAccount && !sleepingPicked && amountValid && !!date && title.trim() !== '';

  const performSave = async () => {
    if (!canSubmit || saving) return;
    setSaving(true);
    setError(null);

    const result = await callAction(() => createTransferAction({
      fromAccountId: fromId,
      toAccountId: toId,
      amount: Number(amount),
      description: composeDescription(title, description),
      date,
    }));

    setSaving(false);
    if (!result.ok) { setError(translateActionError(d, locale, result)); setErrorKind(result.kind); return; }
    // Below the failure return: the confirmation only ever follows a write the
    // server confirmed. It shows the amount just entered, never a balance.
    const labelOf = (id: string) => options.find((o) => o.value === id)?.label ?? '';
    setSuccess({
      title: d.transfer.done,
      summary: t(d.transfer.summary, { amount: formatCurrency(Number(amount)), from: labelOf(fromId), to: labelOf(toId) }),
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void performSave();
  };

  return (
    <ModalFrame keyboardResize={false} followPan={false} onClose={onClose} busy={saving} labelledBy="transfer-title" maxWidth={640} zIndex={60}>
      {(close) => (
      <>
        {saving && <LoadingOverlay label={d.common.saving} />}

        {/* HEAD: never scrolls. */}
        <div className="pb-modal-head">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 id="transfer-title" className="font-display" style={{ fontSize: '1.2rem', fontWeight: 600 }}>{d.transfer.title}</h2>
            <ModalCloseButton onClick={close} disabled={saving} />
          </div>
        </div>

        {/* BODY: the only part that scrolls. */}
        <div className="pb-modal-body">
          {success ? (
            <SaveSuccess title={success.title} body={success.summary} onDone={close} />
          ) : (
            <form id={FORM_ID} onSubmit={handleSubmit} className="pb-form-grid">
              <p className="pb-span-2" style={{ fontSize: '0.8rem', color: 'var(--ink-soft)', lineHeight: 1.5, margin: 0 }}>
                {d.transfer.blurb}
              </p>

              {/* Two identical blocks, each with its own label inside, so the
                  space either side of the arrow is equal by construction. */}
              <div className="pb-span-2 pb-transfer-route">
                <div className="pb-transfer-account">
                  <span>{d.transfer.from}</span>
                  {/* One wrapper for the picker and its balance line: the
                      stacked layout places a block's second child as one row. */}
                  <div className="pb-accounts-transfer-pick">
                    <SelectField value={fromId} onChange={setFromId} options={options} ariaLabel={d.transfer.from} />
                    {balanceLine(fromId, -1)}
                  </div>
                </div>

                {/* The arrow badge doubles as a swap button. Still a non-div,
                    so the stacked layout's :first-of-type / :last-of-type
                    rules keep finding the two blocks. The icon points right;
                    CSS turns it down when the blocks stack. */}
                <button type="button" className="pb-transfer-badge pb-accounts-swap" onClick={swap} aria-label={d.ux.accounts.swap} disabled={!fromId && !toId}>
                  <span className="pb-transfer-arrow"><ArrowRight size={22} strokeWidth={2.4} aria-hidden="true" /></span>
                </button>

                <div className="pb-transfer-account">
                  <span>{d.transfer.to}</span>
                  <div className="pb-accounts-transfer-pick">
                    <SelectField value={toId} onChange={setToId} options={options} ariaLabel={d.transfer.to} />
                    {balanceLine(toId, 1)}
                  </div>
                </div>
              </div>

              {sameAccount && (
                <p className="pb-span-2" style={{ fontSize: '0.75rem', color: 'var(--wine)', margin: 0 }}>{d.transfer.sameAccount}</p>
              )}
              {/* The server's own words for the same refusal. */}
              {sleepingPicked && !sameAccount && (
                <p className="pb-span-2" style={{ fontSize: '0.75rem', color: 'var(--wine)', margin: 0 }}>{d.serverErrors['validation.transferInactiveAccount']}</p>
              )}
              {accountError && <div className="pb-span-2"><ActionError message={accountError} /></div>}
              {accountsLoaded && accounts.length === 0 && (
                <div className="pb-span-2"><NoAccountsNotice onNavigate={close} /></div>
              )}
              {/* Accounts, but not two that can take a transfer (only cards,
                  or hibernated ones): say why the pickers are short. */}
              {accountsLoaded && accounts.length > 0 && activeIds.size < 2 && (
                <div className="pb-span-2 pb-accounts-transfer-need">
                  <span>{d.ux.accounts.transferNeedsTwo}</span>
                  <Link href="/settings#settings-money" onClick={close} className="pill">{d.accountsPage.manage}</Link>
                </div>
              )}

              <label style={labelStyle} className="pb-span-2">
                {d.transfer.amount}
                <div style={{ position: 'relative' }}>
                  {/* Stays '$' in every locale, as in Add Transaction. */}
                  <span className="font-display" style={bigDollarStyle}>$</span>
                  <AmountInput
                    value={amount}
                    onValueChange={setAmount}
                    placeholder="0.00" className="font-mono-tab" style={bigAmountStyle}
                  />
                </div>
              </label>

              <label style={labelStyle} className="pb-span-2">
                {d.transfer.date}
                {/* A DATE, not a locale-formatted string: 'YYYY-MM-DD' is what
                    the server stores and compares lexicographically. */}
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required style={inputStyle} />
              </label>

              <div className="pb-span-2" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <TitleDescriptionFields
                  title={title}
                  description={description}
                  onTitleChange={setTitle}
                  onDescriptionChange={setDescription}
                  inputStyle={inputStyle}
                  labelStyle={labelStyle}
                  optionalLabel={d.transfer.optional}
                  titlePlaceholder={d.transfer.notePlaceholder}
                />
              </div>
            </form>
          )}
        </div>

        {/* FOOT: never scrolls; the error sits directly above the button.
            Absent on the confirmation. */}
        {!success && (
          <div className="pb-modal-foot">
            {error && <ActionError message={error} kind={errorKind} onRetry={performSave} busy={saving} />}
            <button
              type="submit" form={FORM_ID} disabled={saving || !canSubmit} className="btn-primary"
              style={{ width: '100%', padding: '0.72rem', opacity: saving || !canSubmit ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              {saving ? <><Spinner size={14} /> {d.common.saving}</> : d.transfer.submit}
            </button>
          </div>
        )}
      </>
      )}
    </ModalFrame>
  );
}
