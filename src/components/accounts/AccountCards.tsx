'use client';

import { Coins, CreditCard, Landmark } from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { Account } from '@/lib/data/mappers';
import { formatCurrency, formatDate } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { nextDue } from '@/components/accounts/PayOffDialog';

export interface DayPointLite {
  date: string;
  byAccount: Record<string, number>;
}

type TipItem = { payload?: { date?: string; v?: number } };

/**
 * One card per active or hibernated account: balance, change over the page's
 * period, a mini chart from the same daily walk as the main chart, share of
 * the total, and last activity. Account names are USER DATA.
 */
export function AccountCards({ accounts, days, total, lastActivity, period, onPayOff }: {
  accounts: Account[];
  days: DayPointLite[];
  /** Total balance on the last day. */
  total: number;
  /** accountId -> latest record date up to today. */
  lastActivity: Map<string, string>;
  period: string;
  /** Credit cards only: opens the Pay off dialog. */
  onPayOff?: (a: Account) => void;
}) {
  const { d, t, locale } = useTranslation();
  if (days.length === 0) return null;

  const first = days[0];
  const last = days[days.length - 1];
  const shown = accounts
    .filter((a) => a.status === 'active' || a.status === 'hibernated')
    .map((a) => ({ a, now: Math.round((last.byAccount[a.id] ?? 0) * 100) / 100, then: Math.round((first.byAccount[a.id] ?? 0) * 100) / 100 }))
    // Credit cards after bank and cash; within each, larger balances first.
    .sort((x, y) => (x.a.kind === 'credit' ? 1 : 0) - (y.a.kind === 'credit' ? 1 : 0) || y.now - x.now);
  if (shown.length === 0) return null;

  const SparkTip = ({ active, payload }: { active?: boolean; payload?: ReadonlyArray<TipItem> }) => {
    const p = payload?.[0]?.payload;
    if (!active || !p?.date) return null;
    return (
      <div style={{ backgroundColor: 'var(--mist)', border: '1px solid var(--line)', borderRadius: '0.5rem', padding: '0.3rem 0.5rem', fontSize: '0.74rem', boxShadow: 'var(--shadow)', whiteSpace: 'nowrap' }}>
        <span style={{ color: 'var(--ink-soft)' }}>{formatDate(p.date, locale)}</span>
        {' · '}
        <span className="font-mono-tab" style={{ fontWeight: 600 }}>{formatCurrency(p.v ?? 0)}</span>
      </div>
    );
  };

  return (
    <section aria-labelledby="pb-your-accounts">
      <h3 id="pb-your-accounts" style={{ fontWeight: 600, fontSize: '0.95rem', margin: '0 0 0.75rem' }}>{d.accountsPage.yourAccounts}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
        {shown.map(({ a, now, then }) => {
          const Icon = a.kind === 'bank' ? Landmark : Coins;
          const hibernated = a.status === 'hibernated';
          const change = Math.round((now - then) * 100) / 100;
          const tone = change > 0 ? 'var(--pine)' : change < 0 ? 'var(--wine)' : 'var(--ink-soft)';
          const pct = then !== 0 ? ` (${change >= 0 ? '+' : '−'}${Math.abs((change / Math.abs(then)) * 100).toFixed(1)}%)` : '';
          const changeText = change === 0 ? d.accountsPage.noChange : `${change > 0 ? '+' : '−'}${formatCurrency(Math.abs(change))}${pct}`;
          const share = total > 0 && now > 0 ? Math.round((now / total) * 100) : null;
          const seen = lastActivity.get(a.id);
          const data = days.map((p) => ({ date: p.date, v: Math.round((p.byAccount[a.id] ?? 0) * 100) / 100 }));
          const gradId = `spark-${a.id.replace(/[^a-zA-Z0-9_-]/g, '')}`;

          // Credit cards: what is owed (positive), the limit and the due date.
          // No graph: paying off moves charges to a bank account with their
          // dates, so a card's history only ever shows what is still unpaid.
          if (a.kind === 'credit') {
            const owed = Math.max(0, -now);
            const owes = owed > 0.004;
            const limit = a.creditLimit ?? 0;
            const over = limit > 0 && owed > limit + 0.004;
            const usedPct = limit > 0 ? Math.min(100, (owed / limit) * 100) : 0;
            const dueYmd = a.dueDay ? nextDue(a.dueDay) : null;
            const today0 = new Date();
            const daysLeft = dueYmd
              ? Math.round((Date.UTC(+dueYmd.slice(0, 4), +dueYmd.slice(5, 7) - 1, +dueYmd.slice(8, 10))
                - Date.UTC(today0.getFullYear(), today0.getMonth(), today0.getDate())) / 86_400_000)
              : null;
            const dueSoon = owes && daysLeft !== null && daysLeft <= 3;
            return (
              <div key={a.id} className="card" style={{ padding: '1.1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.6rem', opacity: hibernated ? 0.72 : 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', minWidth: 0 }}>
                  <span aria-hidden="true" style={{ width: 30, height: 30, borderRadius: '0.55rem', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'color-mix(in srgb, var(--ink) 8%, transparent)', color: 'var(--ink-soft)' }}>
                    <CreditCard size={15} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.name}
                    {a.last4 && <span className="font-mono-tab" style={{ fontWeight: 400, color: 'var(--ink-soft)' }}> ····{a.last4}</span>}
                  </span>
                  {hibernated && (
                    <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--gold)', border: '1px solid var(--line)', borderRadius: 99, padding: '0.1rem 0.5rem', flexShrink: 0 }}>
                      {d.accounts.hibernated}
                    </span>
                  )}
                </div>

                <div>
                  <p className="font-display pb-money" style={{ margin: 0, fontSize: '1.45rem', fontWeight: 600 }}>{formatCurrency(owed)}</p>
                  <p style={{ margin: '0.1rem 0 0', fontSize: '0.8rem', color: 'var(--ink-soft)' }}>{owes ? d.accountsPage.cardOwed : d.accountsPage.cardNothingOwed}</p>
                </div>

                {limit > 0 && (
                  <div>
                    <div aria-hidden="true" style={{ height: 6, borderRadius: 99, backgroundColor: 'var(--line)', overflow: 'hidden' }}>
                      <div style={{ width: `${usedPct}%`, height: '100%', borderRadius: 99, backgroundColor: over ? 'var(--wine)' : 'var(--ink-soft)' }} />
                    </div>
                    <p className="font-mono-tab pb-money" style={{ margin: '0.35rem 0 0', fontSize: '0.75rem', color: over ? 'var(--wine)' : 'var(--ink-soft)', fontWeight: over ? 600 : 400 }}>
                      {over
                        ? t(d.accountsPage.cardOverLimit, { amount: formatCurrency(owed - limit) })
                        : t(d.accountsPage.cardLimitLine, { used: formatCurrency(owed), limit: formatCurrency(limit), available: formatCurrency(limit - owed) })}
                    </p>
                  </div>
                )}

                {dueYmd && (
                  <p style={{ margin: 0, fontSize: '0.78rem', color: dueSoon ? 'var(--gold)' : 'var(--ink-soft)', fontWeight: dueSoon ? 600 : 400 }}>
                    {t(d.accountsPage.cardDue, { date: formatDate(dueYmd, locale) })}
                  </p>
                )}

                {onPayOff && (
                  <button
                    type="button" className="btn-primary" onClick={() => onPayOff(a)} disabled={!owes}
                    style={{ width: '100%', justifyContent: 'center', padding: '0.6rem', marginTop: '0.15rem', opacity: owes ? 1 : 0.5 }}
                  >
                    {d.accounts.payOffAction}
                  </button>
                )}
              </div>
            );
          }
          return (
            <div key={a.id} className="card" style={{ padding: '1.1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', opacity: hibernated ? 0.72 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', minWidth: 0 }}>
                <span aria-hidden="true" style={{ width: 30, height: 30, borderRadius: '0.55rem', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--pine-soft)', color: 'var(--pine)' }}>
                  <Icon size={15} />
                </span>
                <span style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {a.name}
                  {a.last4 && <span className="font-mono-tab" style={{ fontWeight: 400, color: 'var(--ink-soft)' }}> ····{a.last4}</span>}
                </span>
                {hibernated && (
                  <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--gold)', border: '1px solid var(--line)', borderRadius: 99, padding: '0.1rem 0.5rem', flexShrink: 0 }}>
                    {d.accounts.hibernated}
                  </span>
                )}
              </div>

              <div>
                <p className="font-display pb-money" style={{ margin: 0, fontSize: '1.45rem', fontWeight: 600 }}>{formatCurrency(now)}</p>
                <p className="font-mono-tab" style={{ margin: '0.1rem 0 0', fontSize: '0.8rem', fontWeight: 600, color: tone }}>{changeText}</p>
              </div>

              <div className="pb-chart-fade" style={{ height: 56 }} role="img" aria-label={t(d.accountsPage.sparkLabel, { name: a.name, period })}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={tone} stopOpacity={0.28} />
                        <stop offset="95%" stopColor={tone} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Tooltip content={<SparkTip />} cursor={{ stroke: 'var(--line)' }} allowEscapeViewBox={{ x: true, y: true }} />
                    <Area type="linear" dataKey="v" stroke={tone} strokeWidth={1.75} fill={`url(#${gradId})`} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--ink-soft)', display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span>{seen ? t(d.accountsPage.lastActivity, { date: formatDate(seen, locale) }) : d.accountsPage.noActivity}</span>
                {share !== null && <span className="font-mono-tab">{t(d.accountsPage.shareOfTotal, { pct: `${share}%` })}</span>}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
