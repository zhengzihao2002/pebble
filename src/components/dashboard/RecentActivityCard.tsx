'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { usePebbleStore, useTransactions } from '@/store/usePebbleStore';
import { TransactionRow } from '@/components/shared/TransactionRow';

export function RecentActivityCard() {
  const categoryMeta = usePebbleStore((s) => s.categoryMeta);
  const transactions = useTransactions();

  return (
    <div className="card" style={{ padding: '1.5rem 0', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', padding: '0 1.5rem' }}>
        <h3 style={{ fontWeight: 600, fontSize: '0.95rem' }}>Recent activity</h3>
        <Link href="/transactions" className="link-btn">See all <ChevronRight size={14} /></Link>
      </div>
      <div>{transactions.slice(0, 5).map((t) => <TransactionRow key={t.id} txn={t} compact categoryMeta={categoryMeta} />)}</div>
    </div>
  );
}
