'use client';

import { useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Coins, CreditCard, Landmark, BedDouble } from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { Account } from '@/lib/data/mappers';
import { formatCurrency, formatDate, splitCents } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import type { Locale } from '@/lib/i18n/locale';
import type { ExpenseTransaction } from '@/types';
import { SleepingBadge } from '@/components/shared/SleepingBadge';
import { Sparkline } from '@/components/kit/Sparkline';
import { CreditCardTile, DueLine, LimitMeter, creditFacts } from './CreditCardTile';
import { useOrderedAccounts } from '@/lib/useOrderedAccounts';
import { AccountOrderControl } from '@/components/shared/AccountOrderControl';
import { useWidth } from './useWidth';

export interface DayPointLite {
  date: string;
  byAccount: Record<string, number>;
}

type TipItem = { payload?: { date?: string; v?: number } };

// The section's own width: narrower than this, bank and cash accounts are
// compact rows that expand in place instead of 230px-tall tiles.
const COMPACT = 560;
const EMPTY_BALANCES: Record<string, number> = {};

interface Item {
  a: Account;
  now: number;
  then: number;
}

/**
 * Your accounts, grouped: Bank & cash, Credit cards and (when any) the
 * hibernated ones, each under a header with its count and subtotal. On a
 * Mac, bank and cash accounts are tiles in a grid; on a phone they are
 * compact rows (about 64px instead of 230px) that expand in place. Credit
 * cards are drawn as cards (CreditCardTile) everywhere.
 *
 * Every field of the original cards is still here: balance, change over the
 * period, mini chart with its tooltip, share of the total, last activity;
 * for cards, owed, limit, due sentence and Pay off. Order within a group is
 * controlled by the shared sort preference (larger balances first by default).
 * Account names are USER DATA.
 */
export function AccountCards({
  accounts, days, total, lastActivity, period, onPayOff, expenses = [],
  today, onOpen, changeOver, sparkLabel, periodChip,
}: {
  accounts: Account[];
  days: DayPointLite[];
  /** Total balance on the last day. */
  total: number;
  /** accountId -> latest record date up to today. */
  lastActivity: Map<string, string>;
  period: string;
  /** Credit cards only: opens the Pay off dialog. */
  onPayOff?: (a: Account) => void;
  /** Expense rows, for each card's due and overdue amounts. */
  expenses?: ExpenseTransaction[];
  /** The page's zone-aware today; falls back to the device's day. */
  today?: string;
  /** Opens an account's detail sheet. */
  onOpen?: (a: Account) => void;
  /** "Last 6 months" / "Since Jun 1" - defaults to d.accountsPage.changeOver. */
  changeOver?: string;
  sparkLabel?: (name: string) => string;
  /** The PeriodLink chip, shown beside the heading. */
  periodChip?: ReactNode;
}) {
  const { d, t } = useTranslation();
  const x = d.ux.accounts;
  const ref = useRef<HTMLElement>(null);
  const width = useWidth(ref);
  const compact = width > 0 && width < COMPACT;

  const orderedAccounts = useOrderedAccounts(accounts, days[days.length - 1]?.byAccount ?? EMPTY_BALANCES, 'balance');

  const groups = useMemo(() => {
    if (days.length === 0) return null;
    const first = days[0];
    const last = days[days.length - 1];
    const shown: Item[] = orderedAccounts
      .filter((a) => a.status === 'active' || a.status === 'hibernated')
      .map((a) => ({ a, now: Math.round((last.byAccount[a.id] ?? 0) * 100) / 100, then: Math.round((first.byAccount[a.id] ?? 0) * 100) / 100 }));
    return {
      count: shown.length,
      bank: shown.filter((i) => i.a.status === 'active' && i.a.kind !== 'credit'),
      cards: shown.filter((i) => i.a.status === 'active' && i.a.kind === 'credit'),
      // Sleeping accounts gather at the end, so they no longer sit between
      // active ones by balance. Their money still counts in every total.
      sleeping: shown.filter((i) => i.a.status === 'hibernated'),
    };
  }, [orderedAccounts, days]);

  const dayToday = today ?? (() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  })();
  if (!groups || groups.count === 0) return null;

  const words = { changeOver: changeOver ?? t(d.accountsPage.changeOver, { period }), sparkLabel: sparkLabel ?? ((name: string) => t(d.accountsPage.sparkLabel, { name, period })) };
  const countText = (n: number) => (n === 1 ? x.countOne : t(x.countMany, { count: n }));
  let rise = 0;

  const renderBank = (list: Item[]) => compact ? (
    <ul className="card pb-accounts-rows pb-rise" style={{ ['--pb-i' as string]: rise++ }}>
      {list.map((i) => (
        <BankRow key={i.a.id} item={i} days={days} total={total} seen={lastActivity.get(i.a.id)} words={words} onOpen={onOpen} />
      ))}
    </ul>
  ) : (
    <div className="pb-accounts-grid">
      {list.map((i) => (
        <BankTile key={i.a.id} item={i} days={days} total={total} seen={lastActivity.get(i.a.id)} words={words} onOpen={onOpen} index={rise++} />
      ))}
    </div>
  );
  const renderCards = (list: Item[]) => (
    <div className="pb-accounts-cc-grid">
      {list.map((i) => (
        <CreditCardTile key={i.a.id} a={i.a} now={i.now} expenses={expenses} today={dayToday} onPayOff={onPayOff} onOpen={onOpen} index={rise++} />
      ))}
    </div>
  );

  const bankSum = groups.bank.reduce((s, i) => s + i.now, 0);
  const owedSum = groups.cards.reduce((s, i) => s + Math.max(0, -i.now), 0);
  const sleepSum = groups.sleeping.reduce((s, i) => s + i.now, 0);
  const sleepingCards = groups.sleeping.filter((i) => i.a.kind === 'credit');
  const sleepingBank = groups.sleeping.filter((i) => i.a.kind !== 'credit');

  return (
    <section aria-labelledby="pb-your-accounts" className="pb-accounts-wallet" ref={ref}>
      <div className="pb-accounts-wallet-head">
        <h3 id="pb-your-accounts">{d.accountsPage.yourAccounts}</h3>
        {periodChip}
      </div>

      {groups.count > 1 && <AccountOrderControl accounts={orderedAccounts} />}

      {groups.bank.length > 0 && (
        <Group id="bank" icon={Landmark} title={x.sectionBankCash} count={countText(groups.bank.length)} subtotal={formatCurrency(bankSum)}>
          {renderBank(groups.bank)}
        </Group>
      )}
      {groups.cards.length > 0 && (
        <Group id="cards" icon={CreditCard} title={x.sectionCards} count={countText(groups.cards.length)} subtotal={formatCurrency(owedSum)} subtotalNote={d.accountsPage.cardOwed}>
          {renderCards(groups.cards)}
        </Group>
      )}
      {groups.sleeping.length > 0 && (
        <Group id="sleeping" icon={BedDouble} title={d.accounts.hibernated} count={countText(groups.sleeping.length)} subtotal={formatCurrency(sleepSum)} quiet>
          {sleepingBank.length > 0 && renderBank(sleepingBank)}
          {sleepingCards.length > 0 && renderCards(sleepingCards)}
        </Group>
      )}
    </section>
  );
}

function Group({ id, icon: Icon, title, count, subtotal, subtotalNote, quiet = false, children }: {
  id: string;
  icon: typeof Landmark;
  title: string;
  count: string;
  subtotal: string;
  subtotalNote?: string;
  quiet?: boolean;
  children: ReactNode;
}) {
  const headId = `pb-accounts-group-${id}`;
  return (
    <section className={`pb-accounts-group${quiet ? ' is-quiet' : ''}`} aria-labelledby={headId}>
      {/* Sticks under the glass header on a phone while its section scrolls. */}
      <div className="pb-accounts-group-head">
        <span className="pb-accounts-group-icon" aria-hidden="true"><Icon size={14} /></span>
        <h4 id={headId}>{title}</h4>
        <span className="pb-accounts-group-count pb-tnum">{count}</span>
        <span className="pb-accounts-group-sum">
          <span className="font-mono-tab">{subtotal}</span>
          {subtotalNote && <span className="pb-accounts-group-note"> {subtotalNote}</span>}
        </span>
      </div>
      <div className="pb-accounts-group-body">{children}</div>
    </section>
  );
}

/** The figures every bank or cash account shows, in both layouts. */
function bankFacts(item: Item, days: DayPointLite[], total: number, noChange: string) {
  const { a, now, then } = item;
  const change = Math.round((now - then) * 100) / 100;
  const tone = change > 0 ? 'var(--pine)' : change < 0 ? 'var(--wine)' : 'var(--ink-soft)';
  const pct = then !== 0 ? ` (${change >= 0 ? '+' : '−'}${Math.abs((change / Math.abs(then)) * 100).toFixed(1)}%)` : '';
  // The amount and the percent apart, so a narrow row can drop the percent.
  const changeAmount = change === 0 ? noChange : `${change > 0 ? '+' : '−'}${formatCurrency(Math.abs(change))}`;
  const changePct = change === 0 ? '' : pct;
  const changeText = `${changeAmount}${changePct}`;
  const share = total > 0 && now > 0 ? Math.round((now / total) * 100) : null;
  const data = days.map((p) => ({ date: p.date, v: Math.round((p.byAccount[a.id] ?? 0) * 100) / 100 }));
  const gradId = `spark-${a.id.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return { change, tone, changeText, changeAmount, changePct, share, data, gradId };
}

type Words = { changeOver: string; sparkLabel: (name: string) => string };

function NameLine({ a, last4 = true, badge = true }: { a: Account; last4?: boolean; badge?: boolean }) {
  const Icon = a.kind === 'bank' ? Landmark : Coins;
  return (
    <>
      <span className={`pb-accounts-chip is-${a.kind}`} aria-hidden="true"><Icon size={15} /></span>
      {/* Ellipsis on the element holding the text, so the AppShell tooltip
          shows the full name on hover. */}
      <span className="pb-accounts-name">
        {a.name}
        {last4 && a.last4 && <span className="font-mono-tab pb-accounts-last4"> ····{a.last4}</span>}
      </span>
      {badge && a.status === 'hibernated' && <SleepingBadge />}
    </>
  );
}

/** The sparkline's tooltip: 'date · amount'. */
function SparkTip({ active, payload, locale }: { active?: boolean; payload?: ReadonlyArray<TipItem>; locale: Locale }) {
  const p = payload?.[0]?.payload;
  if (!active || !p?.date) return null;
  return (
    <div className="pb-accounts-tip is-compact">
      <span className="pb-accounts-tip-date">{formatDate(p.date, locale)}</span>
      {' · '}
      <span className="font-mono-tab pb-accounts-tip-amount">{formatCurrency(p.v ?? 0)}</span>
    </div>
  );
}

/** The original per-account mini chart: Recharts, its own gradient id, a compact tooltip. */
function AccountSpark({ data, tone, gradId, label, height }: { data: { date: string; v: number }[]; tone: string; gradId: string; label: string; height: number }) {
  const { locale } = useTranslation();
  return (
    <div className="pb-chart-fade pb-accounts-spark" style={{ height }} role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={tone} stopOpacity={0.24} />
              <stop offset="95%" stopColor={tone} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Tooltip content={<SparkTip locale={locale} />} cursor={{ stroke: 'var(--line)' }} allowEscapeViewBox={{ x: false, y: true }} />
          <Area type="linear" dataKey="v" stroke={tone} strokeWidth={1.75} fill={`url(#${gradId})`} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function BankTile({ item, days, total, seen, words, onOpen, index }: {
  item: Item; days: DayPointLite[]; total: number; seen?: string; words: Words; onOpen?: (a: Account) => void; index: number;
}) {
  const { d, t, locale } = useTranslation();
  const { a, now } = item;
  const f = bankFacts(item, days, total, d.accountsPage.noChange);
  const { whole, cents } = splitCents(formatCurrency(now));
  return (
    <article
      className={`card pb-accounts-tile is-${a.kind} pb-rise${a.status === 'hibernated' ? ' is-sleeping' : ''}${onOpen ? ' is-openable' : ''}`}
      style={{ ['--pb-i' as string]: index }}
      // A pointer shortcut; the chevron button is the control itself.
      // Not from the sparkline, whose tooltip has its own tap.
      onClick={onOpen ? (e) => { if (!(e.target as HTMLElement).closest('button, a, .pb-chart-fade, .pb-chart-fill')) onOpen(a); } : undefined}
    >
      <div className="pb-accounts-tile-head">
        {/* The sleeping badge sits by the figure, so a tile's name keeps its width. */}
        <NameLine a={a} badge={false} />
        {onOpen && (
          <button type="button" className="pb-accounts-open" onClick={() => onOpen(a)} aria-label={t(d.ux.accounts.openAccount, { name: a.name })}>
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        )}
      </div>
      <div>
        <div className="pb-accounts-tile-balrow">
          <p className="font-display pb-money pb-accounts-tile-bal">{whole}<span className="pb-accounts-cents">{cents}</span></p>
          {a.status === 'hibernated' && <SleepingBadge />}
        </div>
        <p className="font-mono-tab pb-accounts-change" style={{ color: f.tone }}>
          <span className="pb-accounts-change-label">{words.changeOver} · </span>{f.changeText}
        </p>
      </div>
      <AccountSpark data={f.data} tone={f.tone} gradId={f.gradId} label={words.sparkLabel(a.name)} height={64} />
      <p className="pb-accounts-tile-foot">
        <span>{seen ? t(d.accountsPage.lastActivity, { date: formatDate(seen, locale) }) : d.accountsPage.noActivity}</span>
        {f.share !== null && <span className="font-mono-tab">{t(d.accountsPage.shareOfTotal, { pct: `${f.share}%` })}</span>}
      </p>
    </article>
  );
}

/**
 * Phone row: name, last activity, a word-sized trend and the balance; a tap
 * expands it in place to the full mini chart (with its tooltip), the
 * period's change and the share, plus a way into the account. The expanded
 * part mounts on first open, so a long list does not build every chart.
 */
function BankRow({ item, days, total, seen, words, onOpen }: {
  item: Item; days: DayPointLite[]; total: number; seen?: string; words: Words; onOpen?: (a: Account) => void;
}) {
  const { d, t, locale } = useTranslation();
  const x = d.ux.accounts;
  const { a, now } = item;
  const [open, setOpen] = useState(false);
  const [built, setBuilt] = useState(false);
  const panelId = `pb-accounts-row-${useId().replace(/:/g, '')}`;
  const f = bankFacts(item, days, total, d.accountsPage.noChange);
  const toggle = () => { setBuilt(true); setOpen((o) => !o); };
  return (
    <li className={`pb-accounts-row${open ? ' is-open' : ''}${a.status === 'hibernated' ? ' is-sleeping' : ''}`}>
      <button type="button" className="pb-accounts-row-btn" aria-expanded={open} aria-controls={panelId} onClick={toggle}>
        <span className="pb-accounts-row-main">
          {/* The last four ride on the name line, as on the tile, so the
              second line is only the last-activity sentence - and it wraps
              rather than losing its date. */}
          <span className="pb-accounts-row-line"><NameLine a={a} /></span>
          <span className="pb-accounts-row-sub">
            {seen ? t(d.accountsPage.lastActivity, { date: formatDate(seen, locale) }) : d.accountsPage.noActivity}
          </span>
        </span>
        <span className="pb-accounts-row-trend" aria-hidden="true">
          <Sparkline values={f.data.map((p) => p.v)} height={28} color={f.tone} area endDot={false} />
        </span>
        <span className="pb-accounts-row-fig">
          <span className="font-mono-tab pb-accounts-row-bal">{formatCurrency(now)}</span>
          {/* The percent gives way first on a very narrow row; the open
              panel below still shows the full change. */}
          <span className="font-mono-tab pb-accounts-row-change" style={{ color: f.tone }}>
            {f.changeAmount}{f.changePct && <span className="pb-accounts-row-pct">{f.changePct}</span>}
          </span>
        </span>
        <ChevronDown size={16} aria-hidden="true" className="pb-accounts-row-chev" />
      </button>
      <div id={panelId} className={`collapsible-rows${open ? ' expanded' : ''}`} aria-hidden={!open} inert={!open}>
        <div className="collapsible-rows-inner">
          {built && (
            <div className="pb-accounts-row-panel">
              <AccountSpark data={f.data} tone={f.tone} gradId={f.gradId} label={words.sparkLabel(a.name)} height={56} />
              <p className="font-mono-tab pb-accounts-change" style={{ color: f.tone }}>
                <span className="pb-accounts-change-label">{words.changeOver} · </span>{f.changeText}
              </p>
              <div className="pb-accounts-row-panel-foot">
                {f.share !== null ? <span className="font-mono-tab">{t(d.accountsPage.shareOfTotal, { pct: `${f.share}%` })}</span> : <span />}
                {onOpen && (
                  <button type="button" className="pill pb-accounts-details" onClick={() => onOpen(a)} aria-label={t(x.showDetails, { name: a.name })}>
                    {x.details}<ChevronRight size={14} aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

// Re-exported for the detail sheet, which shows the same card facts.
export { creditFacts, DueLine, LimitMeter };
