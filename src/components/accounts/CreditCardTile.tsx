'use client';

import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronRight, CreditCard } from 'lucide-react';
import type { Account } from '@/lib/data/mappers';
import type { ExpenseTransaction } from '@/types';
import { formatCurrency, formatDate, splitCents } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { descriptionTitle } from '@/lib/transactionDescription';
import { categoryLabel } from '@/lib/i18n/enumLabels';
import { cardStatus, daysFromTo, statementTimeline, type CardStatus, type ChargeState, type StatementTimeline } from '@/lib/creditCards';
import { SleepingBadge } from '@/components/shared/SleepingBadge';
import { ProgressRing } from '@/components/kit/ProgressRing';
import { useWidth } from './useWidth';
import { mouseOnly, useTapPopover } from './useTapPopover';

/** Everything a card's face and body show, from the shared statement rules. */
export function creditFacts(a: Account, now: number, expenses: ExpenseTransaction[], today: string) {
  const owed = Math.max(0, -now);
  const owes = owed > 0.004;
  const limit = a.creditLimit ?? 0;
  const over = limit > 0 && owed > limit + 0.004;
  const st = cardStatus(a, expenses, today);
  const isOverdue = !!st && st.overdue > 0.004;
  const dueSoon = !!st && !isOverdue && st.dueNow > 0.004 && st.daysLeft <= 3;
  return { owed, owes, limit, over, st, isOverdue, dueSoon };
}

/** The four due sentences, verbatim from the original card. */
export function DueLine({ st, owes, isOverdue, dueSoon }: { st: CardStatus; owes: boolean; isOverdue: boolean; dueSoon: boolean }) {
  const { d, t, locale } = useTranslation();
  const a = d.accountsPage;
  return (
    <p className={`pb-money pb-accounts-due${isOverdue ? ' is-overdue' : dueSoon ? ' is-soon' : ''}`}>
      {isOverdue
        ? t(a.cardOverdueLine, { date: formatDate(st.previous, locale), amount: formatCurrency(st.overdue) })
        : st.dueNow > 0.004
          ? t(a.cardDueAmount, { amount: formatCurrency(st.dueNow), date: formatDate(st.next, locale) })
          : owes
            ? a.cardNotYetDue
            : t(a.cardDue, { date: formatDate(st.next, locale) })}
    </p>
  );
}

/** Utilization: a ring (owed of limit) beside the original limit sentence. */
export function LimitMeter({ owed, limit, over }: { owed: number; limit: number; over: boolean }) {
  const { d, t } = useTranslation();
  const pct = limit > 0 ? Math.round((owed / limit) * 100) : 0;
  return (
    <div className="pb-accounts-limit">
      {/* The ring reveals how much is owed against a visible limit, so it
          blurs with the figures in privacy mode (pb-chart-fill). */}
      <ProgressRing
        value={limit > 0 ? owed / limit : 0} size={50} stroke={5}
        color={over ? 'var(--wine)' : 'var(--ink-soft)'}
        label={t(d.ux.accounts.utilizationLabel, { pct: `${pct}%` })}
        className="pb-chart-fill"
      >
        <span className="pb-tnum pb-accounts-limit-pct">{pct}%</span>
      </ProgressRing>
      <p className={`font-mono-tab pb-money pb-accounts-limit-line${over ? ' is-over' : ''}`}>
        {over
          ? t(d.accountsPage.cardOverLimit, { amount: formatCurrency(owed - limit) })
          : t(d.accountsPage.cardLimitLine, { used: formatCurrency(owed), limit: formatCurrency(limit), available: formatCurrency(limit - owed) })}
      </p>
    </div>
  );
}

/**
 * A card's statement on one track: from the previous statement's cut-off to
 * the next due date. The darker band is this statement (charges due on the
 * next date), the lighter one the next statement. One dot per charge -
 * filled when due, hollow when it rolls to the next statement, wine when its
 * due date has passed. A tick marks the cut-off and a line marks today.
 *
 * Charges a few days apart would draw overlapping dots that a finger could
 * not tell apart, so dots closer than MERGE_PX merge into one marked with
 * the count; its popover lists each charge. Arrow keys rove across the
 * merged list, and each merged dot's label names every charge in it.
 *
 * Not a balance graph (the card keeps that documented decision): it shows the
 * statement mechanics. Wears pb-chart-fade, so the spending pattern blurs in
 * privacy mode until tapped.
 */
const MERGE_PX = 18;
const STATE_RANK: Record<ChargeState, number> = { next: 0, due: 1, overdue: 2 };
const POP_MAX = 5;
/** Where a date sits along the track, 0-100. */
const trackPos = (tl: StatementTimeline, span: number, date: string) => Math.max(0, Math.min(1, daysFromTo(tl.cutPrev, date) / span)) * 100;

export function StatementTrack({ card, charges, today, st }: {
  card: Account;
  charges: ExpenseTransaction[];
  today: string;
  st: CardStatus;
}) {
  const { d, t, locale } = useTranslation();
  const x = d.ux.accounts;
  const tl = useMemo<StatementTimeline | null>(() => statementTimeline(card, charges, today), [card, charges, today]);
  const [active, setActive] = useState<number | null>(null);
  const [focusIdx, setFocusIdx] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const dotsRef = useRef<HTMLDivElement>(null);
  const width = useWidth(rootRef);
  const tapFor = useTapPopover(rootRef, active, setActive);
  const titleById = useMemo(() => new Map(charges.map((c) => [c.id, descriptionTitle(c.description) || categoryLabel(d, c.category)])), [charges, d]);

  const span = tl ? Math.max(1, daysFromTo(tl.cutPrev, tl.next)) : 1;
  const pos = (date: string) => (tl ? trackPos(tl, span, date) : 0);
  // Groups of charges whose dots would overlap: within MERGE_PX of the
  // group's first dot (3% of the track until the width is measured).
  const clusters = useMemo(() => {
    if (!tl) return [];
    const near = width > 0 ? (MERGE_PX / width) * 100 : 3;
    const out: { at: number; points: StatementTimeline['points']; state: ChargeState }[] = [];
    for (const p of tl.points) {
      const at = trackPos(tl, span, p.date);
      const last = out[out.length - 1];
      if (last && at - last.at < near) {
        last.points.push(p);
        if (STATE_RANK[p.state] > STATE_RANK[last.state]) last.state = p.state;
      } else {
        out.push({ at, points: [p], state: p.state });
      }
    }
    // Each merged dot sits at its charges' midpoint.
    return out.map((c) => ({ ...c, at: c.points.length > 1 ? (c.at + trackPos(tl, span, c.points[c.points.length - 1].date)) / 2 : c.at }));
  }, [tl, span, width]);
  if (!tl) return null;

  const stateWord: Record<ChargeState, string> = { overdue: x.chargeOverdue, due: x.chargeInStatement, next: x.chargeNextStatement };
  const chargeLabel = (p: StatementTimeline['points'][number]) => t(x.chargeDot, { title: titleById.get(p.id) ?? '', date: formatDate(p.date, locale), amount: formatCurrency(p.amount), state: stateWord[p.state] });

  const chip = st.overdue > 0.004
    ? { tone: 'is-overdue', text: x.overdueChip }
    : { tone: st.dueNow > 0.004 && st.daysLeft <= 3 ? 'is-soon' : '', text: st.daysLeft <= 0 ? x.dueToday : st.daysLeft === 1 ? x.dueTomorrow : t(x.dueInDays, { count: st.daysLeft }) };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key) || clusters.length === 0) return;
    e.preventDefault();
    const last = clusters.length - 1;
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? last : e.key === 'ArrowLeft' ? Math.max(0, focusIdx - 1) : Math.min(last, focusIdx + 1);
    setFocusIdx(next);
    setActive(next);
    dotsRef.current?.querySelector<HTMLElement>(`[data-i="${next}"]`)?.focus();
  };

  const tab = Math.min(focusIdx, Math.max(0, clusters.length - 1));
  const shown = active !== null ? clusters[active] ?? null : null;

  return (
    <div className="pb-accounts-track-wrap" ref={rootRef}>
      <div className="pb-accounts-track-top">
        <span className={`pb-accounts-countdown ${chip.tone}`}>{chip.text}</span>
        <span className="pb-accounts-track-caption pb-tnum">{t(x.statementCloses, { date: formatDate(tl.cutNow, locale) })}</span>
      </div>
      <div className="pb-chart-fade pb-accounts-track" role="group" aria-label={x.timelineLabel}>
        <span className="pb-accounts-track-todaylabel" aria-hidden="true" style={{ left: `clamp(1rem, ${pos(today)}%, calc(100% - 1rem))` }}>{x.today}</span>
        <div className="pb-accounts-track-line" aria-hidden="true">
          <span className="pb-accounts-track-band is-now" style={{ width: `${pos(tl.cutNow)}%` }} />
          <span className="pb-accounts-track-tick" style={{ left: `${pos(tl.cutNow)}%` }} />
          <span className="pb-accounts-track-tick is-due" style={{ left: `${pos(tl.previous)}%` }} />
          <span className="pb-accounts-track-today" style={{ left: `${pos(today)}%` }} />
        </div>
        <div className="pb-accounts-track-dots" ref={dotsRef} onKeyDown={onKey} onPointerLeave={mouseOnly(() => setActive(null))}>
          {clusters.map((c, k) => {
            const many = c.points.length > 1;
            return (
              <button
                key={c.points[0].id} type="button" data-i={k}
                className={`pb-accounts-dot is-${c.state}${many ? ' is-many' : ''}${active === k ? ' is-active' : ''}`}
                style={{ left: `${c.at}%` }}
                tabIndex={k === tab ? 0 : -1}
                aria-label={c.points.map(chargeLabel).join('; ')}
                onPointerEnter={mouseOnly(() => setActive(k))}
                onFocus={() => { setActive(k); setFocusIdx(k); }} onBlur={() => setActive(null)}
                {...tapFor(k)}
              >
                {many && <span className="pb-tnum" aria-hidden="true">{c.points.length}</span>}
              </button>
            );
          })}
        </div>
        {shown && (
          <div className={`pb-accounts-pop pb-accounts-track-pop${shown.points.length > 1 ? ' is-list' : ''}`} aria-hidden="true" style={{ left: `clamp(5.5rem, ${shown.at}%, calc(100% - 5.5rem))` }}>
            {shown.points.length === 1 ? (
              <>
                <span className="pb-accounts-pop-title">{titleById.get(shown.points[0].id)}</span>
                <span className="pb-accounts-pop-meta pb-tnum">{formatDate(shown.points[0].date, locale)} · {stateWord[shown.points[0].state]}</span>
                <span className="font-mono-tab pb-accounts-pop-amount">{formatCurrency(shown.points[0].amount)}</span>
              </>
            ) : (
              <>
                <span className="pb-accounts-pop-meta pb-tnum">{t(x.chargesCount, { count: shown.points.length })}</span>
                {shown.points.slice(0, POP_MAX).map((p) => (
                  <span key={p.id} className="pb-accounts-pop-item">
                    <span className="pb-accounts-pop-item-text">
                      <span className="pb-accounts-pop-title">{titleById.get(p.id)}</span>
                      <span className="pb-accounts-pop-meta pb-tnum">{formatDate(p.date, locale)} · {stateWord[p.state]}</span>
                    </span>
                    <span className="font-mono-tab pb-accounts-pop-amount">{formatCurrency(p.amount)}</span>
                  </span>
                ))}
                {shown.points.length > POP_MAX && <span className="pb-accounts-pop-meta pb-tnum">{t(x.moreCharges, { count: shown.points.length - POP_MAX })}</span>}
              </>
            )}
          </div>
        )}
        <div className="pb-accounts-track-labels pb-tnum" aria-hidden="true">
          {/* Under its own tick, not at the track's start (the track begins at
              the previous statement's cut-off). */}
          <span className="pb-accounts-track-labels-prev" style={{ left: `${pos(tl.previous)}%` }}>{t(x.lastDue, { date: formatDate(tl.previous, locale) })}</span>
          <span>{t(x.nextDue, { date: formatDate(tl.next, locale) })}</span>
        </div>
      </div>
      {tl.points.length === 0 && <p className="pb-accounts-track-empty">{x.noChargesYet}</p>}
    </div>
  );
}

/**
 * A credit card, drawn as one: a deep neutral face (glyph, name, what is
 * owed, the last four digits), with its utilization ring, statement track,
 * due sentence and Pay off beside it on a wide screen and under it on a
 * phone. Still no balance graph: paying off moves charges to a bank account
 * with their dates, so a card's history only ever shows what is unpaid.
 */
export function CreditCardTile({ a, now, expenses, today, onPayOff, onOpen, index = 0 }: {
  a: Account;
  now: number;
  /** Expense rows, for each card's due and overdue amounts. */
  expenses: ExpenseTransaction[];
  /** Zone-aware 'YYYY-MM-DD', the same day the page's chart ends on. */
  today: string;
  onPayOff?: (a: Account) => void;
  onOpen?: (a: Account) => void;
  index?: number;
}) {
  const { d, t } = useTranslation();
  const x = d.ux.accounts;
  const hibernated = a.status === 'hibernated';
  const f = creditFacts(a, now, expenses, today);
  const charges = useMemo(() => expenses.filter((c) => c.accountId === a.id), [expenses, a.id]);
  const { whole, cents } = splitCents(formatCurrency(f.owed));

  return (
    <article
      className={`card pb-accounts-cc pb-rise${hibernated ? ' is-sleeping' : ''}${onOpen ? ' is-openable' : ''}`}
      style={{ ['--pb-i' as string]: index }}
      // A pointer shortcut; the chevron button is the control itself. Not
      // from the ring or the statement track, which have their own taps.
      onClick={onOpen ? (e) => { if (!(e.target as HTMLElement).closest('button, a, .pb-chart-fade, .pb-chart-fill')) onOpen(a); } : undefined}
    >
      <div className="pb-accounts-cc-face">
        <div className="pb-accounts-cc-row">
          <CreditCard size={18} aria-hidden="true" className="pb-accounts-cc-glyph" />
          <span className="pb-accounts-cc-name">{a.name}</span>
          {onOpen && (
            <button type="button" className="pb-accounts-cc-open" onClick={() => onOpen(a)} aria-label={t(x.openAccount, { name: a.name })}>
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          )}
        </div>
        <div className="pb-accounts-cc-owed">
          <p className="font-display pb-money">{whole}<span className="pb-accounts-cents">{cents}</span></p>
          <p className="pb-accounts-cc-owed-word">{f.owes ? d.accountsPage.cardOwed : d.accountsPage.cardNothingOwed}</p>
        </div>
        <div className="pb-accounts-cc-row is-bottom">
          {a.last4 ? <span className="font-mono-tab pb-accounts-cc-num">····&nbsp;{a.last4}</span> : <span />}
          {hibernated ? <SleepingBadge onHero /> : <span className="pb-accounts-cc-kind">{d.accounts.kindCredit}</span>}
        </div>
      </div>

      <div className="pb-accounts-cc-body">
        {f.limit > 0 && <LimitMeter owed={f.owed} limit={f.limit} over={f.over} />}
        {f.st && <StatementTrack card={a} charges={charges} today={today} st={f.st} />}
        {f.st && <DueLine st={f.st} owes={f.owes} isOverdue={f.isOverdue} dueSoon={f.dueSoon} />}
        {onPayOff && (
          <button type="button" className="btn-primary pb-accounts-payoff" onClick={() => onPayOff(a)} disabled={!f.owes}>
            {d.accounts.payOffAction}
          </button>
        )}
      </div>
    </article>
  );
}
