'use client';

import { AmountInput } from '@/components/shared/AmountInput';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Briefcase, Coins } from 'lucide-react';
import { LoadingOverlay, Spinner } from '@/components/shared/Spinner';
import { SelectField, type SelectFieldOption } from '@/components/shared/SelectField';
import { ModalFrame } from '@/components/shared/ModalFrame';
import { ModalCloseButton } from '@/components/shared/ModalCloseButton';
import { SaveSuccess } from '@/components/shared/SaveSuccess';
import { resolveCategoryIcon } from '@/lib/data/icons';
import type { CategoryItem, Account } from '@/lib/data/mappers';
import { addTransactionAction, getAllocationSummaryAction, getCategoriesAction, getAccountsAction, getFrequentCategoriesAction } from '@/lib/actions/pebble';
import { Skeleton } from '@/components/kit/Skeleton';
import { isQuickPicksStale, readQuickPicks, refreshQuickPicks, resolveQuickCategories } from '@/lib/quickPicks';
import { callAction } from '@/lib/actions/callAction';
import type { FailureKind } from '@/lib/actions/failureKind';
import { ActionError } from '@/components/shared/ActionError';
import { NoAccountsNotice } from '@/components/shared/NoAccountsNotice';
import { TitleDescriptionFields } from '@/components/shared/TitleDescriptionFields';
import { composeDescription } from '@/lib/transactionDescription';
import { playEventSound } from '@/lib/sound/useSound';
import { formatCurrency, todayDateString } from '@/lib/format';
import { addDays } from '@/lib/recurring/occurrences';
import { deductionPct } from '@/lib/stats';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { translateActionError } from '@/lib/i18n/actionErrors';
import { useOfflineQueue } from '@/components/offline/OfflineProvider';
import { makeClientId } from '@/lib/offline/clientId';

interface AddTransactionModalProps {
  onClose: () => void;
}

/**
 * ⚠️ LANGUAGE MUST NOT CHANGE WHAT THIS FORM SUBMITS.
 *
 * Four stored values are chosen here: type ('expense'/'income'), category
 * (user data, or 'Standard Income'/'Side Cash' for income), the ACCOUNT
 * (an accountId - user-defined, so its name is never translated) and the
 * date ('YYYY-MM-DD').
 *
 * Every one of them previously rendered its own raw value as its button
 * label. They now render a dictionary LABEL while the state - and therefore
 * the payload - keeps the English literal. The pattern to preserve: the
 * `as const` arrays below hold VALUES, and the dictionary is indexed BY those
 * values. Never map in the other direction.
 *
 * A transaction added in Chinese must store byte-identical values to one
 * added in English.
 *
 * LAYOUT. Three regions inside ModalFrame's card: head (title, close, the
 * Expense/Income switch) and foot (error, submit) never scroll; only the
 * body between them does. The submit button sits in the foot but belongs to
 * the form in the body through the form attribute.
 */
const FORM_ID = 'add-txn-form';

export function AddTransactionModal({ onClose }: AddTransactionModalProps) {
  const { d, t, locale } = useTranslation();
  const offlineQueue = useOfflineQueue();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveErrorKind, setSaveErrorKind] = useState<FailureKind | undefined>(undefined);
  // Set when a save is paused awaiting confirmation. Holds the shortfall only -
  // the form stays mounted behind the confirm, so the write re-derives its
  // payload from the same state rather than from a copy taken earlier.
  const [pendingShortfall, setPendingShortfall] = useState<number | null>(null);
  // Set ONLY in the confirmed-success branch of performSave, below the
  // failure return. A snapshot of the saved entry's wording, so the lines in
  // the confirmation cannot shift when the page re-renders underneath.
  // `queued` marks a save that is only on this device so far (offline): the
  // confirmation then says so instead of claiming it reached the account.
  const [success, setSuccess] = useState<{ title: string; summary: string; queued?: boolean } | null>(null);
  // Full items, not just names: the combobox shows each category's icon and
  // colour, and those live on CategoryItem. Icons are resolved here on the
  // client from iconKey - they cannot cross the RSC boundary.
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountError, setAccountError] = useState<string | null>(null);
  // Distinguishes 'none yet loaded' from 'the user has no accounts'.
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  // Declared before the effects below that set them (and read by the form).
  // The stored value is the account ID, not its name: names are user data
  // and can repeat across a closed and an active account.
  const [accountId, setAccountId] = useState('');
  const [category, setCategory] = useState('');

  // Loaded on open rather than via the layout: this modal lives in AppShell,
  // so a layout fetch would run on every page navigation.
  //
  // The fallback message is passed WITHOUT the locale in the dependency list
  // on purpose: re-running this effect on a language switch would refetch
  // categories for nothing. A message already on screen stays in the language
  // it was raised in until the next attempt.
  //
  // OFFLINE. The two lists come from the snapshot taken on the last online
  // load (OfflineProvider) when there is no connection, so the dialog stays
  // fully usable. Online, each successful load refreshes that snapshot - once
  // both halves are in, since it stores them together.
  const freshRef = useRef<{ accounts?: Account[]; categories?: CategoryItem[] }>({});
  const remember = () => {
    const f = freshRef.current;
    if (f.accounts && f.categories) offlineQueue.rememberReference(f.accounts, f.categories);
  };
  useEffect(() => {
    let active = true;
    const applyCategories = (list: CategoryItem[]) => {
      setCategories(list);
      setCategoryError(null);
      setCategory((current) => current || list[0]?.name || '');
    };
    const fromSnapshot = async () => {
      const snap = await offlineQueue.readReference();
      if (!active || !snap) return false;
      applyCategories(snap.categories);
      return true;
    };
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      void fromSnapshot().then((used) => {
        if (active && !used) setCategoryError(d.ux.offline.needsConnection);
      });
      return () => { active = false; };
    }
    // A failure here used to return silently, leaving an empty dropdown with
    // no explanation - and the expense form could still be submitted with an
    // empty category. Surfaced instead.
    callAction(getCategoriesAction, d.addTxn.categoriesFailed).then(async (result) => {
      if (!active) return;
      if (!result.ok) {
        // A request that never got an answer: use the saved copy if there is one.
        if (result.kind === 'network' && await fromSnapshot()) return;
        if (active) setCategoryError(translateActionError(d, locale, result));
        return;
      }
      applyCategories(result.categories);
      freshRef.current.categories = result.categories;
      remember();
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Quick picks (see lib/quickPicks.ts). The device's saved answer is read ONCE,
  // by a lazy state initialiser: this dialog only mounts after a click (never
  // server-rendered) and its tiles wait for the category list anyway, so the
  // first paint is the same as before. No effect sets state to mirror storage.
  //   - fresh (under a week old): no server call at all;
  //   - stale or missing and online: ask the server ONCE per session (shared
  //     across StrictMode's double mount). With a saved answer the tiles on
  //     screen are NOT reshuffled - the new answer is stored for the next open;
  //     with none, the tiles wait for it (a failure means the default set);
  //   - offline: never ask.
  const picksUserId = offlineQueue.userId;
  const [savedPicks] = useState(() => {
    if (!picksUserId) return { names: null as string[] | null, ask: false };
    const saved = readQuickPicks(picksUserId);
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    return { names: saved ? saved.expense : null, ask: !offline && isQuickPicksStale(saved) };
  });
  const [fetchedPicks, setFetchedPicks] = useState<string[] | null>(null);
  useEffect(() => {
    if (!picksUserId || !savedPicks.ask) return;
    let active = true;
    void refreshQuickPicks(picksUserId, async () => {
      const result = await callAction(getFrequentCategoriesAction);
      return result.ok ? result : null;
    }).then((fresh) => {
      if (active && !savedPicks.names) setFetchedPicks(fresh ? fresh.expense : []);
    });
    return () => { active = false; };
  }, [picksUserId, savedPicks]);
  // null = still waiting for the first answer; [] = the default set.

  // Same reasoning as categories above: fetched on open, not via the layout.
  useEffect(() => {
    let active = true;
    const applyAccounts = (list: Account[]) => {
      setAccounts(list);
      setAccountError(null);
      setAccountsLoaded(true);
      // Preferred account first, else whatever sorts first - the behaviour
      // before preferences existed.
      const preferred = list.find((a) => a.isPreferred);
      setAccountId((current) => current || preferred?.id || list[0]?.id || '');
    };
    const fromSnapshot = async () => {
      const snap = await offlineQueue.readReference();
      if (!active || !snap) return false;
      applyAccounts(snap.accounts.filter((a) => a.status === 'active'));
      return true;
    };
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      void fromSnapshot().then((used) => {
        if (active && !used) setAccountError(d.ux.offline.needsConnection);
      });
      return () => { active = false; };
    }
    callAction(getAccountsAction, d.addTxn.accountsFailed).then(async (result) => {
      if (!active) return;
      if (!result.ok) {
        if (result.kind === 'network' && await fromSnapshot()) return;
        if (active) setAccountError(translateActionError(d, locale, result));
        return;
      }
      applyAccounts(result.accounts);
      freshRef.current.accounts = result.accounts;
      remember();
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(todayDateString());
  const [tag, setTag] = useState('');
  const [amount, setAmount] = useState('');
  const [incomeCategory, setIncomeCategory] = useState<'Standard Income' | 'Side Cash'>('Standard Income');
  const [grossPay, setGrossPay] = useState('');
  const [netPay, setNetPay] = useState('');

  // Compares against the STORED literal, never against a label.
  const isSideCashSelected = incomeCategory === 'Side Cash';

  // Credit cards take charges only, so they are offered for expenses alone.
  const accountOptions = useMemo<SelectFieldOption[]>(
    () => accounts.filter((a) => type === 'expense' || a.kind !== 'credit').map((a) => ({
      value: a.id,
      label: a.last4 ? `${a.name} ····${a.last4}` : a.name,
    })),
    [accounts, type],
  );
  // Switching to Income with a card selected moves the choice to an allowed account.
  useEffect(() => {
    if (type !== 'income') return;
    if (accounts.find((a) => a.id === accountId)?.kind !== 'credit') return;
    const usable = accounts.filter((a) => a.kind !== 'credit');
    setAccountId(usable.find((a) => a.isPreferred)?.id ?? usable[0]?.id ?? '');
  }, [type, accounts, accountId]);

  const categoryOptions = useMemo<SelectFieldOption[]>(
    // label === value deliberately: category names are USER DATA and are
    // never translated. The user already has Chinese category names alongside
    // English ones, and every join is by name.
    () => categories.map((c) => ({
      value: c.name,
      label: c.name,
      icon: resolveCategoryIcon(c.iconKey),
      color: c.color,
    })),
    [categories],
  );

  // Gross is optional here: left blank it means no deductions, and the submit
  // handler below falls back to net. So an empty gross is valid, NOT an error -
  // the guard only fires when a gross was actually entered and came out below
  // net, which would mean more money arrived than was earned.
  //
  // Refused rather than silently corrected: rewriting a typed amount on a money
  // form hides the change from the person making it.
  const draftGross = Number(grossPay);
  const draftNet = Number(netPay);
  const grossEntered = grossPay.trim() !== '' && Number.isFinite(draftGross);
  const netEntered = netPay.trim() !== '' && Number.isFinite(draftNet);
  const showDeductionPreview = !isSideCashSelected && grossEntered && netEntered && draftGross > 0;
  const netExceedsGross = !isSideCashSelected && grossEntered && netEntered && draftNet > draftGross;

  const inputStyle: React.CSSProperties = { padding: '0.6rem 0.75rem', borderRadius: '0.6rem', border: '1px solid var(--line)', fontSize: '0.9rem', color: 'var(--ink)', backgroundColor: 'var(--paper)', boxSizing: 'border-box' };
  const labelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.8rem', color: 'var(--ink-soft)' };
  // The amount field, styled like Add to goal's: the figure is what this form
  // is for, so it is the largest thing on it.
  const bigAmountStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '0.8rem 0.9rem 0.8rem 2.2rem', borderRadius: '0.8rem', border: '1px solid var(--line)', fontSize: '1.6rem', fontWeight: 600, color: 'var(--ink)', backgroundColor: 'var(--paper)' };
  const bigDollarStyle: React.CSSProperties = { position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: '1.5rem', color: 'var(--ink-soft)' };

  // A save in flight must not be cancellable. The write continues regardless,
  // so closing here would read as success for something still unresolved and
  // would leave any error with nowhere to land. ModalFrame's busy prop now
  // enforces this for Escape, the backdrop and the X alike; LoadingOverlay
  // still covers the card itself.

  const performSave = async () => {
    // Try again and the goal-dip confirm call this directly, past
    // handleSubmit's check, so the title rule is enforced here too.
    if (!title.trim()) return;
    setSaving(true);
    setSaveError(null);

    // What the server would be sent, built once so the online attempt and the
    // offline queue carry byte-identical values (a transaction saved offline
    // must store exactly what an online one would).
    const composed = composeDescription(title, description);
    // Side cash is untaxed: one amount fills both gross and net.
    const gross = isSideCashSelected
      ? Number(netPay)
      : (grossPay ? Number(grossPay) : Number(netPay));
    const payload = type === 'expense'
      ? { type, description: composed, date, accountId, category, tag: tag.trim(), amount: Number(amount) } as const
      // incomeCategory goes over the wire as the untranslated literal.
      : { type, description: composed, date, accountId, category: incomeCategory, grossAmount: gross, netAmount: Number(netPay) } as const;

    // One id for this entry, used for the online attempt AND, if that cannot
    // reach the server, for the copy kept on the device. The server inserts by
    // it idempotently, so a request that did commit but lost its answer is
    // recognised when the queued copy is uploaded - never saved twice.
    // Without the offline provider (no user id) nothing is sent: unchanged.
    const clientId = offlineQueue.userId ? makeClientId() : undefined;
    const accountLabel = accountOptions.find((o) => o.value === accountId)?.label ?? '';

    const saveOnDevice = async (): Promise<boolean> => {
      if (!clientId) return false;
      const meta = type === 'expense' ? categories.find((c) => c.name === category) : undefined;
      return offlineQueue.queueTransaction({
        clientId, kind: type, createdAt: Date.now(), payload,
        display: { accountLabel, amount: type === 'expense' ? Number(amount) : Number(netPay), iconKey: meta?.iconKey, color: meta?.color },
      });
    };

    let result;
    let queued = false;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      // No connection: do not even try. Straight to the device.
      queued = await saveOnDevice();
      result = queued
        ? { ok: true as const }
        : { ok: false as const, error: d.ux.offline.storageUnavailable, kind: 'network' as const };
    } else {
      result = await callAction(() => addTransactionAction({ ...payload, clientId }));
      // A NETWORK-class failure - the request never got an answer - is the one
      // case that is not an error to show: keep the entry on the device and
      // say so. Validation, database and session failures are real answers and
      // stay errors; they are never queued.
      if (!result.ok && result.kind === 'network') {
        queued = await saveOnDevice();
        if (queued) result = { ok: true as const };
      }
    }

    setSaving(false);
    setPendingShortfall(null);
    if (!result.ok) {
      setSaveError(translateActionError(d, locale, result));
      setSaveErrorKind(result.kind);
      playEventSound('saveFailed');
      return;
    }
    // Below the failure return, so a failed write can never play a success
    // sound. Fire-and-forget - playback cannot delay the close.
    playEventSound(type === 'expense' ? 'expenseSaved' : 'incomeSaved');
    if (queued) {
      // Saved on the device only. Said plainly: it is not in the account yet,
      // and does not count in any balance until it is uploaded.
      setSuccess({
        title: d.ux.offline.savedOnDevice,
        summary: type === 'expense'
          ? `${t(d.saveSuccess.expenseSummary, { amount: formatCurrency(Number(amount)), category, account: accountLabel })}${locale === 'zh' ? '。' : '.'} ${d.ux.offline.savedOnDeviceBody}`
          : `${t(d.saveSuccess.incomeSummary, { amount: formatCurrency(Number(netPay)), account: accountLabel })}${locale === 'zh' ? '。' : '.'} ${d.ux.offline.savedOnDeviceBody}`,
        queued: true,
      });
      return;
    }
    // Also below the failure return: the confirmation only ever appears for a
    // write the server confirmed. The amounts are the ones just submitted,
    // formatted the same way, never a recomputed balance.
    setSuccess(type === 'expense'
      ? {
          title: d.saveSuccess.expenseAdded,
          summary: t(d.saveSuccess.expenseSummary, { amount: formatCurrency(Number(amount)), category, account: accountLabel }),
        }
      : {
          title: d.saveSuccess.incomeAdded,
          summary: t(d.saveSuccess.incomeSummary, { amount: formatCurrency(Number(netPay)), account: accountLabel }),
        });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !date || !accountId || saving) return;

    if (type === 'expense') {
      if (!amount || Number(amount) <= 0) return;
    } else {
      if (!netPay || Number(netPay) <= 0) return;
      if (netExceedsGross) {
        // Client-side validation, so this one CAN be localized. The messages
        // ActionError usually shows come from pebble.ts and are still English
        // - see the note in ActionError.tsx.
        setSaveError(d.addTxn.netExceedsGross);
        setSaveErrorKind('validation');
        return;
      }
    }

    // Only spending can eat into money set aside for goals; income raises the
    // balance and never needs the check.
    //
    // Fetched here rather than when the modal opened so the figures cannot go
    // stale between opening the form and submitting it.
    //
    // Skipped offline: it needs the server, and it is advisory anyway (the
    // entry is queued and uploaded later with no shortfall prompt).
    if (type === 'expense' && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
      setSaving(true);
      setSaveError(null);
      const summary = await callAction(getAllocationSummaryAction);
      setSaving(false);

      if (summary.ok) {
        const unallocatedNow = summary.totalBalance - summary.allocated;
        const unallocatedAfter = unallocatedNow - Number(amount);
        // Warns on the crossing only. Warning on every expense while already
        // over-allocated would train the dialog to be dismissed unread.
        // Only when something is actually set aside: with nothing allocated,
        // unallocated IS the balance, and a first expense on a fresh account
        // would dip into goals that do not exist. The amount shown is capped
        // at what was set aside - anything past that is the balance going
        // negative, not goal money.
        if (summary.allocated > 0 && unallocatedNow >= 0 && unallocatedAfter < 0) {
          setPendingShortfall(Math.min(Math.abs(unallocatedAfter), summary.allocated));
          return;
        }
      }
      // A failed lookup does not block the save: the check is advisory, and
      // refusing to record real spending over it would be the worse outcome.
    }

    await performSave();
  };

  // Split rather than interpolated: the amount must keep .font-mono-tab, and
  // t() returns a plain string. Splitting on the placeholder puts the element
  // wherever that language's sentence puts it - English mid-sentence, Chinese
  // later - which two concatenated half-strings could not do.
  const dipsParts = d.addTxn.dipsBody.split('{amount}');

  const showForm = !success && pendingShortfall === null;

  // Quick picks. Both are shortcuts onto the same state the full controls
  // set - the native date input and the category SelectField stay, so the
  // Plain dropdown preference and any date are still one tap away. Today is
  // the same browser-local reading the date field starts from.
  const today = todayDateString();
  const yesterday = addDays(today, -1);
  // The user's MOST USED expense categories (see lib/quickPicks.ts), not the
  // same list for everyone. The tiles wait for the picks, so the default set
  // is never painted and then swapped for the personal one. Names are re-checked against the live list on every render, so a
  // renamed or deleted category can never be offered.
  const quickCategories = useMemo(
    () => {
      // null = still waiting for the first answer; [] = the default set.
      const names = !picksUserId ? [] : savedPicks.names ?? fetchedPicks ?? (savedPicks.ask ? null : []);
      return names === null ? [] : resolveQuickCategories(names, categories);
    },
    [picksUserId, savedPicks, fetchedPicks, categories],
  );
  // Still waiting for what the tiles need - the category list (fetched when the
  // dialog opens) or the first picks answer. The block holds its place with
  // shimmering placeholders instead of popping in a moment later.
  const quickPending = quickCategories.length <= 1 && !categoryError
    && (categories.length === 0 || (!!picksUserId && savedPicks.names === null && fetchedPicks === null && savedPicks.ask));

  return (
    <ModalFrame keyboardResize={false} followPan={false} onClose={onClose} busy={saving} labelledBy="add-txn-title" maxWidth={640} cardClassName="pb-shell-addtxn">
      {(close) => (
      <>
        {saving && <LoadingOverlay label={d.addTxn.saving} />}

        {/* HEAD: never scrolls. The switch shows only on the form itself. */}
        <div className="pb-modal-head">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 id="add-txn-title" className="font-display" style={{ fontSize: '1.2rem', fontWeight: 600 }}>{d.addTxn.title}</h2>
            <ModalCloseButton onClick={close} disabled={saving} />
          </div>
          {showForm && (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              {/* A two-way switch: the thumb slides to the chosen side (wine for
                  money out, pine for money in). Arrow keys flip it as well.

                  The array holds the STORED values; the dictionary is indexed by
                  them. setType therefore always receives the English literal.
                  capitalize is left on for English - it is a no-op in Chinese. */}
              <div
                role="radiogroup"
                className="pb-kind-switch"
                data-kind={type}
                onKeyDown={(e) => {
                  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
                  e.preventDefault();
                  const next = type === 'expense' ? 'income' : 'expense';
                  setType(next);
                  e.currentTarget.querySelector<HTMLElement>(`[data-value="${next}"]`)?.focus();
                }}
              >
                <span className="pb-kind-thumb" aria-hidden="true" />
                {(['expense', 'income'] as const).map((k) => {
                  const Icon = k === 'expense' ? ArrowDownRight : ArrowUpRight;
                  return (
                    <button
                      key={k} type="button" role="radio" data-value={k}
                      aria-checked={type === k} tabIndex={type === k ? 0 : -1}
                      onClick={() => setType(k)}
                      style={{ textTransform: 'capitalize' }}
                    >
                      <Icon size={16} strokeWidth={2.25} aria-hidden="true" />
                      {d.enums.kind[k]}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* BODY: the only part that scrolls. */}
        <div className="pb-modal-body">
        {success ? (
          <SaveSuccess title={success.title} body={success.summary} onDone={close} color={success.queued ? 'var(--gold)' : undefined} />
        ) : pendingShortfall !== null ? (
          <div>
            <p style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem' }}>{d.addTxn.dipsTitle}</p>
            <p style={{ fontSize: '0.83rem', color: 'var(--ink-soft)', lineHeight: 1.5 }}>
              {dipsParts[0]}
              <span className="font-mono-tab" style={{ color: 'var(--ink)' }}>{formatCurrency(pendingShortfall)}</span>
              {dipsParts[1]}
            </p>
          </div>
        ) : (
        <form id={FORM_ID} onSubmit={handleSubmit} className="pb-form-grid">
          {/* One column on a phone; two once the card is wide enough (the
              container query in globals.css). Fields that need a whole row
              carry the span class. */}

          {/* The amount comes first: it is what the form is for. For income the
              Standard / Side cash choice sits above it, because it decides
              which amount fields there are. */}
          {type === 'expense' ? (
            <label style={labelStyle} className="pb-span-2">
              {d.addTxn.amount}
              <div style={{ position: 'relative' }}>
                {/* Stays '$' in every locale: these are the user's real US
                    dollars, and formatCurrency() is pinned to en-US too. */}
                <span className="font-display" style={bigDollarStyle}>$</span>
                <AmountInput
                  value={amount} onValueChange={setAmount} placeholder="0.00" required
                  className="font-mono-tab" style={bigAmountStyle}
                />
              </div>
            </label>
          ) : (
            <>
              <label style={labelStyle} className="pb-span-2">
                {d.addTxn.category}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.6rem' }}>
                  {/* ⚠️ Same pattern, and the most important instance of it.
                      'Standard Income' and 'Side Cash' are matched as literals
                      by isSideCash() and by the income filters in stats.ts.
                      Tiles with an icon rather than pills, so this choice does
                      not look like the Expense / Income switch above it. */}
                  {(['Standard Income', 'Side Cash'] as const).map((c) => {
                    const Icon = c === 'Standard Income' ? Briefcase : Coins;
                    return (
                      <button
                        key={c} type="button" onClick={() => setIncomeCategory(c)}
                        aria-pressed={incomeCategory === c}
                        className={`pb-choice-tile ${incomeCategory === c ? 'active' : ''}`}
                      >
                        <Icon size={20} aria-hidden="true" />
                        <span>{d.enums.incomeCategory[c]}</span>
                      </button>
                    );
                  })}
                </div>
                {isSideCashSelected && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', lineHeight: 1.45 }}>
                    {d.addTxn.sideCashNote}
                  </span>
                )}
              </label>
              {!isSideCashSelected && (
                <label style={labelStyle}>
                  {d.addTxn.payBefore}
                  <div style={{ position: 'relative' }}>
                    <span className="font-display" style={bigDollarStyle}>$</span>
                    <AmountInput
                      value={grossPay} onValueChange={setGrossPay} placeholder="0.00"
                      className="font-mono-tab" style={bigAmountStyle}
                    />
                  </div>
                </label>
              )}
              {/* Beside pay-before when there is one; the whole row for side cash. */}
              <label style={labelStyle} className={isSideCashSelected ? 'pb-span-2' : undefined}>
                {isSideCashSelected ? d.addTxn.amount : d.addTxn.payAfter}
                <div style={{ position: 'relative' }}>
                  <span className="font-display" style={bigDollarStyle}>$</span>
                  <AmountInput
                    value={netPay} onValueChange={setNetPay} placeholder="0.00" required
                    className="font-mono-tab"
                    style={{ ...bigAmountStyle, border: `1px solid ${netExceedsGross ? 'var(--wine)' : 'var(--line)'}` }}
                  />
                </div>
              </label>
              {netExceedsGross ? (
                <p className="pb-span-2" style={{ fontSize: '0.75rem', color: 'var(--wine)', lineHeight: 1.45, margin: 0 }}>
                  {d.addTxn.netExceedsGross}
                </p>
              ) : showDeductionPreview && (
                <div className="pb-span-2" style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', fontSize: '0.78rem', color: 'var(--ink-soft)' }}>
                  <span>{d.addTxn.deductions}</span>
                  <span className="font-mono-tab" style={{ fontWeight: 500 }}>
                    {deductionPct(draftGross, draftNet).toFixed(1)}%
                  </span>
                </div>
              )}
            </>
          )}

          <div className="pb-span-2" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <TitleDescriptionFields
              title={title}
              description={description}
              onTitleChange={setTitle}
              onDescriptionChange={setDescription}
              inputStyle={inputStyle}
              labelStyle={labelStyle}
              optionalLabel={d.txnDetail.optional}
            />
          </div>

          {type === 'expense' && quickPending && (
            <div className="pb-span-2 pb-shell-quick" aria-busy="true">
              <span style={{ fontSize: '0.8rem', color: 'var(--ink-soft)' }}>{d.ux.shell.quickCategories}</span>
              <div className="pb-shell-quick-grid" aria-hidden="true">
                {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="pb-shell-quick-skel" />)}
              </div>
            </div>
          )}

          {type === 'expense' && quickCategories.length > 1 && (
            <div className="pb-span-2 pb-shell-quick" role="group" aria-labelledby="add-txn-quick">
              <span id="add-txn-quick" style={{ fontSize: '0.8rem', color: 'var(--ink-soft)' }}>{d.ux.shell.quickCategories}</span>
              <div className="pb-shell-quick-grid">
                {quickCategories.map((c) => {
                  const Icon = resolveCategoryIcon(c.iconKey);
                  const on = category === c.name;
                  return (
                    <button
                      key={c.name} type="button" aria-pressed={on}
                      onClick={() => setCategory(c.name)}
                      className={`pb-shell-quick-tile${on ? ' active' : ''}`}
                      style={{ ['--pb-cat' as string]: c.color }}
                    >
                      <span className="pb-shell-quick-icon" aria-hidden="true"><Icon size={16} /></span>
                      {/* User data: the name as stored, never translated. */}
                      <span className="pb-shell-quick-name">{c.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {type === 'expense' && (
            <>
              {/* A div, not a label: <label> forwards clicks to its control, and
                  the dropdown renders inside this block - clicking an option
                  would fire the option AND a forwarded click on the input,
                  reopening the list. Native <select> escapes this because the
                  browser draws its popup outside the DOM. */}
              <div style={labelStyle}>
                {/* Not a <label htmlFor>: clicking a label dispatches a synthetic
                    click on its control, which would open the dropdown from a
                    click on the word "Category". The input carries its own
                    accessible name via aria-label. */}
                <span>{d.addTxn.category}</span>
                <SelectField
                  id="add-txn-category"
                  value={category}
                  onChange={setCategory}
                  options={categoryOptions}
                  placeholder={categoryError ? d.select.unavailable : d.select.searchCategories}
                  disabled={categoryOptions.length === 0}
                  ariaLabel={d.addTxn.category}
                />
                {categoryError && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--wine)', lineHeight: 1.45 }}>{categoryError}</span>
                )}
              </div>
              <label style={labelStyle}>
                <span>{d.addTxn.tag} <span style={{ opacity: 0.7 }}>{d.addTxn.tagHint}</span></span>
                <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder={d.addTxn.tagPlaceholder} style={inputStyle} />
              </label>
            </>
          )}

          <label style={labelStyle}>
            {d.addTxn.date}
            {/* type="date" - the browser localizes its own picker from
                <html lang>, and the value stays 'YYYY-MM-DD' regardless.
                That is exactly what must reach the database. */}
            <span className="pb-shell-date-row">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required style={{ ...inputStyle, flex: '1 1 9.5rem', minWidth: 0 }} />
              {/* Buttons inside a label do not forward their clicks to the
                  input (they are interactive content), so these only set the
                  value. Same 'YYYY-MM-DD' the picker writes. */}
              <span className="pb-shell-date-chips">
                {([[today, d.ux.shell.today], [yesterday, d.ux.shell.yesterday]] as const).map(([value, label]) => (
                  <button
                    key={value} type="button" aria-pressed={date === value}
                    onClick={() => setDate(value)}
                    className={`pb-shell-date-chip${date === value ? ' active' : ''}`}
                  >
                    {label}
                  </button>
                ))}
              </span>
            </span>
          </label>

          <label style={labelStyle}>
            {d.addTxn.paymentMethod}
            {/* A combobox, not pills: the account list is user-defined and
                unbounded, so a fixed row of buttons would wrap badly. The
                VALUE is the account id; the label is the user's own name for
                it and is never translated. */}
            <SelectField
              value={accountId}
              onChange={setAccountId}
              options={accountOptions}
              ariaLabel={d.addTxn.paymentMethod}
            />
            {accountError && <ActionError message={accountError} />}
            {accountsLoaded && accounts.length === 0 && <NoAccountsNotice onNavigate={close} />}
          </label>
        </form>
        )}
        </div>

        {/* FOOT: never scrolls. The error sits directly above the buttons so a
            failed save is visible without scrolling. Absent on the
            confirmation. */}
        {!success && (
          <div className="pb-modal-foot">
            {offlineQueue.offline && !saveError && pendingShortfall === null && (
              <p className="pb-off-modal-note" role="status">{d.ux.offline.modalNote}</p>
            )}
            {saveError && (
              <ActionError message={saveError} kind={saveErrorKind} onRetry={performSave} busy={saving} />
            )}
            {pendingShortfall !== null ? (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" onClick={() => setPendingShortfall(null)} className="pill" style={{ flex: 1, padding: '0.6rem' }}>{d.addTxn.goBack}</button>
                <button type="button" onClick={performSave} disabled={saving} className="btn-primary" style={{ flex: 1, padding: '0.6rem', opacity: saving ? 0.6 : 1 }}>
                  {saving ? d.common.saving : d.addTxn.proceed}
                </button>
              </div>
            ) : (
              <button type="submit" form={FORM_ID} disabled={saving || netExceedsGross} className="btn-primary" style={{ width: '100%', padding: '0.72rem', opacity: saving || netExceedsGross ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                {saving ? <><Spinner size={14} /> {d.common.saving}</> : d.addTxn.title}
              </button>
            )}
          </div>
        )}
      </>
      )}
    </ModalFrame>
  );
}
