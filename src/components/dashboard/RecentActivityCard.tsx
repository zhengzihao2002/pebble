'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { CategoryMeta, Transaction } from '@/types';
import { TransactionRow } from '@/components/shared/TransactionRow';
import { useTranslation } from '@/lib/i18n/useTranslation';

interface RecentActivityCardProps {
  transactions: Transaction[];
  categoryMeta: CategoryMeta;
}

export function RecentActivityCard({ transactions, categoryMeta }: RecentActivityCardProps) {
  const { d } = useTranslation();
  return (
    <div className="card" style={{ padding: '1.5rem 0', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', padding: '0 1.5rem' }}>
        <h3 style={{ fontWeight: 600, fontSize: '0.95rem' }}>{d.recentActivity.title}</h3>
        <Link href="/transactions" className="link-btn">{d.common.seeAll} <ChevronRight size={14} /></Link>
      </div>
      <div>{transactions.slice(0, 5).map((t) => <TransactionRow key={t.id} txn={t} compact categoryMeta={categoryMeta} />)}</div>
    </div>
  );
}
