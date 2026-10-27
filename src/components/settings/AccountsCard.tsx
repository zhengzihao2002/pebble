'use client';

import { useEffect, useRef, useState } from 'react';
import { AlarmClock, BedDouble, CalendarClock, Landmark, Coins, CreditCard, Pencil, Plus, Trash2, ArrowRightLeft, Star, Wallet } from 'lucide-react';
import { useAccountOrdering } from '@/lib/useAccountOrdering';
import { useOrderedAccounts } from '@/lib/useOrderedAccounts';
import { AccountOrderControl } from '@/components/shared/AccountOrderControl';
import { SectionHeader } from '@/components/kit/SectionHeader';
import { dueDates } from '@/lib/creditCards';
import { useSettingsToday } from './useSettingsToday';
import { createAccountAction, hibernateAccountAction, wakeAccountAction, setPreferredAccountAction, updateCreditCardAction } from '@/lib/actions/pebble';
import { callAction } from '@/lib/actions/callAction';
import type { FailureKind } from '@/lib/actions/failureKind';
import { ActionError } from '@/components/shared/ActionError';
import { LoadingOverlay } from '@/components/shared/Spinner';
import type { Account } from '@/lib/data/mappers';
import { formatCurrency } from '@/lib/format';
import { AccountMoveDialog } from '@/components/settings/AccountMoveDialog';
import { AccountDeleteDialog } from '@/components/settings/AccountDeleteDialog';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { useSafetyLock } from '@/lib/useSafetyLock';
import { translateActionError } from '@/lib/i18n/actionErrors';
import { SleepingBadge } from '@/components/shared/SleepingBadge';

interface AccountsCardProps {
  accounts: Account[];
  balancesByAccount: Record<string, number>;
  hasRecords: Record<string, boolean>;
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.5rem 0.6rem', borderRadius: '0.5rem',
  border: '1px solid var(--line)', fontSize: '0.87rem', color: 'var(--ink)',
  backgroundColor: 'var(--paper)', boxSizing: 'border-box',
};

// Visually hidden, still read by screen readers.
const srOnly: React.CSSProperties = {
  position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
  overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0,
};

const SAVED_HOLD_MS = 2400;

// Whole days from a to b, both 'YYYY-MM-DD' (UTC arithmetic, so no DST drift).
const daysBetween = (a: string, b: string) => Math.round(
  (Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86_400_000,
);

// Utilisation bands for the card bar: calm under 30%, caution to 70%, over
// beyond. The percentage is always written beside it, so colour is not the
// only signal.
const utilTone = (share: number) => (share < 0.3 ? 'is-low' : share < 0.7 ? 'is-mid' : 'is-high');

/** A template with one money placeholder, split so only the money blurs in
    privacy mode and the rest (a due day) stays readable. */
function MoneyTemplate({ template, slot, money, values }: { template: string; slot: string; money: string; values: Record<string, string> }) {
  return (
    <>
      {template.split(new RegExp(`(\\{${slot}\\})`)).map((part, i) => (part === `{${slot}}`
        ? <span key={i} className="font-mono-tab">{money}</span>
        : <span key={i} className="pb-tnum">{part.replace(/\{(\w+)\}/g, (m, k: string) => values[k] ?? m)}</span>))}
    </>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: '0.35rem',
  fontSize: '0.8rem', color: 'var(--ink-soft)',
};

/**
 * Create and close accounts.
 *
 * CLOSED ACCOUNTS ARE NOT LISTED. Closure is terminal and a closed account is
 * invisible everywhere except as a label on the historical transactions that
 * reference it - so showing it here would imply an action that does not exist.
 *
 * Account names are USER DATA. They are rendered directly, never looked up in
 * the dictionary, unlike the fixed Checking/Cash pair they replaced.
 */
export function AccountsCard({ accounts, balancesByAccount, hasRecords }: AccountsCardProps) {
  const deleteLocked = useSafetyLock('deleteAccounts');
  const { d, t, locale } = useTranslation();
  // The zone-aware today; null until hydrated, and the due chip waits.
  const today = useSettingsToday();

  // Hibernated accounts ARE listed: they hold real balances that still count
  // toward the total, and they must be reachable to wake.
  const orderedAccounts = useOrderedAccounts(accounts, balancesByAccount);
  const ordering = useAccountOrdering(orderedAccounts);
  const visible = ordering.displayed;

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'bank' | 'cash' | 'credit'>('bank');
  const [last4, setLast4] = useState('');
  // Credit cards: limit (typed text, parsed on save) and due day.
  const [limit, setLimit] = useState('');
  const [dueDay, setDueDay] = useState(1);
  // Inline editor for an existing card's limit and due day.
  const [editingCard, setEditingCard] = useState<string | null>(null);
  const [editLimit, setEditLimit] = useState('');
  const [editDue, setEditDue] = useState(1);
  const parseMoney = (s: string) => {
    const n = Number(s.replace(/[$,\s]/g, ''));
    return s.trim() && Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
  };
  const dayText = (n: number) => (locale === 'zh'
    ? String(n)
    : `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`);
  const dayOptions = Array.from({ length: 31 }, (_, i) => i + 1).map((n) => (
    <option key={n} value={n}>{t(d.accounts.dueDayOption, { day: dayText(n) })}</option>
  ));
  const openCardEditor = (a: Account) => {
    setEditingCard(a.id);
    setEditLimit(a.creditLimit !== null ? String(a.creditLimit) : '');
    setEditDue(a.dueDay ?? 1);
    setError(null);
  };
  const cardChanged = (a: Account) => parseMoney(editLimit) !== a.creditLimit || editDue !== a.dueDay;

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<FailureKind | undefined>(undefined);
  const [confirmDelete, setConfirmDelete] = useState<Account | null>(null);
  const [moveSource, setMoveSource] = useState<Account | null>(null);
  // The row whose save the server just confirmed. Set ONLY below the failure
  // return of a write; shows a small check on that row for a moment.
  const [savedId, setSavedId] = useState<string | null>(null);
  // The account whose own button failed: its error shows inside its box,
  // not at the bottom of a list that may be off screen.
  const [rowErrorId, setRowErrorId] = useState<string | null>(null);
  // Saves confirmed some other way: hibernate / wake (the grey easing is the
  // confirmation) and the star (which pops). The status line still announces.
  const [sweepSkip, setSweepSkip] = useState<string | null>(null);
  const [starPop, setStarPop] = useState<string | null>(null);
  useEffect(() => { if (!savedId) setSweepSkip(null); }, [savedId]);
  useEffect(() => {
    if (!starPop) return;
    const id = window.setTimeout(() => setStarPop(null), 600);
    return () => window.clearTimeout(id);
  }, [starPop]);
  // Hibernate / wake show their new look at once, on the row that was clicked,
  // and transition there. Waiting for the server's data was never seen: the
  // row is rebuilt when it arrives, and a rebuilt element cannot transition.
  // Reverted (row eases back) if the server refuses; cleared once data agrees.
  const [sleepOverride, setSleepOverride] = useState<Record<string, 'active' | 'hibernated'>>({});
  const [sleepBusy, setSleepBusy] = useState<string | null>(null);
  useEffect(() => {
    setSleepOverride((cur) => {
      const next = { ...cur };
      let changed = false;
      for (const a of accounts) {
        if (next[a.id] && next[a.id] === a.status) { delete next[a.id]; changed = true; }
      }
      return changed ? next : cur;
    });
  }, [accounts]);
  const toggleSleep = async (a: Account) => {
    if (saving || sleepBusy) return;
    const target = (sleepOverride[a.id] ?? a.status) === 'hibernated' ? 'active' : 'hibernated';
    // A card that owes will be refused: don't show it asleep, even briefly.
    const willRefuse = a.kind === 'credit' && target === 'hibernated' && (balancesByAccount[a.id] ?? 0) < -0.004;
    setError(null);
    setRowErrorId(null);
    setSavedId(null);
    if (!willRefuse) setSleepOverride((m) => ({ ...m, [a.id]: target }));
    setSleepBusy(a.id);
    const result = await callAction(() => (target === 'active' ? wakeAccountAction(a.id) : hibernateAccountAction(a.id)));
    setSleepBusy(null);
    if (!result.ok) {
      setSleepOverride((m) => { const n = { ...m }; delete n[a.id]; return n; });
      setError(translateActionError(d, locale, result));
      setErrorKind(result.kind);
      setRowErrorId(a.id);
      return;
    }
    setSavedId(a.id);
    setSweepSkip(a.id);
  };
  // Ids present before a create, so the new row can be found once the page
  // hands down the refreshed list.
  const pendingNew = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!savedId) return;
    const id = window.setTimeout(() => setSavedId(null), SAVED_HOLD_MS);
    return () => window.clearTimeout(id);
  }, [savedId]);

  useEffect(() => {
    const before = pendingNew.current;
    if (!before) return;
    const fresh = accounts.find((a) => !before.has(a.id));
    if (fresh) { pendingNew.current = null; setSavedId(fresh.id); }
  }, [accounts]);

  const resetForm = () => {
    setName(''); setKind('bank'); setLast4(''); setLimit(''); setDueDay(1);
    setAdding(false); setError(null);
  };

  const handleCreate = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    setSavedId(null);
    const idsBefore = new Set(accounts.map((a) => a.id));
    const result = await callAction(() => createAccountAction({ name, kind, last4, ...(kind === 'credit' ? { creditLimit: parseMoney(limit), dueDay } : {}) }));
    setSaving(false);
    if (!result.ok) { setError(translateActionError(d, locale, result)); setErrorKind(result.kind); return; }
    // Below the failure return: the new row is marked when the list refreshes.
    setRowErrorId(null);
    pendingNew.current = idsBefore;
    resetForm();
  };

  const runAccountAction = async (
    accountId: string,
    run: () => Promise<{ ok: true } | { ok: false; error: string; kind?: FailureKind }>,
    feedback: 'sweep' | 'star' | 'quiet' = 'sweep',
  ) => {
    if (saving) return;
    setSaving(true);
    setError(null);
    setSavedId(null);
    const result = await callAction(run);
    setSaving(false);
    setConfirmDelete(null);
    if (!result.ok) { setError(translateActionError(d, locale, result)); setErrorKind(result.kind); setRowErrorId(accountId); return; }
    // Below the failure return.
    setRowErrorId(null);
    setSavedId(accountId);
    if (feedback !== 'sweep') setSweepSkip(accountId);
    if (feedback === 'star') setStarPop(accountId);
  };

  const handleCardSave = async (a: Account) => {
    if (saving) return;
    setSaving(true);
    setError(null);
    setSavedId(null);
    const result = await callAction(() => updateCreditCardAction({ id: a.id, creditLimit: parseMoney(editLimit), dueDay: editDue }));
    setSaving(false);
    if (!result.ok) { setError(translateActionError(d, locale, result)); setErrorKind(result.kind); setRowErrorId(a.id); return; }
    // Below the failure return.
    setRowErrorId(null);
    setEditingCard(null);
    setSavedId(a.id);
  };

  const sleepingCount = visible.filter((a) => (sleepOverride[a.id] ?? a.status) === 'hibernated').length;
  const listTotal = visible.reduce((sum, a) => sum + (balancesByAccount[a.id] ?? 0), 0);

  return (
    <div className="card pb-settings-card" style={{ position: 'relative' }}>
      {saving && <LoadingOverlay label={d.common.saving} />}
      {/* Announces a confirmed save; the visible check is aria-hidden. */}
      <span role="status" style={srOnly}>{savedId ? d.accounts.saved : ''}</span>
      <SectionHeader icon={Wallet} title={d.accounts.title} subtitle={d.accounts.blurb} />

      {visible.length > 1 && <AccountOrderControl ordering={ordering} />}

      {/* What the list adds up to: hibernated balances still count, so they
          are in the total (and counted separately). */}
      {visible.length > 0 && (
        <div className="pb-settings-acct-sum">
          <span>
            {visible.length === 1 ? d.ux.settings.acrossOne : t(d.ux.settings.acrossAccounts, { count: visible.length })}
            {sleepingCount > 0 && (
              <span className="pb-tnum pb-settings-acct-sum-sleep">{` · ${t(d.ux.settings.sleepingCount, { count: sleepingCount })}`}</span>
            )}
          </span>
          <span className="font-mono-tab pb-settings-acct-sum-total">{formatCurrency(listTotal)}</span>
        </div>
      )}

      {/* The container sits on this wrapper, not the card: the move and
          delete dialogs render inside the card, and a size container is a
          containing block for their fixed-position overlay. */}
      <div className="pb-settings-acct-wrap">
       <div className="pb-settings-acct-list">
        {visible.map((a) => {
          // The status the row shows: the optimistic one while saving, else the real one.
          const st = sleepOverride[a.id] ?? a.status;
          const AccountIcon = a.kind === 'credit' ? CreditCard : a.kind === 'bank' ? Landmark : Coins;
          const balance = balancesByAccount[a.id] ?? 0;
          const kindLabel = a.kind === 'bank' ? d.accounts.kindBank : a.kind === 'cash' ? d.accounts.kindCash : d.accounts.kindCredit;
          // Credit cards: how much of the limit is used, and when it is due.
          const owed = Math.max(0, -balance);
          const share = a.kind === 'credit' && a.creditLimit ? owed / a.creditLimit : null;
          const due = a.kind === 'credit' && a.dueDay !== null && today ? dueDates(a.dueDay, today).next : null;
          const daysLeft = due && today ? daysBetween(today, due) : null;
          // A STACK, not a row. The buttons used to sit beside the name and
          // wrap only once it could no longer hold 140px - a threshold that
          // resolved differently on a real phone than in Chrome's device
          // emulation, so an iPhone 14 Pro crowded four buttons against the
          // name and clipped it while the emulator wrapped correctly. Giving
          // the buttons their own line guarantees the name has the full width
          // on every device, with no measurement to get wrong.
          //
          // Each account is now a tile. A sleeping one keeps its grey box:
          // every tile already has the same padding, so only the background
          // and border ease (settings.css) and the contents never move.
          return ordering.wrap(a, (
            <div key={a.id} className={`pb-settings-acct${st === 'hibernated' ? ' is-sleeping' : ''}`}>
              {/* A confirmed save: a soft cloud of the theme colour spreads from the
                  middle of the row to both ends, then fades. Decorative; the
                  status line above announces the save to screen readers. */}
              {savedId === a.id && sweepSkip !== a.id && st !== 'hibernated' && <span className="pb-row-sweep" aria-hidden="true" />}
              {/* Star and move ride the name line - two buttons always fit
                  beside a truncating name. Hibernate and delete drop to their
                  own line below, left-aligned.

                  ALWAYS SPLIT, never wrapped. flexWrap put all four on one
                  line until the name could no longer hold its basis, and that
                  threshold resolved differently on a real iPhone than in
                  Chrome's device emulation - the emulator wrapped, the phone
                  crowded the name and clipped it. Splitting deterministically
                  removes the measurement entirely. */}
              <div className="pb-settings-acct-top">
                <span className={`pb-settings-acct-chip is-${a.kind}`} aria-hidden="true">
                  <AccountIcon size={18} />
                  {a.isPreferred && <span className="pb-settings-acct-star"><Star size={9} fill="currentColor" strokeWidth={2.5} /></span>}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* The name has the line to itself; the last four digits
                      moved to the line below, beside the kind, so a long name
                      no longer pushes them out of sight behind an ellipsis. */}
                  <p className="pb-settings-acct-name">{a.name}</p>
                  <p className="pb-settings-acct-kind">
                    {kindLabel}
                    {a.last4 && <span className="pb-tnum">{` ····${a.last4}`}</span>}
                    {a.isPreferred && (
                      <span style={{ color: 'var(--gold)', fontWeight: 500 }}>
                        {` · ${d.accounts.preferred}`}
                      </span>
                    )}
                  </p>
                </div>

                {st === 'hibernated' && <SleepingBadge />}

                {/* Only active accounts can be preferred - preselecting one
                    that rejects new transactions would be broken. Independent
                    of isDefault: Checking and Cash CAN be preferred. */}
                {st === 'active' && (
                  <button
                    type="button"
                    onClick={() => runAccountAction(a.id, () => setPreferredAccountAction(a.id), a.isPreferred ? 'quiet' : 'star')}
                    className={`icon-btn pb-settings-iconbtn is-round${starPop === a.id ? ' pb-star-pop' : ''}`}
                    aria-pressed={a.isPreferred}
                    aria-label={t(a.isPreferred ? d.accounts.unpreferLabel : d.accounts.preferLabel, { name: a.name })}
                    style={{
                      borderColor: a.isPreferred ? 'var(--gold)' : 'var(--line)',
                      color: a.isPreferred ? 'var(--gold)' : 'var(--ink-soft)',
                    }}
                  >
                    <Star size={15} fill={a.isPreferred ? 'var(--gold)' : 'none'} />
                  </button>
                )}

                {/* Emptying Checking or Cash into another account is
                    legitimate - the account itself stays. Disabled when empty:
                    the dialog could only report there is nothing to move.
                    Delete stays enabled by contrast - its error message IS the
                    explanation, and a greyed button explains nothing. */}
                <button
                  type="button" onClick={() => setMoveSource(a)} className="icon-btn pb-settings-iconbtn is-round"
                  aria-label={t(d.accounts.moveTitle, { name: a.name })}
                  disabled={!hasRecords[a.id]}
                  style={{ opacity: hasRecords[a.id] ? 1 : 0.4, cursor: hasRecords[a.id] ? 'pointer' : 'not-allowed' }}
                >
                  <ArrowRightLeft size={15} />
                </button>
              </div>

              {/* Hibernated balances still count toward the total, so they
                  are shown - the grey box says dormant rather than absent. */}
              <p className="font-mono-tab pb-settings-acct-bal">{formatCurrency(balance)}</p>

              {a.kind === 'credit' && (share !== null || due) && (
                <div className="pb-settings-acct-credit">
                  {share !== null && (
                    // A chart of money: blurred with the figures in privacy mode.
                    <div className="pb-settings-util pb-chart-fill" aria-hidden="true">
                      <span className={`pb-settings-util-fill ${utilTone(share)}`} style={{ transform: `scaleX(${Math.min(1, share)})` }} />
                    </div>
                  )}
                  <div className="pb-settings-acct-credit-line">
                    {share !== null && (
                      <span className="pb-tnum">{t(d.ux.settings.utilisation, { pct: Math.round(share * 100) })}</span>
                    )}
                    {daysLeft !== null && (
                      <span className={`pb-settings-due pb-tnum${daysLeft <= 3 && owed > 0.004 ? ' is-soon' : ''}`}>
                        <CalendarClock size={12} aria-hidden="true" />
                        {daysLeft === 0 ? d.ux.settings.dueToday
                          : daysLeft === 1 ? d.ux.settings.dueTomorrow
                          : t(d.ux.settings.dueInDays, { count: daysLeft })}
                      </span>
                    )}
                  </div>
                </div>
              )}
              {a.kind === 'credit' && a.creditLimit !== null && a.dueDay !== null && (
                // The limit is money (blurred in privacy mode); the due day is
                // a date and stays readable - it used to blur with the line.
                <p className="pb-settings-acct-summary">
                  <MoneyTemplate
                    template={d.accounts.cardSummary} slot="limit"
                    money={formatCurrency(a.creditLimit)} values={{ day: dayText(a.dueDay) }}
                  />
                </p>
              )}

              {/* Second line, left-aligned. Absent entirely for the defaults,
                  which are neither hibernatable nor deletable - so they stay a
                  single line and gain no height. */}
              {!a.isDefault && (
                <div className="pb-settings-acct-actions">
                  {a.kind === 'credit' && (
                    <button
                      type="button" onClick={() => (editingCard === a.id ? setEditingCard(null) : openCardEditor(a))}
                      className="icon-btn pb-settings-iconbtn is-round" aria-expanded={editingCard === a.id}
                      aria-label={t(d.accounts.editCard, { name: a.name })} title={t(d.accounts.editCard, { name: a.name })}
                    >
                      <Pencil size={15} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => toggleSleep(a)} disabled={sleepBusy === a.id}
                    className="icon-btn pb-settings-iconbtn is-round"
                    aria-label={t(st === 'hibernated' ? d.accounts.wakeLabel : d.accounts.hibernateLabel, { name: a.name })}
                  >
                    {st === 'hibernated' ? <AlarmClock size={15} /> : <BedDouble size={15} />}
                  </button>
                  <button disabled={deleteLocked} title={deleteLocked ? d.safetyLocks.lockedHint : undefined}
                    type="button" onClick={() => setConfirmDelete(a)} className="icon-btn pb-settings-iconbtn is-round"
                    aria-label={t(d.accounts.deleteLabel, { name: a.name })}
                    style={{ opacity: deleteLocked ? 0.4 : 1, cursor: deleteLocked ? 'not-allowed' : 'pointer' }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              )}

              {rowErrorId === a.id && error && (
                <ActionError message={error} kind={errorKind} busy={saving} />
              )}

              {editingCard === a.id && (
                <div className="goal-step" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', padding: '0.4rem 0 0.2rem' }}>
                  <label style={labelStyle}>
                    {d.accounts.creditLimitLabel}
                    <input value={editLimit} onChange={(e) => setEditLimit(e.target.value)} inputMode="decimal" className="font-mono-tab" style={inputStyle} />
                  </label>
                  <label style={labelStyle}>
                    {d.accounts.dueDayLabel}
                    <select value={editDue} onChange={(e) => setEditDue(Number(e.target.value))} style={inputStyle}>{dayOptions}</select>
                  </label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button type="button" onClick={() => setEditingCard(null)} disabled={saving} className="pill" style={{ flex: 1, padding: '0.5rem' }}>
                      {d.accounts.cancel}
                    </button>
                    <button type="button" onClick={() => handleCardSave(a)} disabled={saving || !cardChanged(a)} className="btn-primary" style={{ flex: 1, padding: '0.5rem' }}>
                      {d.accounts.cardSave}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ));
        })}
       </div>
      </div>

      {deleteLocked && visible.some((a) => !a.isDefault) && (
        <p data-lock-hint style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', lineHeight: 1.45, margin: '0 0 1rem' }}>
          {d.safetyLocks.lockedHint}
        </p>
      )}

      {adding ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
          <label style={labelStyle}>
            {d.accounts.nameLabel}
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={d.accounts.namePlaceholder} style={inputStyle} />
          </label>

          <div role="group" style={{ display: 'flex', gap: '0.5rem' }}>
            {(['bank', 'cash', 'credit'] as const).map((k) => (
              <button
                key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k}
                className={`pill ${kind === k ? 'active' : ''}`}
                style={{ flex: 1, padding: '0.5rem' }}
              >
                {k === 'bank' ? d.accounts.kindBank : k === 'cash' ? d.accounts.kindCash : d.accounts.kindCredit}
              </button>
            ))}
          </div>

          {/* Only for bank accounts: the database CHECK forbids last4 on cash,
              so offering a field that must stay empty would invite an error. */}
          {(kind === 'bank' || kind === 'credit') && (
            <label style={labelStyle}>
              {d.accounts.last4Label}
              <input
                value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                inputMode="numeric" placeholder="0000" className="font-mono-tab" style={inputStyle}
              />
            </label>
          )}

          {kind === 'credit' && (
            <>
              <label style={labelStyle}>
                {d.accounts.creditLimitLabel}
                <input value={limit} onChange={(e) => setLimit(e.target.value)} inputMode="decimal" placeholder="2000" className="font-mono-tab" style={inputStyle} />
              </label>
              <label style={labelStyle}>
                {d.accounts.dueDayLabel}
                <select value={dueDay} onChange={(e) => setDueDay(Number(e.target.value))} style={inputStyle}>{dayOptions}</select>
                <span style={{ fontSize: '0.72rem' }}>{d.accounts.dueDayHint}</span>
              </label>
            </>
          )}


          <ActionError message={error} kind={errorKind} onRetry={handleCreate} busy={saving} />

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" onClick={resetForm} disabled={saving} className="pill" style={{ flex: 1, padding: '0.6rem' }}>
              {d.accounts.cancel}
            </button>
            <button type="button" onClick={handleCreate} disabled={saving} className="btn-primary" style={{ flex: 1, padding: '0.6rem' }}>
              {saving ? d.common.saving : d.accounts.create}
            </button>
          </div>
        </div>
      ) : (
        <>
          <ActionError message={rowErrorId ? null : error} kind={errorKind} busy={saving} style={{ marginBottom: '0.8rem' }} />
          <button type="button" onClick={() => { setAdding(true); setError(null); }} className="pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0.5rem 0.9rem' }}>
            <Plus size={14} />{d.accounts.addAccount}
          </button>
        </>
      )}

      {moveSource && (
        <AccountMoveDialog
          source={moveSource}
          allAccounts={accounts}
          onClose={() => setMoveSource(null)}
          onMoved={() => setMoveSource(null)}
        />
      )}

      {confirmDelete && (
        <AccountDeleteDialog account={confirmDelete} allAccounts={accounts} onClose={() => setConfirmDelete(null)} />
      )}
    </div>
  );
}
