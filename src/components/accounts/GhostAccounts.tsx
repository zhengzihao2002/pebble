'use client';

import { ChevronRight, Coins, CreditCard, Ghost, Landmark } from 'lucide-react';
import type { Account } from '@/lib/data/mappers';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { useOrderedAccounts } from '@/lib/useOrderedAccounts';
import { GhostAccountMode } from './GhostAccountMode';
import { SleepingBadge } from '@/components/shared/SleepingBadge';

export function GhostAccounts({ accounts, balances, onOpen }: { accounts: Account[]; balances: Record<string, number>; onOpen: (account: Account) => void }) {
  const { locale, d } = useTranslation();
  const zh = locale === 'zh';
  const ordered = useOrderedAccounts(accounts, balances);
  if (!ordered.length) return null;
  return <section className="pb-ghost-section" aria-labelledby="pb-ghost-accounts-title">
    <div className="pb-ghost-section-heading"><span className="pb-ghost-heading-icon"><Ghost size={22} aria-hidden="true" /></span><div><h2 id="pb-ghost-accounts-title" className="font-display">{zh ? '幽灵账户' : 'Ghost accounts'} <span className="pb-ghost-count">{ordered.length}</span></h2><p>{zh ? '独立保留，全部不计入。此处余额仅代表各账户本身。' : 'Kept apart. Left out of every total. Each balance here belongs to that account alone.'}</p></div></div>
    <div className="pb-ghost-grid">{ordered.map(account => {
      const Icon = account.kind === 'credit' ? CreditCard : account.kind === 'cash' ? Coins : Landmark;
      const balance = balances[account.id] ?? 0;
      const owed = account.kind === 'credit';
      return <article key={account.id} className="card pb-ghost-account">
        <button type="button" className="pb-ghost-open" onClick={() => onOpen(account)} aria-label={`${account.name} · ${zh ? '查看账户' : 'View account'}`}>
          <div className="pb-ghost-account-top"><span className="pb-ghost-kind"><Icon size={18} aria-hidden="true" /></span><span className="pb-ghost-account-identity"><strong>{account.name}</strong><small>{account.kind === 'bank' ? d.accounts.kindBank : account.kind === 'cash' ? d.accounts.kindCash : d.accounts.kindCredit}{account.last4 && ` ····${account.last4}`}</small></span><Ghost size={25} className="pb-ghost-watermark" aria-hidden="true" /></div>
          <span className="pb-ghost-balance-label">{owed ? (zh ? '欠款' : 'Amount owed') : (zh ? '账户余额' : 'Account balance')}</span>
          <span className="font-display pb-money pb-ghost-balance">{formatCurrency(owed ? Math.abs(balance) : balance)}</span>
          <span className="pb-ghost-account-bottom"><span>{zh ? '不参与计算' : 'Excluded from calculations'}</span><ChevronRight size={16} aria-hidden="true" /></span>
        </button>
        <div className="pb-ghost-account-actions">{account.status === 'hibernated' ? <SleepingBadge /> : <span /> }<GhostAccountMode account={account} /></div>
      </article>;
    })}</div>
  </section>;
}
