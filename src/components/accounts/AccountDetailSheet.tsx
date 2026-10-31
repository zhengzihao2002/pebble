'use client';

import { RollingAmount } from '@/components/shared/RollingAmount';
import { useId, useMemo, useState } from 'react';
import Link from '@/components/loading/PendingLink';
import { ArrowDownLeft, ArrowRightLeft, ArrowUpRight, Coins, CreditCard, Landmark, ChevronRight, SlidersHorizontal } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Account } from '@/lib/data/mappers';
import type { BalanceAdjustment, ExpenseTransaction, IncomeTransaction } from '@/types';
import { formatCurrency, formatDate, splitCents } from '@/lib/format';
import { formatCompactCurrency } from '@/lib/chartFormat';
import { descriptionTitle } from '@/lib/transactionDescription';
import { categoryLabel } from '@/lib/i18n/enumLabels';
import { useTranslation } from '@/lib/i18n/useTranslation';
import type { Locale } from '@/lib/i18n/locale';
import { ModalFrame } from '@/components/shared/ModalFrame';
import { ModalCloseButton } from '@/components/shared/ModalCloseButton';
import { SleepingBadge } from '@/components/shared/SleepingBadge';
import { EmptyState } from '@/components/kit/EmptyState';
import { accountLabel, dateOf, recordsFor, round2, type AccountRecord, type DayPoint } from './accountMath';
import { DueLine, LimitMeter, StatementTrack, creditFacts } from './CreditCardTile';

const PAGE = 10;
const MONTHS_BACK = 6;

type TipPayload = { payload?: Record<string, number | string> };

function BalTip({ active, payload, locale }: { active?: boolean; payload?: ReadonlyArray<TipPayload>; locale: Locale }) {
  const p = payload?.[0]?.payload;
  if (!active || !p?.date) return null;
  return (
    <div className="pb-accounts-tip">
      <div className="pb-accounts-tip-date">{formatDate(String(p.date), locale)}</div>
      <div className="font-mono-tab pb-accounts-tip-amount"><RollingAmount value={formatCurrency(Number(p.v ?? 0))} /></div>
    </div>
  );
}

function MonthTip({ active, payload, labels }: {
  active?: boolean; payload?: ReadonlyArray<TipPayload>;
  labels: { moneyIn: string; transfersIn: string; moneyOut: string; transfersOut: string; correction: string; nothing: string };
}) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  const row = (label: string, v: number, signed = false) => (v ? (
    <div className="pb-accounts-tip-row"><span>{label}</span><span className="font-mono-tab">{signed ? (v > 0 ? '+' : '−') : ''}<RollingAmount value={formatCurrency(Math.abs(v))} /></span></div>
  ) : null);
  const vals = [Number(p.in), Number(p.tin), Number(p.out), Number(p.tout), Number(p.corr)];
  return (
    <div className="pb-accounts-tip">
      <div className="pb-accounts-tip-date">{String(p.label)}</div>
      {vals.every((v) => !v) ? (
        <div className="pb-accounts-tip-row"><span>{labels.nothing}</span></div>
      ) : (
        <>
          {row(labels.moneyIn, Number(p.in))}
          {row(labels.transfersIn, Number(p.tin))}
          {row(labels.moneyOut, Math.abs(Number(p.out)))}
          {row(labels.transfersOut, Math.abs(Number(p.tout)))}
          {/* Corrections are neither transfers nor earning: their own net line. */}
          {row(labels.correction, Number(p.corr), true)}
        </>
      )}
    </div>
  );
}

/**
 * One account's story in a tap: its balance at hero size, its own balance
 * line over the page's range (bank and cash; cards keep their no-graph rule
 * and show the statement instead), six months of money in and out, four
 * facts for the range, and its recent records - with the way to act on it.
 *
 * Everything is derived from what the page already loaded. A bottom sheet on
 * a phone (ModalFrame), a two-column card on a Mac. Global shortcuts are off
 * while it is open (AppShell skips them when a role=dialog exists).
 */
export function AccountDetailSheet({
  account, accounts, days, expenses, income, adjustments, today, lastActivity, rangeLabel, onClose, onTransfer, onPayOff,
}: {
  account: Account;
  accounts: Account[];
  days: DayPoint[];
  expenses: ExpenseTransaction[];
  income: IncomeTransaction[];
  adjustments: BalanceAdjustment[];
  today: string;
  lastActivity?: string;
  /** "Last 6 months" / "Since Jun 1", the page's range wording. */
  rangeLabel: string;
  onClose: () => void;
  onTransfer?: (a: Account) => void;
  onPayOff?: (a: Account) => void;
}) {
  const { d, t, locale } = useTranslation();
  const x = d.ux.accounts;
  const credit = account.kind === 'credit';
  const Icon = account.kind === 'bank' ? Landmark : account.kind === 'cash' ? Coins : CreditCard;
  const kindLabel = account.kind === 'bank' ? d.accounts.kindBank : account.kind === 'cash' ? d.accounts.kindCash : d.accounts.kindCredit;
  const gradId = `pb-accounts-detail-${useId().replace(/:/g, '')}`;
  const [shownCount, setShownCount] = useState(PAGE);

  const now = round2(days[days.length - 1]?.byAccount[account.id] ?? 0);
  const figure = credit ? Math.max(0, -now) : now;
  const { whole, cents } = splitCents(formatCurrency(figure));
  const series = useMemo(() => days.map((p) => ({ date: p.date, v: round2(p.byAccount[account.id] ?? 0) })), [days, account.id]);
  const tone = series.length > 1 && series[series.length - 1].v > series[0].v + 0.004 ? 'var(--pine)'
    : series.length > 1 && series[series.length - 1].v < series[0].v - 0.004 ? 'var(--wine)' : 'var(--ink-soft)';

  const records = useMemo(() => recordsFor(account.id, expenses, income, adjustments), [account.id, expenses, income, adjustments]);
  const from = days[0]?.date ?? today;
  const inRange = records.filter((r) => r.date >= from && r.date <= today);
  // Same meaning as the bars' Money in / Money out beside them: income and
  // spending only. Transfers and corrections get their own net line.
  const moneyIn = round2(inRange.filter((r) => r.kind === 'income').reduce((s, r) => s + r.amount, 0));
  const moneyOut = round2(Math.abs(inRange.filter((r) => r.kind === 'expense').reduce((s, r) => s + r.amount, 0)));
  const movesNet = round2(inRange.filter((r) => r.kind === 'transfer' || r.kind === 'correction').reduce((s, r) => s + r.amount, 0));
  const anyMoves = inRange.some((r) => r.kind === 'transfer' || r.kind === 'correction');
  const largest = inRange.filter((r) => r.kind === 'expense').reduce<AccountRecord | null>((m, r) => (!m || r.amount < m.amount ? r : m), null);

  // Six calendar months ending with today's: income and money moved in above
  // the axis, spending and money moved out below it. Transfers and balance
  // corrections share the grey bar ("Transfers and corrections"); the
  // tooltip names them apart.
  const months = useMemo(() => {
    const t0 = dateOf(today);
    const out = Array.from({ length: MONTHS_BACK }, (_, k) => {
      const m = new Date(t0.getFullYear(), t0.getMonth() - (MONTHS_BACK - 1 - k), 1);
      const key = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;
      // gin / gout: the grey bars (transfers plus corrections); tin / tout /
      // corr: the tooltip's split of them.
      return { key, label: m.toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', { month: 'short' }), in: 0, out: 0, gin: 0, gout: 0, tin: 0, tout: 0, corr: 0 };
    });
    const idx = new Map(out.map((m, k) => [m.key, k]));
    for (const r of records) {
      if (r.date > today) continue;
      const k = idx.get(r.date.slice(0, 7));
      if (k === undefined) continue;
      const m = out[k];
      if (r.kind === 'income' || r.kind === 'expense') {
        if (r.amount > 0) m.in = round2(m.in + r.amount); else m.out = round2(m.out + r.amount);
        continue;
      }
      if (r.amount > 0) m.gin = round2(m.gin + r.amount); else m.gout = round2(m.gout + r.amount);
      if (r.kind === 'correction') m.corr = round2(m.corr + r.amount);
      else if (r.amount > 0) m.tin = round2(m.tin + r.amount); else m.tout = round2(m.tout + r.amount);
    }
    return out;
  }, [records, today, locale]);
  const anyMonth = months.some((m) => m.in || m.out || m.gin || m.gout);

  const nameOf = (id: string | null) => {
    const a = id ? accounts.find((z) => z.id === id) : undefined;
    return a ? accountLabel(a) : '—';
  };
  const titleOf = (r: AccountRecord) => {
    if (r.kind === 'expense' || r.kind === 'income') return descriptionTitle(r.description) || categoryLabel(d, r.category);
    if (r.kind === 'transfer') return descriptionTitle(r.description) || (r.amount < 0 ? t(x.transferTo, { name: nameOf(r.otherAccountId) }) : t(x.transferFrom, { name: nameOf(r.otherAccountId) }));
    return descriptionTitle(r.description) || x.correction;
  };
  const subOf = (r: AccountRecord) => {
    // Only when the title is the user's own words; otherwise the title already says it.
    if (r.kind === 'transfer') return descriptionTitle(r.description) ? (r.amount < 0 ? t(x.transferTo, { name: nameOf(r.otherAccountId) }) : t(x.transferFrom, { name: nameOf(r.otherAccountId) })) : '';
    if (r.kind === 'correction') return descriptionTitle(r.description) ? x.correction : '';
    return categoryLabel(d, r.category);
  };

  const f = credit ? creditFacts(account, now, expenses, today) : null;
  const canTransfer = !credit && account.status === 'active' && !!onTransfer;
  const charges = useMemo(() => expenses.filter((c) => c.accountId === account.id), [expenses, account.id]);

  return (
    <ModalFrame onClose={onClose} labelledBy="pb-accounts-detail-title" maxWidth={780} zIndex={55} cardClassName="pb-accounts-detail">
      {(close) => (
        <>
          <div className="pb-modal-head">
            <div className="pb-accounts-detail-head">
              <span className={`pb-accounts-chip is-${account.kind}`} aria-hidden="true"><Icon size={16} /></span>
              <div className="pb-accounts-detail-titles">
                <h2 id="pb-accounts-detail-title" className="font-display">
                  {account.name}
                  {account.last4 && <span className="font-mono-tab pb-accounts-last4"> ····{account.last4}</span>}
                </h2>
                <p>
                  {kindLabel}
                  {account.status === 'hibernated' && <> <SleepingBadge /></>}
                </p>
              </div>
              <ModalCloseButton onClick={close} />
            </div>
          </div>

          <div className="pb-modal-body themed-scroll">
            <div className="pb-accounts-detail-grid">
              <div className="pb-accounts-detail-main">
                <div>
                  <p className="pb-accounts-detail-label">{credit ? x.owedLabel : x.balanceLabel}</p>
                  <p className="font-display pb-money pb-accounts-detail-figure"><RollingAmount value={whole + cents} fractionClassName="pb-accounts-cents" /></p>
                  {credit && <p className="pb-accounts-detail-sub">{f?.owes ? d.accountsPage.cardOwed : d.accountsPage.cardNothingOwed}</p>}
                </div>

                {credit && f ? (
                  <div className="pb-accounts-detail-credit">
                    {f.limit > 0 && <LimitMeter owed={f.owed} limit={f.limit} over={f.over} />}
                    {f.st && <StatementTrack card={account} charges={charges} today={today} st={f.st} />}
                    {f.st && <DueLine st={f.st} owes={f.owes} isOverdue={f.isOverdue} dueSoon={f.dueSoon} />}
                  </div>
                ) : (
                  <div className="pb-chart-fade pb-chart-fill pb-accounts-detail-chart" role="img" aria-label={t(x.balanceChartLabel, { name: account.name })}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={series} margin={{ top: 6, right: 4, left: 22, bottom: 0 }}>
                        <defs>
                          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={tone} stopOpacity={0.24} />
                            <stop offset="95%" stopColor={tone} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke="var(--line)" vertical={false} />
                        <XAxis dataKey="date" ticks={series.length > 1 ? [series[0].date, series[series.length - 1].date] : undefined} interval={0} tick={{ fontSize: 11, fill: 'var(--ink-soft)' }} axisLine={false} tickLine={false} tickFormatter={(v: string) => formatDate(v, locale)} />
                        <YAxis orientation="right" width={52} tick={{ fontSize: 11, fill: 'var(--ink-soft)' }} axisLine={false} tickLine={false} domain={['auto', 'auto']} tickFormatter={(v) => formatCompactCurrency(Number(v))} />
                        <Tooltip content={<BalTip locale={locale} />} cursor={{ stroke: 'var(--ink-faint)' }} />
                        <Area type="linear" dataKey="v" stroke={tone} strokeWidth={2} fill={`url(#${gradId})`} isAnimationActive={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}

                <div>
                  <p className="pb-accounts-detail-cap">{x.inOutTitle}</p>
                  {anyMonth ? (
                    <div className="pb-chart-fade pb-chart-fill pb-accounts-detail-bars" role="img" aria-label={t(x.inOutChart, { name: account.name })}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={months} stackOffset="sign" margin={{ top: 4, right: 4, left: 4, bottom: 0 }} barCategoryGap="28%">
                          <CartesianGrid stroke="var(--line)" vertical={false} />
                          <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--ink-soft)' }} axisLine={false} tickLine={false} />
                          <YAxis orientation="right" width={52} tick={{ fontSize: 11, fill: 'var(--ink-soft)' }} axisLine={false} tickLine={false} tickFormatter={(v) => formatCompactCurrency(Number(v))} />
                          <ReferenceLine y={0} stroke="var(--ink-faint)" />
                          <Tooltip content={<MonthTip labels={{ moneyIn: x.moneyIn, transfersIn: x.transfersIn, moneyOut: x.moneyOut, transfersOut: x.transfersOut, correction: x.correction, nothing: x.nothingRecorded }} />} cursor={{ fill: 'color-mix(in srgb, var(--ink) 5%, transparent)' }} />
                          <Bar dataKey="in" stackId="m" fill="var(--pine)" maxBarSize={22} isAnimationActive={false} />
                          <Bar dataKey="gin" stackId="m" fill="color-mix(in srgb, var(--ink-soft) 45%, transparent)" maxBarSize={22} isAnimationActive={false} radius={[4, 4, 0, 0]} />
                          <Bar dataKey="out" stackId="m" fill="var(--wine)" maxBarSize={22} isAnimationActive={false} />
                          <Bar dataKey="gout" stackId="m" fill="color-mix(in srgb, var(--ink-soft) 45%, transparent)" maxBarSize={22} isAnimationActive={false} radius={[0, 0, 4, 4]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p className="pb-accounts-detail-quiet">{x.noRecordsHere}</p>
                  )}
                  <div className="pb-accounts-detail-legend" aria-hidden="true">
                    <span><i style={{ background: 'var(--pine)' }} />{x.moneyIn}</span>
                    <span><i style={{ background: 'var(--wine)' }} />{x.moneyOut}</span>
                    <span><i style={{ background: 'color-mix(in srgb, var(--ink-soft) 45%, transparent)' }} />{x.moves}</span>
                  </div>
                </div>
              </div>

              <div className="pb-accounts-detail-side">
                <p className="pb-accounts-detail-cap">{rangeLabel}</p>
                <dl className="pb-accounts-detail-stats">
                  <div><dt><ArrowDownLeft size={13} aria-hidden="true" className="is-in" />{x.moneyIn}</dt><dd className="font-mono-tab"><RollingAmount value={formatCurrency(moneyIn)} /></dd></div>
                  <div><dt><ArrowUpRight size={13} aria-hidden="true" className="is-out" />{x.moneyOut}</dt><dd className="font-mono-tab"><RollingAmount value={formatCurrency(moneyOut)} /></dd></div>
                  <div>
                    <dt>{x.largestExpense}</dt>
                    <dd className="font-mono-tab"><RollingAmount value={largest ? formatCurrency(Math.abs(largest.amount)) : '—'} /></dd>
                    {largest && <dd className="pb-accounts-detail-stat-note">{titleOf(largest)}</dd>}
                  </div>
                  <div><dt>{x.records}</dt><dd className="pb-tnum">{inRange.length}</dd></div>
                  {anyMoves && (
                    <div className="is-wide">
                      <dt><ArrowRightLeft size={13} aria-hidden="true" />{x.movesNet}</dt>
                      <dd className="font-mono-tab">{movesNet > 0 ? '+' : movesNet < 0 ? '−' : ''}<RollingAmount value={formatCurrency(Math.abs(movesNet))} /></dd>
                    </div>
                  )}
                </dl>

                <p className="pb-accounts-detail-cap">{x.recentActivity}</p>
                {records.length === 0 ? (
                  <EmptyState compact icon={Icon} title={x.noRecordsHere} />
                ) : (
                  <>
                    <ul className="pb-accounts-detail-list">
                      {records.slice(0, shownCount).map((r) => {
                        const RowIcon = r.kind === 'transfer' ? ArrowRightLeft : r.kind === 'correction' ? SlidersHorizontal : r.amount > 0 ? ArrowDownLeft : ArrowUpRight;
                        return (
                          <li key={r.id}>
                            <span className={`pb-accounts-detail-ico${r.amount > 0 ? ' is-in' : ' is-out'}${r.kind === 'transfer' || r.kind === 'correction' ? ' is-move' : ''}`} aria-hidden="true"><RowIcon size={14} /></span>
                            <span className="pb-accounts-detail-text">
                              {/* Titles are USER DATA. */}
                              <span className="pb-accounts-detail-title">{titleOf(r)}</span>
                              <span className="pb-accounts-detail-meta">{formatDate(r.date, locale)}{subOf(r) && ` · ${subOf(r)}`}</span>
                            </span>
                            <span className={`font-mono-tab pb-accounts-detail-amt${r.amount > 0 ? ' is-in' : ''}`}>
                              {r.amount > 0 ? '+' : '−'}<RollingAmount value={formatCurrency(Math.abs(r.amount))} />
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                    {records.length > shownCount && (
                      <button type="button" className="pill pb-accounts-detail-more" onClick={() => setShownCount((c) => c + PAGE)}>{x.showMore}</button>
                    )}
                  </>
                )}
                {lastActivity && <p className="pb-accounts-detail-quiet">{t(d.accountsPage.lastActivity, { date: formatDate(lastActivity, locale) })}</p>}
              </div>
            </div>
          </div>

          <div className="pb-modal-foot pb-accounts-detail-foot">
            <Link href="/settings#settings-money" prefetch={false} className="pb-accounts-manage" onClick={close}>
              {x.manageInSettings}<ChevronRight size={14} aria-hidden="true" />
            </Link>
            <div className="pb-accounts-detail-actions">
              {credit && onPayOff && (
                <button type="button" className="btn-primary" onClick={() => onPayOff(account)} disabled={!f?.owes}>{d.accounts.payOffAction}</button>
              )}
              {canTransfer && (
                <button type="button" className="btn-primary" onClick={() => onTransfer!(account)}>
                  <ArrowRightLeft size={15} aria-hidden="true" />{x.transferFromHere}
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </ModalFrame>
  );
}
