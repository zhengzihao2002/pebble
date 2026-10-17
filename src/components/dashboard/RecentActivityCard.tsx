'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Plus, ReceiptText } from 'lucide-react';
import type { CategoryMeta, Transaction } from '@/types';
import { TransactionRow } from '@/components/shared/TransactionRow';
import { TransactionDetailModal } from '@/components/modals/TransactionDetailModal';
import { requestShell } from '@/components/layout/shellEvents';
import { formatCurrency } from '@/lib/format';
import { ymdOf } from '@/lib/periodCompare';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { SectionHeader } from '@/components/kit/SectionHeader';
import { EmptyState } from '@/components/kit/EmptyState';
import { RowsSkeleton } from './DashSkeletons';
import { addDaysYmd, dayHeading, groupByDay } from './dayGroups';

interface RecentActivityCardProps {
  transactions: Transaction[];
  categoryMeta: CategoryMeta;
  /** Zone-aware today from DashboardClient; null until resolved. */
  today?: Date | null;
}

const FIRST = 5;
const MORE = 10;

/**
 * The newest transactions, grouped under day headers with each day's net.
 *
 * Rows now open the same TransactionDetailModal Insights and the palette use
 * (a bottom sheet on phones, via ModalFrame), so a recent entry can be checked
 * or fixed without a trip to Transactions - a strict addition: the rows show
 * what they always showed. "Show more" opens five more in place.
 *
 * Records dated after today are left out: they have not happened yet, and at
 * the top of a "recent" list they pushed real activity down. They are still
 * on the Transactions page.
 */
export function RecentActivityCard({ transactions, categoryMeta, today = null }: RecentActivityCardProps) {
  const { d, locale } = useTranslation();
  const ux = d.ux.dashboard;
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [expanded, setExpanded] = useState(false);

  const header = (
    <SectionHeader
      title={d.recentActivity.title}
      actions={<Link href="/transactions" prefetch={false} className="link-btn">{d.common.seeAll} <ChevronRight size={14} /></Link>}
    />
  );

  if (!today) {
    return <section className="card pb-dash-card pb-dash-recent">{header}<RowsSkeleton rows={4} minHeight={200} /></section>;
  }

  const todayYmd = ymdOf(today);
  const yesterday = addDaysYmd(todayYmd, -1);
  // The list arrives newest first (mergeTransactions).
  const past = transactions.filter((x) => x.date <= todayYmd);
  const first = past.slice(0, FIRST);
  const rest = past.slice(FIRST, MORE);

  const heading = (ymd: string) =>
    dayHeading(ymd, locale, todayYmd, ymd === todayYmd ? d.upcomingCard.today : ymd === yesterday ? ux.yesterday : undefined);

  const groups = (list: Transaction[], continues?: string) => groupByDay(list, (x) => x.date).map((g) => {
    const net = g.items.reduce((s, x) => s + x.amount, 0);
    return (
      <div key={g.date} className="pb-dash-day">
        {g.date !== continues && (
          <div className="pb-dash-day-head">
            <span>{heading(g.date)}</span>
            <span className="font-mono-tab" style={{ color: net > 0 ? 'var(--pine)' : undefined }}>{net > 0 ? '+' : ''}{formatCurrency(net)}</span>
          </div>
        )}
        <div className="pb-dash-rows">
          {g.items.map((x) => (
            <TransactionRow key={x.id} txn={x} compact hideDate flush focusable categoryMeta={categoryMeta} onOpenDetail={setSelected} />
          ))}
        </div>
      </div>
    );
  });

  return (
    <section className="card pb-dash-card pb-dash-recent">
      {header}
      {past.length === 0 ? (
        <EmptyState
          compact icon={ReceiptText} title={ux.noTxnTitle} body={ux.noTxnBody}
          action={(
            <button type="button" className="btn-primary pb-dash-cta" onClick={() => requestShell('addTransaction')}>
              <Plus size={15} aria-hidden="true" />{d.header.addTransaction}
            </button>
          )}
        />
      ) : (
        <>
          {groups(first)}
          {rest.length > 0 && (
            <>
              <div className={`collapsible-rows${expanded ? ' expanded' : ''}`}>
                <div className="collapsible-rows-inner" inert={!expanded}>
                  {groups(rest, first[first.length - 1]?.date)}
                </div>
              </div>
              <button type="button" className="link-btn pb-dash-more" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
                {expanded ? ux.showLess : ux.showMoreRecent}
              </button>
            </>
          )}
        </>
      )}
      {selected && (
        <TransactionDetailModal txn={selected} categoryMeta={categoryMeta} onClose={() => setSelected(null)} />
      )}
    </section>
  );
}
