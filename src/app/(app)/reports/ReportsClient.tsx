'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePebbleStore } from '@/store/usePebbleStore';
import { buildCategoryMeta } from '@/lib/data/categoryMeta';
import type { CategoryItem, Account } from '@/lib/data/mappers';
import { formatMonthYear, parseLocalDate } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { periodValueLabel } from '@/lib/i18n/enumLabels';
import { MONTH_NAMES, QUARTER_NAMES } from '@/data/seed';
import { compareSameDayIds } from '@/lib/stats';
import { ReportFilters } from '@/components/reports/ReportFilters';
import { ReportResults } from '@/components/reports/ReportResults';
import { TransactionDetailModal } from '@/components/modals/TransactionDetailModal';
import type { ExpenseTransaction, Transaction } from '@/types';
import type { ReportType, PeriodGroup, CategoryGroupMode, SortDir, SortField, ReportPeriodGroup } from '@/components/reports/types';
import { useTimeZoneOverride } from '@/lib/time/TimeZoneOverrideContext';
import { resolveBrowserTimeZone } from '@/lib/time/timeZone';
import { todayInZone } from '@/lib/recurring/occurrences';
import { isRollingWindowKey, resolveRollingWindow, isInRollingWindow, formatRollingRangeLabel } from '@/components/reports/rollingWindow';

function isExpense(t: Transaction): t is ExpenseTransaction {
  return t.type === 'expense';
}

interface ReportsClientProps {
  transactions: Transaction[];
  categories: CategoryItem[];
  budgets: Record<string, number>;
  accounts: Account[];
}

export function ReportsClient({ transactions, categories, budgets, accounts }: ReportsClientProps) {
  // ⚠️ Destructured as dict/tr, NOT d/t. This file uses `t` for a transaction
  // in a dozen closures and `d` for a parsed Date in two more; the obvious
  // names would shadow both and silently change what the code means.
  const { d: dict, t: tr, locale } = useTranslation();
  const categoryMeta = useMemo(() => buildCategoryMeta(categories, budgets), [categories, budgets]);

  const [filtersExpanded, setFiltersExpanded] = useState(false);
  // These initial values are deliberately static and date-free so the server
  // render and the first client render are identical. The real defaults depend
  // on today's date and on localStorage, neither of which exists on the server,
  // so both are applied in a mount effect below instead.
  const [reportType, setReportType] = useState<ReportType>('expense');
  const [periodGroup, setPeriodGroup] = useState<PeriodGroup>('month');
  const [subPeriod, setSubPeriod] = useState('All');
  const [subYear, setSubYear] = useState('All');
  const [categoryGroup, setCategoryGroup] = useState<CategoryGroupMode>('category');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [sortField, setSortField] = useState<SortField>('date');
  const [groupsExpanded, setGroupsExpanded] = useState(false);
  const [restored, setRestored] = useState(false);
  const [descQuery, setDescQuery] = useState('');
  const [expandedCategoryGroups, setExpandedCategoryGroups] = useState<Set<string>>(new Set());
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);

  // Resolved once client-side, zone-aware - never getToday(), which reflects
  // the CONTAINER's zone (UTC on Vercel), not the user's. A separate, small
  // effect mirrors Header.tsx's own greeting effect rather than folding into
  // the restore effect below, which is unrelated. Static null initial value
  // keeps the server render and first client render identical; one frame
  // with today === null is accepted (see rollingWindow.ts and periodFiltered/
  // periodSummary below) rather than guessing a zone or reading the clock
  // during render.
  const timeZoneOverride = useTimeZoneOverride();
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => {
    const zone = timeZoneOverride ?? resolveBrowserTimeZone();
    setToday(todayInZone(zone));
  }, [timeZoneOverride]);

  const expenseCats = Object.keys(categoryMeta);
  const incomeCats = ['Standard Income', 'Side Cash'];
  const availableCats = reportType === 'expense' ? expenseCats : incomeCats;

  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set(expenseCats));
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());

  // Empty means ALL, deliberately - not a set seeded with every id. A seeded
  // set would silently exclude any account created later in the session, and
  // "all" is the default nobody has to opt into.
  //
  // NOT PERSISTED, matching selectedCategories: a stored selection can name
  // things that no longer exist, and accounts can be deleted outright.
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());

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

  // Restore once on mount. Runs client-side only, so reading localStorage and
  // the local clock here cannot desync from the server render.
  //
  // A ref rather than the `restored` flag guards re-entry: state updates are
  // async, so a second pass could start before the flag lands.
  const restoreRef = useRef(false);
  useEffect(() => {
    if (restoreRef.current) return;
    restoreRef.current = true;

    const saved = usePebbleStore.getState().reportFilters;
    if (saved) {
      setReportType(saved.reportType);
      setPeriodGroup(saved.periodGroup);
      setSubYear(saved.subYear);
      setSubPeriod(saved.subPeriod);
      setCategoryGroup(saved.categoryGroup);
      setSortField(saved.sortField);
      setSortDir(saved.sortDir);
      setFiltersExpanded(saved.filtersExpanded);
      setGroupsExpanded(saved.groupsExpanded);
      // Category selection is not persisted, so it has to follow the restored
      // type rather than the 'expense' default the state was seeded with.
      if (saved.reportType === 'income') setSelectedCategories(new Set(incomeCats));
    } else {
      // First visit on this device: scope the "which year" filter to the
      // current year. subPeriod is NOT seeded here - it stays at the static
      // 'All' sentinel, and effectiveSubPeriod (below) resolves that to the
      // current month/quarter/year once `today` is known, zone-aware, rather
      // than this non-zone-aware new Date().
      const now = new Date();
      setSubYear(String(now.getFullYear()));
    }
    setRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Write back on every change, but only after the restore pass - otherwise the
  // static seed values would overwrite the stored ones before they were read.
  useEffect(() => {
    if (!restored) return;
    usePebbleStore.getState().setReportFilters({
      reportType, periodGroup, subYear, subPeriod, categoryGroup, sortField, sortDir,
      filtersExpanded, groupsExpanded,
    });
  }, [restored, reportType, periodGroup, subYear, subPeriod, categoryGroup, sortField, sortDir,
      filtersExpanded, groupsExpanded]);

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
  const toggleAccount = (id: string) => {
    setSelectedAccounts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const clearAccounts = () => setSelectedAccounts(new Set());

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
    // Empty set means every account, so no filtering to do.
    if (selectedAccounts.size > 0 && !selectedAccounts.has(t.accountId)) return false;
    if (!t.description.toLowerCase().includes(descQuery.toLowerCase())) return false;
    if (showTagFilter && selectedTags.size > 0) {
      if (!isExpense(t) || !t.tag || !selectedTags.has(t.tag)) return false;
    }
    return true;
  });

  // Years actually present under the current type/category/search filters,
  // newest first.
  const yearOptions = Array.from(new Set(baseFiltered.map((t) => parseLocalDate(t.date).getFullYear())))
    .sort((a, b) => b - a)
    .map(String);

  // Month and quarter names carry no year, so selecting "August" used to match
  // every August in the data at once — with 2023-2026 loaded, that silently
  // merged four years into one total. The year selector scopes them.
  //
  // Falls back to the newest year present when the selected year has no rows
  // under the current filters, rather than rendering an empty report the user
  // has to reason about.
  const showYearSelector = periodGroup === 'month' || periodGroup === 'quarter';
  const effectiveSubYear =
    subYear === 'All' || yearOptions.includes(subYear) ? subYear : (yearOptions[0] ?? 'All');

  const subPeriodOptions =
    periodGroup === 'month' ? MONTH_NAMES
    : periodGroup === 'quarter' ? QUARTER_NAMES
    : periodGroup === 'year' ? yearOptions
    : null;
  const subPeriodLabel =
    periodGroup === 'month' ? dict.reports.whichMonth
    : periodGroup === 'quarter' ? dict.reports.whichQuarter
    : dict.reports.whichYear;

  // Resolved from the zone-aware `today` string (see the mount effect
  // above), never a fresh Date read here - this const runs on every render,
  // including the server render before hydration.
  const currentMonthName = today ? MONTH_NAMES[Number(today.slice(5, 7)) - 1] : null;
  const currentQuarterName = today ? QUARTER_NAMES[Math.floor((Number(today.slice(5, 7)) - 1) / 3)] : null;
  const currentYearStr = today ? today.slice(0, 4) : null;
  const currentPeriodValue =
    periodGroup === 'month' ? currentMonthName
    : periodGroup === 'quarter' ? currentQuarterName
    // Falls back to the newest year actually present, mirroring
    // effectiveSubYear's own fallback, for a year with no transactions yet.
    : periodGroup === 'year' ? (currentYearStr && yearOptions.includes(currentYearStr) ? currentYearStr : (yearOptions[0] ?? null))
    : null;

  // The Month/Quarter/Year sub-period selector no longer offers "All" (see
  // ReportFilters.tsx) - it always shows exactly one period, defaulting to
  // the current one. 'All' can still arrive here from localStorage written
  // before this change, or from handlePeriodGroupChange's reset on every
  // mode switch; both are treated as "use the current period", not a value
  // needing a migration. Falls back to the raw, possibly-stale subPeriod for
  // the one frame before `today` resolves - accepted, same as the rolling
  // window's own one-frame gap.
  const effectiveSubPeriod =
    subPeriodOptions && subPeriod !== 'All' && subPeriodOptions.includes(subPeriod)
      ? subPeriod
      : (currentPeriodValue ?? subPeriod);

  const yearScoped = (showYearSelector && effectiveSubYear !== 'All')
    ? baseFiltered.filter((t) => parseLocalDate(t.date).getFullYear() === Number(effectiveSubYear))
    : baseFiltered;

  // null whenever periodGroup is not a rolling mode, and also for the one
  // frame before `today` resolves - both fall through to the unfiltered set
  // in periodFiltered below rather than guessing a window.
  const rollingWindow = useMemo(
    () => (today && isRollingWindowKey(periodGroup) ? resolveRollingWindow(periodGroup, today) : null),
    [periodGroup, today],
  );

  // Month/Quarter/Year now ALWAYS narrows to exactly one period - no more
  // "All periods" branch (see effectiveSubPeriod above). Gated on
  // subPeriodOptions.includes(...) rather than "today resolved": an already-
  // persisted, still-valid choice (e.g. a specific month picked earlier)
  // filters immediately without waiting on the async today effect; only the
  // CURRENT-period fallback needs `today`, and until it resolves this falls
  // through to unfiltered for that one frame, same as the rolling window.
  const periodFiltered = (subPeriodOptions && subPeriodOptions.includes(effectiveSubPeriod))
    ? yearScoped.filter((t) => {
        const d = parseLocalDate(t.date);
        if (periodGroup === 'month') return MONTH_NAMES[d.getMonth()] === effectiveSubPeriod;
        if (periodGroup === 'quarter') return QUARTER_NAMES[Math.floor(d.getMonth() / 3)] === effectiveSubPeriod;
        return String(d.getFullYear()) === effectiveSubPeriod;
      })
    // Rolling windows filter on the plain YYYY-MM-DD string - see
    // rollingWindow.ts. rollingWindow is null both when periodGroup is not a
    // rolling mode and for the one frame before `today` resolves, so this
    // falls through to the unfiltered set in both cases.
    : rollingWindow
      ? yearScoped.filter((t) => isInRollingWindow(rollingWindow, t.date))
      : yearScoped;

  // Period headers render whenever a period grouping is active, including for a
  // single selected period. Previously also required subPeriod === 'All', so
  // choosing a specific month/quarter/year skipped bucketing entirely and the
  // rows fell into one untitled flat group.
  //
  // ALLOW-LIST, not '!== all': a rolling window (last3/last6/last12) has no
  // period buckets either. Grouping a rolling window by calendar period would
  // put a partial in-progress month beside complete ones with nothing marking
  // the difference - the same problem Analysis had to be remodelled to avoid.
  // The fix here is to never group a rolling window, not to label the partial
  // period.
  const showPeriodHeaders = periodGroup === 'month' || periodGroup === 'quarter' || periodGroup === 'year';

  // Date sorting falls back to the id as a same-day tiebreak, matching how
  // the statement orders entries added on the same day.
  const sortFn = (a: Transaction, b: Transaction) => {
    if (sortField === 'date') {
      const diff = parseLocalDate(a.date).getTime() - parseLocalDate(b.date).getTime()
        || compareSameDayIds(a.id, b.id);
      return sortDir === 'desc' ? -diff : diff;
    }
    return sortDir === 'desc'
      ? Math.abs(b.amount) - Math.abs(a.amount)
      : Math.abs(a.amount) - Math.abs(b.amount);
  };

  // Applies the selected direction to a comparator written in descending
  // order. One place, so direction can never be flipped at one nesting level
  // and forgotten at another.
  const directed = (descDiff: number) => (sortDir === 'desc' ? descDiff : -descDiff);

  // A group's leading date. items[] is already sorted by sortFn before this
  // runs, so items[0] IS the leading date in the chosen direction - no extra
  // min/max scan needed.
  const leadingTime = (items: Transaction[]): number =>
    items.length === 0 ? 0 : parseLocalDate(items[0].date).getTime();

  // ⚠️ MONTH_NAMES and QUARTER_NAMES above are VALUES, not labels: subPeriod
  // holds one, it is persisted to localStorage in reportFilters, and it is
  // compared by equality when filtering. They stay English everywhere; only
  // their <option> text is translated, in ReportFilters.
  const periodBuckets = new Map<string, { sortKey: number; label: string; items: Transaction[] }>();
  if (showPeriodHeaders) {
    periodFiltered.forEach((t) => {
      const d = parseLocalDate(t.date);
      // key stays English and stable; label is what gets rendered. Splitting
      // them keeps the React key, the sort tiebreak and the expansion key
      // language-independent.
      let key: string, sortKey: number, label: string;
      if (periodGroup === 'month') {
        key = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        label = formatMonthYear(d.getFullYear(), d.getMonth(), locale);
        sortKey = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      } else if (periodGroup === 'quarter') {
        const q = Math.floor(d.getMonth() / 3) + 1;
        key = `Q${q} ${d.getFullYear()}`;
        label = tr(dict.reports.quarterOfYear, { quarter: dict.quarters[`Q${q}` as 'Q1'], year: d.getFullYear() });
        sortKey = new Date(d.getFullYear(), (q - 1) * 3, 1).getTime();
      } else {
        // periodGroup === 'year'. Previously fell through to the quarter
        // branch, so selecting Year silently grouped and labelled by quarter.
        key = `${d.getFullYear()}`;
        label = key;
        sortKey = new Date(d.getFullYear(), 0, 1).getTime();
      }
      if (!periodBuckets.has(key)) periodBuckets.set(key, { sortKey, label, items: [] });
      periodBuckets.get(key)!.items.push(t);
    });
  } else {
    periodBuckets.set('__flat__', { sortKey: 0, label: '', items: periodFiltered });
  }

  // Groups and subgroups order on the SAME axis as the rows inside them, so
  // each sort button means one consistent thing at every level: 'date' orders
  // periods chronologically and categories by their leading transaction,
  // 'amount' orders both by total. Ordering groups by total while rows sorted
  // by date (the previous behaviour) made "Oldest first" look broken.
  //
  // The key comparison is a stable tiebreak: without it, two groups with equal
  // totals could swap places between renders.
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
          .sort((a, b) =>
            directed(
              sortField === 'date'
                ? leadingTime(b.items) - leadingTime(a.items)
                : b.total - a.total,
            ) || a.key.localeCompare(b.key));
        return { key, label: v.label, sortKey: v.sortKey, total, subGroups };
      }
      return { key, label: v.label, sortKey: v.sortKey, total, items: [...v.items].sort(sortFn) };
    })
    .sort((a, b) =>
      directed(
        sortField === 'date' ? b.sortKey - a.sortKey : b.total - a.total,
      ) || a.key.localeCompare(b.key));

  const grandTotal = periodFiltered.reduce((s, t) => s + Math.abs(t.amount), 0);
  const accent = reportType === 'expense' ? 'var(--wine)' : 'var(--pine)';

  const allGroupKeys = categoryGroup === 'category'
    ? periodGroups.flatMap((pg) => (pg.subGroups ?? []).map((sg) => `${pg.key}::${sg.key}`))
    : [];
  const anyGroupsExpanded = allGroupKeys.some((k) => expandedCategoryGroups.has(k));
  const handleToggleAllGroups = () => {
    const next = !anyGroupsExpanded;
    setGroupsExpanded(next);
    setExpandedCategoryGroups(next ? new Set(allGroupKeys) : new Set());
  };

  // Re-applies the stored bulk choice whenever the visible group set changes -
  // on mount, and whenever a filter produces different groups. Keyed on a joined
  // signature rather than the array itself, which is a new reference every
  // render and would loop.
  //
  // Individual group toggles are untouched: they change neither the signature
  // nor the bulk preference, so this effect does not run and does not undo them.
  const groupKeySignature = allGroupKeys.join('|');
  useEffect(() => {
    if (!restored) return;
    setExpandedCategoryGroups(groupsExpanded ? new Set(allGroupKeys) : new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restored, groupsExpanded, groupKeySignature]);

  // Rebuilt as ' · '-joined parts rather than one interpolated sentence. The
  // original spliced the raw periodGroup value into English text ("By month"),
  // which no other language can take; joined parts need no word order at all.
  const yearPart = effectiveSubYear === 'All' ? dict.reports.allYears : effectiveSubYear;
  const periodSummary = isRollingWindowKey(periodGroup)
    // One frame before `today` resolves, rollingWindow is null - show just
    // the mode name rather than a guessed or blank range.
    ? (rollingWindow ? `${dict.reports[periodGroup]} · ${formatRollingRangeLabel(rollingWindow, locale)}` : dict.reports[periodGroup])
    : periodGroup === 'all' ? dict.reports.allTime
    // effectiveSubPeriod, not subPeriod: shows the RESOLVED current period,
    // not the raw 'All' sentinel it may still equal internally.
    : periodGroup === 'year' ? (effectiveSubPeriod === 'All' ? dict.reports.byYear : effectiveSubPeriod)
    : effectiveSubPeriod === 'All'
      ? `${periodGroup === 'month' ? dict.reports.byMonth : dict.reports.byQuarter} · ${yearPart}`
      : `${periodValueLabel(dict, effectiveSubPeriod)} · ${yearPart}`;
  const filterSummaryParts = [reportType === 'expense' ? dict.reports.expenses : dict.reports.income, periodSummary];
  if (categoryGroup === 'category') filterSummaryParts.push(dict.reports.groupedByCategory);
  if (!allSelected) filterSummaryParts.push(tr(selectedCategories.size === 1 ? dict.reports.categoriesOne : dict.reports.categoriesOther, { count: selectedCategories.size }));
  // Named when it is a single account, counted otherwise. Without this the
  // summary is silent about an active account filter, and a collapsed panel
  // would show reduced totals with nothing explaining why.
  if (selectedAccounts.size > 0) {
    const only = selectedAccounts.size === 1
      ? accounts.find((a) => a.id === Array.from(selectedAccounts)[0])
      : undefined;
    filterSummaryParts.push(
      only
        ? only.name
        : tr(dict.reports.accountsOther, { count: selectedAccounts.size }),
    );
  }
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
        subPeriod={effectiveSubPeriod}
        onSubPeriodChange={setSubPeriod}
        subPeriodOptions={subPeriodOptions}
        subPeriodLabel={subPeriodLabel}
        subYear={effectiveSubYear}
        onSubYearChange={setSubYear}
        yearOptions={yearOptions}
        showYearSelector={showYearSelector}
        categoryGroup={categoryGroup}
        onCategoryGroupChange={setCategoryGroup}
        sortDir={sortDir}
        onSortDirChange={setSortDir}
        sortField={sortField}
        onSortFieldChange={setSortField}
        descQuery={descQuery}
        onDescQueryChange={setDescQuery}
        accounts={accounts}
        selectedAccounts={selectedAccounts}
        onToggleAccount={toggleAccount}
        onClearAccounts={clearAccounts}
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
