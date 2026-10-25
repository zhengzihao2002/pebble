'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { Goal, LedgerRecord, RecurringRule, Transaction } from '@/types';
import type { Account, CategoryItem } from '@/lib/data/mappers';
import { buildCategoryMeta } from '@/lib/data/categoryMeta';
import { todayInZone } from '@/lib/recurring/occurrences';
import { resolveBrowserTimeZone } from '@/lib/time/timeZone';
import { useTimeZoneOverride } from '@/lib/time/TimeZoneOverrideContext';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { usePebbleStore } from '@/store/usePebbleStore';
import { TransactionDetailModal } from '@/components/modals/TransactionDetailModal';
import { RecurringRuleModal } from '@/components/modals/RecurringRuleModal';
import { PayOffDialog } from '@/components/accounts/PayOffDialog';
import { DayByDay } from '@/components/insights/DayByDay';
import { CategoryTrends } from '@/components/insights/CategoryTrends';
import { TopPlaces } from '@/components/insights/TopPlaces';
import { YourWeek } from '@/components/insights/YourWeek';
import { SavingsHeadline } from '@/components/insights/SavingsHeadline';
import { MonthPace } from '@/components/insights/MonthPace';
import { GoodNews } from '@/components/insights/GoodNews';
import { JumpBar, type JumpItem } from '@/components/insights/JumpBar';
import { WorthKnowing, type SchedulePrefill } from '@/components/insights/WorthKnowing';
import { buildInsights } from '@/components/insights/insightRules';
import { useDismissQueue } from '@/components/insights/hooks';
import { SECTION_IDS } from '@/components/insights/shared';

export interface InsightsClientProps {
  transactions: Transaction[];
  categories: CategoryItem[];
  budgets: Record<string, number>;
  /** For the later sections (subscriptions, goal pace, dormant accounts) and Month pace's scheduled payments. */
  rules: RecurringRule[];
  goals: Goal[];
  accounts: Account[];
}

/** Stagger index for the cards' rise-in. */
const rise = (i: number) => ({ ['--pb-i' as string]: i }) as CSSProperties;

/**
 * The Insights page, attention first. One grid whose DOM order is the phone
 * order - savings hero, what needs attention, month pace, calendar, week,
 * category movers, top places, good news - placed by content width
 * (insights.css): pairs from 560px, and from 1100px a 12-column grid of
 * balanced pairs under the full-width hero and attention cards. Nothing is
 * sticky but the jump chips under the header.
 *
 * Every section always renders: with too little data a card says what it
 * needs (a new account sees the same page as a loaded one). Only the
 * individual notes inside Worth knowing / Good news come and go.
 *
 * The notes (Worth knowing) are computed once here and shown in two places
 * by group; their PayOff dialog moved up here with them.
 */
export function InsightsClient({ transactions, categories, budgets, rules, goals, accounts }: InsightsClientProps) {
  const { d, t, locale } = useTranslation();
  const ux = d.ux.insights;
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
  // The card being paid off from a reminder.
  const [payOff, setPayOff] = useState<Account | null>(null);

  const dismissed = usePebbleStore((s) => s.insightsDismissed);
  const dismiss = usePebbleStore((s) => s.dismissInsight);
  const notes = useDismissQueue(dismiss);

  const items = useMemo(() => (today === null ? null : buildInsights({
    transactions, rules, goals, accounts, today, d, t, locale,
    onOpen: setSelected, onCreateSchedule: setPrefill, onPayOff: setPayOff,
  })), [today, transactions, rules, goals, accounts, d, t, locale]);
  const shown = items === null ? null : items.filter((i) => !(dismissed ?? []).includes(i.id));
  const attention = shown === null ? null : shown.filter((i) => i.group !== 'good');
  const good = shown === null ? [] : shown.filter((i) => i.group === 'good');
  const attentionCount = attention === null ? 0 : attention.filter((i) => !notes.pending.includes(i.id)).length;

  const jumps: JumpItem[] = [
    { id: SECTION_IDS.attention, label: ux.sectionAttention, count: attentionCount },
    { id: SECTION_IDS.pace, label: ux.sectionPace },
    { id: SECTION_IDS.calendar, label: ux.sectionCalendar },
    { id: SECTION_IDS.week, label: ux.sectionWeek },
    { id: SECTION_IDS.trends, label: ux.sectionTrends },
    { id: SECTION_IDS.places, label: ux.sectionPlaces },
    { id: SECTION_IDS.good, label: ux.sectionGood },
  ];

  return (
    <div className="pb-ins">
      <JumpBar items={jumps} />
      <div className="pb-ins-grid">
        <div className="pb-ins-area pb-ins-area-hero pb-rise" style={rise(0)}>
          <SavingsHeadline transactions={transactions} today={today} />
        </div>
        <div id={SECTION_IDS.attention} className="pb-ins-area pb-ins-area-rail pb-rise" style={rise(1)}>
          <WorthKnowing items={attention} pending={notes.pending} onHide={notes.hide} onUndo={notes.undo} />
        </div>
        <div id={SECTION_IDS.pace} className="pb-ins-area pb-ins-area-pace pb-rise" style={rise(2)}>
          <MonthPace transactions={transactions} rules={rules} categoryMeta={categoryMeta} today={today} />
        </div>
        <div id={SECTION_IDS.calendar} className="pb-ins-area pb-ins-area-cal pb-rise" style={rise(3)}>
          <DayByDay transactions={transactions} categoryMeta={categoryMeta} today={today} onOpen={setSelected} />
        </div>
        <div id={SECTION_IDS.week} className="pb-ins-area pb-ins-area-week pb-rise" style={rise(4)}>
          <YourWeek transactions={transactions} today={today} />
        </div>
        <div id={SECTION_IDS.trends} className="pb-ins-area pb-ins-area-trends pb-rise" style={rise(5)}>
          <CategoryTrends transactions={transactions} categoryMeta={categoryMeta} today={today} />
        </div>
        <div id={SECTION_IDS.places} className="pb-ins-area pb-ins-area-places pb-rise" style={rise(6)}>
          <TopPlaces transactions={transactions} today={today} categoryMeta={categoryMeta} onOpen={setSelected} />
        </div>
        <div id={SECTION_IDS.good} className="pb-ins-area pb-ins-area-good pb-rise" style={rise(7)}>
          <GoodNews items={good} pending={notes.pending} onHide={notes.hide} onUndo={notes.undo} />
        </div>
      </div>
      {selected && (
        <TransactionDetailModal txn={selected} categoryMeta={categoryMeta} accounts={accounts} onClose={() => setSelected(null)} />
      )}
      {prefill && <RecurringRuleModal prefill={prefill} onClose={() => setPrefill(null)} />}
      {payOff && (
        <PayOffDialog
          card={payOff} allAccounts={accounts}
          charges={transactions.filter((x): x is Extract<Transaction, { type: 'expense' }> => x.type === 'expense' && x.accountId === payOff.id)}
          onClose={() => setPayOff(null)}
        />
      )}
    </div>
  );
}
