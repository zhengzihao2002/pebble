'use client';

import { useMemo } from 'react';
import { Ghost, ArrowUpRight, ArrowDownRight, SlidersHorizontal } from 'lucide-react';
import type { Account } from '@/lib/data/mappers';
import type { LedgerRecord } from '@/types';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { categoryLabel } from '@/lib/i18n/enumLabels';
import { formatCurrency, formatDate } from '@/lib/format';
import { PayoffRow, type StatementEntry } from './StatementList';
import type { TypeFilter } from './SearchToolbar';
import { filterGhostActivity } from './ghostActivity';
import { groupByDay, statementPayoffs } from './statementMath';

export function GhostActivity({ entries, accounts, monthPrefix, accountId, query, typeFilter, onOpen }: {
  entries: StatementEntry[];
  accounts: Account[];
  monthPrefix: string;
  accountId: string | null;
  query: string;
  typeFilter: TypeFilter;
  onOpen: (record: LedgerRecord) => void;
}) {
  const { d, locale } = useTranslation();
  const zh = locale === 'zh';
  const names = useMemo(() => new Map(accounts.map(account => [account.id, account.name])), [accounts]);
  const visible = useMemo(() => filterGhostActivity(entries, {
    monthPrefix, accountId, query, type: typeFilter, accountNames: names,
    categoryName: category => categoryLabel(d, category),
  }), [entries, monthPrefix, accountId, query, typeFilter, names, d]);
  const items = useMemo(() => {
    const payoffs = accountId && !query.trim() && typeFilter === 'all'
      ? statementPayoffs(entries, accountId, monthPrefix)
      : [];
    return groupByDay(visible, () => 0, accountId, payoffs).flatMap(({ items }) => items);
  }, [entries, visible, monthPrefix, accountId, query, typeFilter]);
  return <section className="card pb-txn-ghost-history" aria-labelledby="pb-txn-ghost-heading">
    <header className="pb-txn-ghost-head">
      <span className="pb-txn-ghost-mark"><Ghost size={22} aria-hidden="true" /></span>
      <div><h3 id="pb-txn-ghost-heading">{zh ? '幽灵流水' : 'Ghost activity'}</h3>
        <p>{zh ? '独立记录，不计入应用总额、预算、图表或洞察。' : 'A separate record, excluded from app totals, budgets, charts and insights.'}</p></div>
      <span className="pb-txn-ghost-count pb-tnum">{items.length}</span>
    </header>
    {items.length === 0 ? <p className="pb-txn-ghost-empty" data-pb-period-body>{zh ? '当前月份及筛选条件下没有幽灵流水。' : 'No ghost activity matches this month and these filters.'}</p> :
      <div className="pb-txn-ghost-rows" data-pb-period-body>{items.map(item => {
        if (item.kind === 'payoff') return <PayoffRow key={`payoff-${item.id}`} payoff={item.payoff} accounts={accounts} showDate />;
        const { record } = item.entry;
        const Icon = record.type === 'adjustment' ? SlidersHorizontal : record.amount >= 0 ? ArrowUpRight : ArrowDownRight;
        const payoff = record.type === 'expense' ? record.creditCardPayoff : undefined;
        const accountName = payoff
          ? names.get(payoff.cardId) ?? payoff.cardName
          : names.get(record.accountId) ?? record.paymentMethod;
        return <button key={record.id} type="button" className="pb-txn-ghost-row" onClick={() => onOpen(record)}>
          <Icon size={17} aria-hidden="true" />
          <span className="pb-txn-ghost-copy"><strong>{record.description.split('\n')[0]}</strong>
            <span>{accountName} · {formatDate(record.date, locale)} · {record.type === 'adjustment' ? d.txn.balanceAdjustment : categoryLabel(d, record.category)}</span>
          </span>
          <span className="font-mono-tab pb-txn-ghost-amount" style={{ color: record.type === 'adjustment' ? 'var(--ink-soft)' : record.amount >= 0 ? 'var(--income)' : 'var(--expense)' }}>{record.amount > 0 ? '+' : ''}{formatCurrency(record.amount)}</span>
        </button>;
      })}</div>}
  </section>;
}
