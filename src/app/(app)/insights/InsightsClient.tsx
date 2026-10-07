'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Goal, LedgerRecord, RecurringRule, Transaction } from '@/types';
import type { Account, CategoryItem } from '@/lib/data/mappers';
import { buildCategoryMeta } from '@/lib/data/categoryMeta';
import { todayInZone } from '@/lib/recurring/occurrences';
import { resolveBrowserTimeZone } from '@/lib/time/timeZone';
import { useTimeZoneOverride } from '@/lib/time/TimeZoneOverrideContext';
import { TransactionDetailModal } from '@/components/modals/TransactionDetailModal';
import { DayByDay } from '@/components/insights/DayByDay';
import { CategoryTrends } from '@/components/insights/CategoryTrends';
import { TopPlaces } from '@/components/insights/TopPlaces';
import { YourWeek } from '@/components/insights/YourWeek';
import { WorthKnowing, type SchedulePrefill } from '@/components/insights/WorthKnowing';
import { RecurringRuleModal } from '@/components/modals/RecurringRuleModal';

export interface InsightsClientProps {
  transactions: Transaction[];
  categories: CategoryItem[];
  budgets: Record<string, number>;
  /** For the later sections (subscriptions, goal pace, dormant accounts). */
  rules: RecurringRule[];
  goals: Goal[];
  accounts: Account[];
}

export function InsightsClient({ transactions, categories, budgets, rules, goals, accounts }: InsightsClientProps) {
  const categoryMeta = useMemo(() => buildCategoryMeta(categories, budgets), [categories, budgets]);

  // Zone-aware 'YYYY-MM-DD', resolved in the browser like the other pages.
  // Null for the first frame keeps the server and first client render equal.
  const timeZoneOverride = useTimeZoneOverride();
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => {
    setToday(todayInZone(timeZoneOverride ?? resolveBrowserTimeZone()));
  }, [timeZoneOverride]);

  const [selected, setSelected] = useState<LedgerRecord | null>(null);
  const [prefill, setPrefill] = useState<SchedulePrefill | null>(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <section className="dash-two-col">
        <DayByDay transactions={transactions} categoryMeta={categoryMeta} today={today} onOpen={setSelected} />
        <YourWeek transactions={transactions} today={today} />
      </section>
      <section className="dash-two-col">
        <CategoryTrends transactions={transactions} categoryMeta={categoryMeta} today={today} />
        <TopPlaces transactions={transactions} today={today} />
      </section>
      <WorthKnowing
        transactions={transactions} rules={rules} goals={goals} accounts={accounts} today={today}
        onOpen={setSelected} onCreateSchedule={setPrefill}
      />
      {selected && (
        <TransactionDetailModal txn={selected} categoryMeta={categoryMeta} onClose={() => setSelected(null)} />
      )}
      {prefill && <RecurringRuleModal prefill={prefill} onClose={() => setPrefill(null)} />}
    </div>
  );
}
