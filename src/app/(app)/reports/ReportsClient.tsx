'use client';

import { useEffect, useMemo, useState } from 'react';
import { buildCategoryMeta } from '@/lib/data/categoryMeta';
import { parseLocalDate } from '@/lib/format';
import { MONTH_NAMES, QUARTER_NAMES } from '@/data/seed';
import { ReportFilters } from '@/components/reports/ReportFilters';
import { ReportResults } from '@/components/reports/ReportResults';
import { TransactionDetailModal } from '@/components/modals/TransactionDetailModal';
import type { ExpenseTransaction, Transaction } from '@/types';
import type { ReportType, PeriodGroup, CategoryGroupMode, SortDir, ReportPeriodGroup } from '@/components/reports/types';

function isExpense(t: Transaction): t is ExpenseTransaction {
  return t.type === 'expense';
}

interface ReportsClientProps {
  transactions: Transaction[];
  budgets: Record<string, number>;
}

export function ReportsClient({ transactions, budgets }: ReportsClientProps) {
  const categoryMeta = useMemo(() => buildCategoryMeta(budgets), [budgets]);

  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [reportType, setReportType] = useState<ReportType>('expense');
  const [periodGroup, setPeriodGroup] = useState<PeriodGroup>('month');
  const [subPeriod, setSubPeriod] = useState('All');
  const [categoryGroup, setCategoryGroup] = useState<CategoryGroupMode>('none');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [descQuery, setDescQuery] = useState('');
  const [expandedCategoryGroups, setExpandedCategoryGroups] = useState<Set<string>>(new Set());
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);

  const expenseCats = Object.keys(categoryMeta);
  const incomeCats = ['Standard Income', 'Side Cash'];
  const availableCats = reportType === 'expense' ? expenseCats : incomeCats;

  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set(expenseCats));
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());

  const showTagFilter = reportType === 'expense' && selectedCategories.size === 1;
  const singleSelectedCategory = showTagFilter ? Array.from(selectedCategories)[0] : null;
  const availableTags = showTagFilter
    ? Array.from(new Set(
        transactions
          .filter((t): t is ExpenseTransaction => isExpense(t) && t.category === singleSelectedCategory && !!t.tag)
          .map((t) => t.tag!)
      )).sort()
    : [];

  useEffect(() => {
    setSelectedTags(new Set());
  }, [selectedCategories]);

  const handleTypeChange = (t: ReportType) => {
    setReportType(t);
    setSelectedCategories(new Set(t === 'expense' ? expenseCats : incomeCats));
  };
  const handlePeriodGroupChange = (mode: PeriodGroup) => {
    setPeriodGroup(mode);
    setSubPeriod('All');
  };
  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };
  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag); else next.add(tag);
      return next;
    });
  };
  const toggleCategoryGroupExpanded = (groupKey: string) => {
    setExpandedCategoryGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey); else next.add(groupKey);
      return next;
    });
  };
  const allSelected = selectedCategories.size === availableCats.length;

  const baseFiltered = transactions.filter((t) => {
    const matchesType = reportType === 'expense' ? isExpense(t) : !isExpense(t);
    if (!matchesType) return false;
    if (!selectedCategories.has(t.category)) return false;
    if (!t.description.toLowerCase().includes(descQuery.toLowerCase())) return false;
    if (showTagFilter && selectedTags.size > 0) {
      if (!isExpense(t) || !t.tag || !selectedTags.has(t.tag)) return false;
    }
    return true;
  });

  const yearOptions = Array.from(new Set(baseFiltered.map((t) => parseLocalDate(t.date).getFullYear())))
    .sort((a, b) => b - a)
    .map(String);
  const subPeriodOptions =
    periodGroup === 'month' ? MONTH_NAMES
    : periodGroup === 'quarter' ? QUARTER_NAMES
    : periodGroup === 'year' ? yearOptions
    : null;
  const subPeriodLabel =
    periodGroup === 'month' ? 'Which month'
    : periodGroup === 'quarter' ? 'Which quarter'
    : 'Which year';

  const periodFiltered = (subPeriodOptions && subPeriod !== 'All')
    ? baseFiltered.filter((t) => {
        const d = parseLocalDate(t.date);
        if (periodGroup === 'month') return MONTH_NAMES[d.getMonth()] === subPeriod;
        if (periodGroup === 'quarter') return QUARTER_NAMES[Math.floor(d.getMonth() / 3)] === subPeriod;
        return String(d.getFullYear()) === subPeriod;
      })
    : baseFiltered;

  const showPeriodHeaders = periodGroup !== 'all' && subPeriod === 'All';

  const sortFn = (a: Transaction, b: Transaction) =>
    sortDir === 'desc' ? Math.abs(b.amount) - Math.abs(a.amount) : Math.abs(a.amount) - Math.abs(b.amount);

  const periodBuckets = new Map<string, { sortKey: number; items: Transaction[] }>();
  if (showPeriodHeaders) {
    periodFiltered.forEach((t) => {
      const d = parseLocalDate(t.date);
      let key: string, sortKey: number;
      if (periodGroup === 'month') {
        key = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        sortKey = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      } else {
        const q = Math.floor(d.getMonth() / 3) + 1;
        key = `Q${q} ${d.getFullYear()}`;
        sortKey = new Date(d.getFullYear(), (q - 1) * 3, 1).getTime();
      }
      if (!periodBuckets.has(key)) periodBuckets.set(key, { sortKey, items: [] });
      periodBuckets.get(key)!.items.push(t);
    });
  } else {
    periodBuckets.set('__flat__', { sortKey: 0, items: periodFiltered });
  }

  const periodGroups: ReportPeriodGroup[] = [...periodBuckets.entries()]
    .map(([key, v]) => {
      const total = v.items.reduce((s, t) => s + Math.abs(t.amount), 0);
      if (categoryGroup === 'category') {
        const catBuckets = new Map<string, Transaction[]>();
        v.items.forEach((t) => {
          if (!catBuckets.has(t.category)) catBuckets.set(t.category, []);
          catBuckets.get(t.category)!.push(t);
        });
        const subGroups = [...catBuckets.entries()]
          .map(([cat, items]) => ({ key: cat, total: items.reduce((s, t) => s + Math.abs(t.amount), 0), items: [...items].sort(sortFn) }))
          .sort((a, b) => sortDir === 'desc' ? b.total - a.total : a.total - b.total);
        return { key, sortKey: v.sortKey, total, subGroups };
      }
      return { key, sortKey: v.sortKey, total, items: [...v.items].sort(sortFn) };
    })
    .sort((a, b) => b.sortKey - a.sortKey);

  const grandTotal = periodFiltered.reduce((s, t) => s + Math.abs(t.amount), 0);
  const accent = reportType === 'expense' ? 'var(--wine)' : 'var(--pine)';

  const allGroupKeys = categoryGroup === 'category'
    ? periodGroups.flatMap((pg) => (pg.subGroups ?? []).map((sg) => `${pg.key}::${sg.key}`))
    : [];
  const anyGroupsExpanded = allGroupKeys.some((k) => expandedCategoryGroups.has(k));
  const handleToggleAllGroups = () => {
    setExpandedCategoryGroups(anyGroupsExpanded ? new Set() : new Set(allGroupKeys));
  };

  const periodSummary = periodGroup === 'all' ? 'All time' : subPeriod === 'All' ? `By ${periodGroup}` : subPeriod;
  const filterSummaryParts = [reportType === 'expense' ? 'Expenses' : 'Income', periodSummary];
  if (categoryGroup === 'category') filterSummaryParts.push('grouped by category');
  if (!allSelected) filterSummaryParts.push(`${selectedCategories.size} categor${selectedCategories.size === 1 ? 'y' : 'ies'}`);
  const filterSummary = filterSummaryParts.join(' · ');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <ReportFilters
        expanded={filtersExpanded}
        onToggleExpanded={() => setFiltersExpanded((v) => !v)}
        filterSummary={filterSummary}
        reportType={reportType}
        onTypeChange={handleTypeChange}
        periodGroup={periodGroup}
        onPeriodGroupChange={handlePeriodGroupChange}
        subPeriod={subPeriod}
        onSubPeriodChange={setSubPeriod}
        subPeriodOptions={subPeriodOptions}
        subPeriodLabel={subPeriodLabel}
        categoryGroup={categoryGroup}
        onCategoryGroupChange={setCategoryGroup}
        sortDir={sortDir}
        onSortDirChange={setSortDir}
        descQuery={descQuery}
        onDescQueryChange={setDescQuery}
        availableCats={availableCats}
        selectedCategories={selectedCategories}
        allSelected={allSelected}
        onToggleCategory={toggleCategory}
        onToggleAllCategories={() => setSelectedCategories(allSelected ? new Set() : new Set(availableCats))}
        showTagFilter={showTagFilter}
        singleSelectedCategory={singleSelectedCategory}
        availableTags={availableTags}
        selectedTags={selectedTags}
        onToggleTag={toggleTag}
        onClearTags={() => setSelectedTags(new Set())}
      />

      <ReportResults
        periodGroups={periodGroups}
        periodFilteredCount={periodFiltered.length}
        grandTotal={grandTotal}
        accent={accent}
        categoryGroup={categoryGroup}
        showPeriodHeaders={showPeriodHeaders}
        expandedCategoryGroups={expandedCategoryGroups}
        onToggleCategoryGroup={toggleCategoryGroupExpanded}
        hasGroupKeys={allGroupKeys.length > 0}
        anyGroupsExpanded={anyGroupsExpanded}
        onToggleAllGroups={handleToggleAllGroups}
        categoryMeta={categoryMeta}
        onOpenDetail={setSelectedTransaction}
      />

      {selectedTransaction && (
        <TransactionDetailModal
          txn={selectedTransaction}
          onClose={() => setSelectedTransaction(null)}
          categoryMeta={categoryMeta}
        />
      )}
    </div>
  );
}
