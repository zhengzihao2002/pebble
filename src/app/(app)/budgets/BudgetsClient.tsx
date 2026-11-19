'use client';
import { usePartnerView } from '@/components/partner/PartnerViewContext';

import { LockKeyhole } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { formatCurrency } from '@/lib/format';
import { RollingAmount } from '@/components/shared/RollingAmount';
import { PartnerCensored, PartnerCensoredCard } from '@/components/partner/PartnerCensored';
import { useMemo } from 'react';
import type { Transaction } from '@/types';
import type { CategoryItem } from '@/lib/data/mappers';
import { computeCategorySpent } from '@/lib/stats';
import { buildCategoryMeta } from '@/lib/data/categoryMeta';
import { BudgetPlanCard } from '@/components/budgets/BudgetPlanCard';
import { BudgetRows } from '@/components/budgets/BudgetRows';
import { UnbudgetedList } from '@/components/budgets/UnbudgetedList';
import { useBudgetIncome } from '@/components/budgets/useBudgetIncome';
import { IncomeControl } from '@/components/budgets/IncomeControl';
import type { BudgetEntry } from '@/components/budgets/types';
import { budgetHistoryThroughToday } from '@/lib/budgets/spendingProjection';
import type { BudgetHistory } from '@/components/budgets/BudgetDetails';

interface BudgetsClientProps {
  transactions: Transaction[];
  categories: CategoryItem[];
  budgets: Record<string, number>;
  budgetsByYear: Record<string, Record<string, number> | null>;
  today: string;
}

export function BudgetsClient({ transactions, categories, budgets, budgetsByYear, today }: BudgetsClientProps) {
  const partner = usePartnerView();
  const { d } = useTranslation();
  const censored = partner?.data.censoredBudget;
  const categoryMeta = useMemo(() => buildCategoryMeta(categories, budgets), [categories, budgets]);

  // Server-resolved in the saved planning timezone; the year boundary refresh
  // remounts this screen so it cannot retain last year's totals or editors.
  const year = Number(today.slice(0, 4));
  const entries: BudgetEntry[] = useMemo(() => {
    const categorySpent = computeCategorySpent(transactions, year);

    const shown: BudgetEntry[] = Object.entries(categoryMeta)
      .map(([name, meta]) => {
        const spent = categorySpent[name] || 0;
        const pct = meta.budget > 0 ? (spent / meta.budget) * 100 : (spent > 0 ? 100 : 0);
        return { name, icon: meta.icon, color: meta.color, budget: meta.budget, spent, pct };
      })
      .filter((e) => e.budget > 0 || e.spent > 0);
    if (censored) {
      const anonymous = { name: d.partner.censoredCategories, icon: LockKeyhole, color: '#788394', censored: true };
      if (censored.amount > 0) shown.push({
        ...anonymous, budget: censored.amount, spent: censored.budgetedSpending, pct: 100 * censored.budgetedSpending / censored.amount,
      });
      if (censored.unbudgetedSpending > 0) shown.push({
        ...anonymous, budget: 0, spent: censored.unbudgetedSpending, pct: 100,
      });
    }
    return shown;
  }, [transactions, categoryMeta, year, censored, d.partner.censoredCategories]);

  // Categories with no budget and no spending this year, for Other categories.
  const others: BudgetEntry[] = useMemo(() => {
    const shown = new Set(entries.map((e) => e.name));
    return Object.entries(categoryMeta)
      .filter(([name]) => !shown.has(name))
      .map(([name, meta]) => ({ name, icon: meta.icon, color: meta.color, budget: 0, spent: 0, pct: 0 }));
  }, [categoryMeta, entries]);

  // Every month from January three years ago through the current month, per
  // category, oldest first, from the transactions already on the page. The
  // details chart picks a year from it; Quick set uses its last 12 complete
  // months. Null until today is known.
  const history: BudgetHistory | null = useMemo(() => {
    if (!today) return null;
    return { ...budgetHistoryThroughToday(transactions, today), budgetsByYear };
  }, [transactions, today, budgetsByYear]);

  const totalBudget = entries.reduce((s, e) => s + e.budget, 0);
  const totalSpent = entries.reduce((s, e) => s + e.spent, 0);

  const income = useBudgetIncome(transactions, today);
  const sharedEstimate = partner?.data.canEstimateBudgetIncome ? income.estimate?.annual ?? null : null;
  const incomeControl = partner ? (
    <div className="pb-bud-income">
      <div className="pb-bud-income-fig">
        <span className="pb-bud-income-label">{d.budgetModal.estimatedIncome}</span>
        {partner.data.canEstimateBudgetIncome ? <>
          <span className="font-mono-tab pb-bud-income-value"><RollingAmount value={sharedEstimate === null ? '—' : formatCurrency(sharedEstimate)} /></span>
          <span className="pb-bud-income-needs">{sharedEstimate === null ? d.ux.budgets.incomeNeeds : d.partner.budgetIncomeBasis}</span>
        </> : <PartnerCensored />}
      </div>
    </div>
  ) : <IncomeControl {...income.control} />;

  // One column on every width, as on a phone: the plan, the budget list, then
  // spending without a budget. It used to become a side column on a wide
  // screen, but that card is far shorter than the list, so the right half
  // stayed blank for most of the scroll (owner report). Wide screens use their
  // width inside the cards instead (see budgets.css). All three cards always
  // render; a card with nothing to show says what it needs.
  return (
    <div className="pb-bud">
      <BudgetPlanCard
        entries={entries}
        totalBudget={totalBudget}
        totalSpent={totalSpent}
        annualIncome={partner ? sharedEstimate : income.control.effectiveAnnual}
        today={today}
        incomeControl={incomeControl}
      />
      <BudgetRows entries={entries} today={today} history={history} />
      {partner && (!partner.data.permissions.amounts || !partner.data.permissions.expenses || !partner.data.permissions.budgets)
        ? <PartnerCensoredCard title={d.budgetPlan.unbudgetedTitle} className="pb-unb pb-bud-unb" />
        : <UnbudgetedList entries={entries} others={others} history={history} today={today} />}
    </div>
  );
}
