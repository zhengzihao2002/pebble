'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { LoadingOverlay } from '@/components/shared/Spinner';
import { ModalFrame } from '@/components/shared/ModalFrame';
import { ModalCloseButton } from '@/components/shared/ModalCloseButton';
import { SaveSuccess } from '@/components/shared/SaveSuccess';
import { SelectField, type SelectFieldOption } from '@/components/shared/SelectField';
import { moveAccountRecordsAction } from '@/lib/actions/pebble';
import { callAction } from '@/lib/actions/callAction';
import type { FailureKind } from '@/lib/actions/failureKind';
import { ActionError } from '@/components/shared/ActionError';
import type { Account } from '@/lib/data/mappers';
import type { ExpenseTransaction } from '@/types';
import { formatCurrency, formatDate } from '@/lib/format';
import { descriptionTitle } from '@/lib/transactionDescription';
import { categoryLabel } from '@/lib/i18n/enumLabels';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { translateActionError } from '@/lib/i18n/actionErrors';
import { cardStatus, statementTimeline, type ChargeState } from '@/lib/creditCards';

const pad = (n: number) => String(n).padStart(2, '0');

/** The next due date on or after today. Days 29-31 fall on the last day of shorter months. */
export function nextDue(dueDay: number): string {
  const now = new Date();
  const dayIn = (y: number, m: number) => Math.min(dueDay, new Date(y, m + 1, 0).getDate());
  let y = now.getFullYear();
  let m = now.getMonth();
  if (dayIn(y, m) < now.getDate()) {
    m += 1;
    if (m > 11) { m = 0; y += 1; }
  }
  return `${y}-${pad(m + 1)}-${pad(dayIn(y, m))}`;
}

/**
 * Pays off a credit card: the selected charges move from the card to a bank
 * or cash account, keeping their dates, amounts and categories. Underneath it
 * is the Settings record move (moveAccountRecords with transaction ids), which
 * already refuses inactive destinations and never lands on a card - so paying
 * off adds no server code. Total balance is unchanged; the card owes less.
 *
 * The charges come from the page's own data: no extra request.
 */
export function PayOffDialog({ card, allAccounts, charges, onClose, today: todayProp }: {
  card: Account;
  allAccounts: Account[];
  /** Every expense currently on this card. */
  charges: ExpenseTransaction[];
  onClose: () => void;
  /** Zone-aware 'YYYY-MM-DD' from the page, so due groups match its reminders.
      Optional: without it the device's day is used, as before. */
  today?: string;
}) {
  const { d, t, locale } = useTranslation();
  const x = d.ux.accounts;
  const [today] = useState(() => {
    if (todayProp) return todayProp;
    const now = new Date();
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  });
  const status = useMemo(() => cardStatus(card, charges, today), [card, charges, today]);

  const sources = allAccounts.filter((a) => a.status === 'active' && a.kind !== 'credit');
  const options = useMemo<SelectFieldOption[]>(
    () => sources.map((a) => ({ value: a.id, label: a.last4 ? `${a.name} ····${a.last4}` : a.name })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allAccounts],
  );
  const list = useMemo(
    () => [...charges].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [charges],
  );

  // The charges currently due are preselected, so a reminder's amount and the
  // Pay button agree; when nothing is due yet, every charge is.
  const [selected, setSelected] = useState<Set<string>>(() => {
    const due = cardStatus(card, charges, today)?.dueChargeIds ?? [];
    return new Set(due.length > 0 ? due : charges.map((c) => c.id));
  });

  // Charges grouped by statement, with the cut-offs cardStatus uses: overdue,
  // due on the next date, and rolling to the statement after. A card with no
  // due day has no statements, so its list stays one flat group.
  const groups = useMemo(() => {
    const tl = statementTimeline(card, charges, today);
    if (!tl) return [{ key: 'all' as const, title: '', ids: list.map((c) => c.id) }];
    const stateById = new Map(tl.points.map((p) => [p.id, p.state]));
    const order: { key: ChargeState; title: string }[] = [
      { key: 'overdue', title: t(x.groupOverdue, { date: formatDate(tl.previous, locale) }) },
      { key: 'due', title: t(x.groupDue, { date: formatDate(tl.next, locale) }) },
      { key: 'next', title: x.groupNext },
    ];
    return order
      .map((g) => ({ key: g.key, title: g.title, ids: list.filter((c) => stateById.get(c.id) === g.key).map((c) => c.id) }))
      .filter((g) => g.ids.length > 0);
  }, [card, charges, today, list, t, x, locale]);
  const byId = useMemo(() => new Map(list.map((c) => [c.id, c])), [list]);
  const [from, setFrom] = useState(() => (sources.find((a) => a.isPreferred) ?? sources[0])?.id ?? '');
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<FailureKind | undefined>(undefined);
  // Set ONLY below the failure return; a snapshot, so a refresh underneath
  // cannot change the line.
  const [success, setSuccess] = useState<{ title: string; body: string } | null>(null);

  const owed = charges.reduce((s, c) => s + Math.abs(c.amount), 0);
  const picked = list.filter((c) => selected.has(c.id));
  const total = picked.reduce((s, c) => s + Math.abs(c.amount), 0);
  const allPicked = list.length > 0 && picked.length === list.length;
  const canPay = !!from && picked.length > 0 && !paying;

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleGroup = (ids: string[]) => setSelected((prev) => {
    const next = new Set(prev);
    const all = ids.every((id) => next.has(id));
    for (const id of ids) { if (all) next.delete(id); else next.add(id); }
    return next;
  });

  const handlePay = async () => {
    if (!canPay || success) return;
    const amountText = formatCurrency(total);
    const accountText = options.find((o) => o.value === from)?.label ?? '';
    setPaying(true);
    setError(null);
    const result = await callAction(() => moveAccountRecordsAction({
      fromAccountId: card.id,
      toAccountId: from,
      transactionIds: picked.map((c) => c.id),
    }));
    setPaying(false);
    if (!result.ok) { setError(translateActionError(d, locale, result)); setErrorKind(result.kind); return; }
    // Below the failure return: the confirmation follows a confirmed move only.
    setSuccess({ title: d.accounts.payOffDone, body: t(d.accounts.payOffDoneBody, { amount: amountText, account: accountText }) });
  };

  const cardLabel = card.last4 ? `${card.name} ····${card.last4}` : card.name;

  return (
    <ModalFrame onClose={onClose} busy={paying} labelledBy="pay-off-title" maxWidth={520} zIndex={60}>
      {(close) => (
      <>
        {paying && <LoadingOverlay label={d.accounts.payOffPaying} />}

        <div className="pb-modal-head">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
            <h2 id="pay-off-title" className="font-display" style={{ flex: 1, minWidth: 0, fontSize: '1.2rem', fontWeight: 600, overflowWrap: 'anywhere' }}>
              {t(d.accounts.payOffTitle, { name: cardLabel })}
            </h2>
            <ModalCloseButton onClick={close} disabled={paying} />
          </div>
          {!success && list.length > 0 && (
            <p className="pb-money" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem', color: 'var(--ink-soft)' }}>
              {/* No due day means no due date: say what is owed, not a made-up "due the 1st". */}
              {status
                ? t(d.accounts.payOffOwed, { amount: formatCurrency(owed), date: formatDate(status.next, locale) })
                : t(x.payOffOwedNoDate, { amount: formatCurrency(owed) })}
            </p>
          )}
        </div>

        <div className="pb-modal-body themed-scroll">
          {success ? (
            <SaveSuccess title={success.title} body={success.body} onDone={close} />
          ) : list.length === 0 ? (
            <p style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', lineHeight: 1.5, margin: 0 }}>{d.accounts.payOffNothing}</p>
          ) : sources.length === 0 ? (
            <p style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', lineHeight: 1.5, margin: 0 }}>{d.accounts.noDestinations}</p>
          ) : (
            <>
              {/* A div, not a label: a click on the words must not reopen the list. */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.8rem', color: 'var(--ink-soft)', marginBottom: '1rem' }}>
                <span>{d.accounts.payOffFrom}</span>
                <SelectField value={from} onChange={setFrom} options={options} ariaLabel={d.accounts.payOffFrom} />
              </div>

              {/* How much of what is owed this payment clears; moves as boxes are ticked. */}
              <div className="pb-accounts-pay-progress">
                <p className="pb-money">{t(x.payingOf, { amount: formatCurrency(total), owed: formatCurrency(owed) })}</p>
                <div className="pb-accounts-pay-track pb-chart-fill" aria-hidden="true">
                  <span style={{ transform: `scaleX(${owed > 0 ? Math.min(1, total / owed) : 0})` }} />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.25rem' }}>
                <button
                  type="button" className="pill"
                  onClick={() => setSelected(allPicked ? new Set() : new Set(list.map((c) => c.id)))}
                  style={{ padding: '0.3rem 0.75rem', fontSize: '0.78rem' }}
                >
                  {allPicked ? d.accounts.payOffNone : d.accounts.payOffAll}
                </button>
              </div>

              <div>
                {groups.map((g) => {
                  const sum = g.ids.reduce((s, id) => s + Math.abs(byId.get(id)?.amount ?? 0), 0);
                  const on = g.ids.filter((id) => selected.has(id)).length;
                  return (
                    <div key={g.key} className={`pb-accounts-pay-group is-${g.key}`}>
                      {g.title && (
                        // Sticky inside the scrolling body, on mist so rows never show through.
                        <label className="pb-accounts-pay-head">
                          <GroupBox checked={on === g.ids.length} partial={on > 0 && on < g.ids.length} onChange={() => toggleGroup(g.ids)} label={t(x.selectGroup, { group: g.title })} />
                          <span className="pb-accounts-pay-head-title">{g.title}</span>
                          <span className="font-mono-tab pb-accounts-pay-head-sum">{formatCurrency(sum)}</span>
                        </label>
                      )}
                      {g.ids.map((id) => {
                        const c = byId.get(id)!;
                        return (
                          <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.6rem 0', borderBottom: '1px solid var(--line)', cursor: 'pointer' }}>
                            <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} style={{ flexShrink: 0 }} />
                            <span style={{ minWidth: 0, flex: 1 }}>
                              {/* Titles are USER DATA. */}
                              <span style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {descriptionTitle(c.description) || categoryLabel(d, c.category)}
                              </span>
                              <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--ink-soft)' }}>{formatDate(c.date, locale)}</span>
                            </span>
                            <span className="font-mono-tab" style={{ fontSize: '0.86rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                              {formatCurrency(Math.abs(c.amount))}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {!success && (
          <div className="pb-modal-foot">
            <ActionError message={error} kind={errorKind} onRetry={handlePay} busy={paying} />
            {list.length > 0 && sources.length > 0 && (
              <p className="pb-money" style={{ margin: '0 0 0.6rem', fontSize: '0.82rem', color: 'var(--ink-soft)', textAlign: 'center' }}>
                {t(picked.length === 1 ? d.accounts.payOffSummaryOne : d.accounts.payOffSummary, { amount: formatCurrency(total), count: picked.length })}
              </p>
            )}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" onClick={close} disabled={paying} className="pill" style={{ flex: 1, padding: '0.65rem', opacity: paying ? 0.6 : 1 }}>
                {d.accounts.cancel}
              </button>
              <button
                type="button" onClick={handlePay} disabled={!canPay} className="btn-primary"
                style={{ flex: 1, padding: '0.65rem', opacity: canPay ? 1 : 0.6 }}
              >
                {paying ? d.accounts.payOffPaying : t(d.accounts.payOffButton, { amount: formatCurrency(total) })}
              </button>
            </div>
          </div>
        )}
      </>
      )}
    </ModalFrame>
  );
}

/** A group's checkbox: ticked, clear, or part-ticked (indeterminate). */
function GroupBox({ checked, partial, onChange, label }: { checked: boolean; partial: boolean; onChange: () => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = partial; }, [partial]);
  return <input ref={ref} type="checkbox" checked={checked} onChange={onChange} aria-label={label} aria-checked={partial ? 'mixed' : checked} style={{ flexShrink: 0 }} />;
}
