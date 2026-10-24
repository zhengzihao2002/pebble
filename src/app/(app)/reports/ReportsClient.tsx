'use client';

import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { usePebbleStore } from '@/store/usePebbleStore';
import { buildCategoryMeta } from '@/lib/data/categoryMeta';
import type { CategoryItem, Account } from '@/lib/data/mappers';
import { formatCurrency, formatMonthYear, parseLocalDate } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { categoryLabel, periodValueLabel } from '@/lib/i18n/enumLabels';
import { INTL_LOCALE } from '@/lib/i18n/locale';
import { MONTH_NAMES, QUARTER_NAMES } from '@/data/seed';
import { compareSameDayIds } from '@/lib/stats';
import { ReportFilters } from '@/components/reports/ReportFilters';
import { ReportResults, type ReportEmptyInfo } from '@/components/reports/ReportResults';
import { ReportToolbar } from '@/components/reports/ReportToolbar';
import { ReportFilterChips, type ActiveFilterChip } from '@/components/reports/ReportFilterChips';
import { ReportSummary, type ReportDelta, type ShareSlice } from '@/components/reports/ReportSummary';
import { ReportTimeline } from '@/components/reports/ReportTimeline';
import { ReportSkeleton } from '@/components/reports/ReportSkeleton';
import { previousWindow, resolvePeriodBounds, shiftCustomRange, stepPeriod, diffDays, type Bounds } from '@/components/reports/periodBounds';
import { buildReportBuckets } from '@/components/reports/reportBuckets';
import { categoryMonthlySeries } from '@/components/reports/categorySeries';
import { buildReportCsv, downloadCsv } from '@/components/reports/ReportExport';
import { TransactionDetailModal } from '@/components/modals/TransactionDetailModal';
import type { ExpenseTransaction, Transaction } from '@/types';
import type { ReportType, PeriodGroup, CategoryGroupMode, SortDir, SortField, ReportPeriodGroup } from '@/components/reports/types';
import { useTimeZoneOverride } from '@/lib/time/TimeZoneOverrideContext';
import { resolveBrowserTimeZone } from '@/lib/time/timeZone';
import { todayInZone } from '@/lib/recurring/occurrences';
import { isRollingWindowKey, resolveRollingWindow, isInRollingWindow, formatRollingRangeLabel } from '@/components/reports/rollingWindow';
import { defaultCustomRange, formatCustomRangeLabel, isCustomRangeInverted, isInCustomRange, sanitizeYmd } from '@/components/reports/customRange';

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
  // Open state of the Accounts and Categories sections. Persisted beside
  // filtersExpanded, and collapsed by default like the outer panel.
  const [accountsExpanded, setAccountsExpanded] = useState(false);
  const [categoriesExpanded, setCategoriesExpanded] = useState(false);
  const [typesExpanded, setTypesExpanded] = useState(false);
  const [periodExpanded, setPeriodExpanded] = useState(false);
  const [groupSortExpanded, setGroupSortExpanded] = useState(false);
  const [findExpanded, setFindExpanded] = useState(false);
  // These initial values are deliberately static and date-free so the server
  // render and the first client render are identical. The real defaults depend
  // on today's date and on localStorage, neither of which exists on the server,
  // so both are applied in a mount effect below instead.
  // Which transaction types Reports shows, as an explicit set like the category
  // selection: both is ALL, and an empty set means nothing is selected. Static
  // for server/client parity like the rest - the saved choice is applied in the
  // restore effect.
  const [selectedTypes, setSelectedTypes] = useState<Set<ReportType>>(new Set<ReportType>(['expense', 'income']));
  const [periodGroup, setPeriodGroup] = useState<PeriodGroup>('month');
  const [subPeriod, setSubPeriod] = useState('All');
  const [subYear, setSubYear] = useState('All');
  const [categoryGroup, setCategoryGroup] = useState<CategoryGroupMode>('category');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [sortField, setSortField] = useState<SortField>('date');
  const [groupsExpanded, setGroupsExpanded] = useState(false);
  const [restored, setRestored] = useState(false);
  const [descQuery, setDescQuery] = useState('');
  // Custom range bounds, 'YYYY-MM-DD' or '' for an open end. Static '' seeds
  // for the same server/client parity as everything above; defaults are
  // filled once `today` is known (see the effect after the write-back).
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [expandedCategoryGroups, setExpandedCategoryGroups] = useState<Set<string>>(new Set());
  // The summary's timeline chart, hidden by choice. Persisted beside the
  // other prefs; restored with === true like every field added later.
  const [chartHidden, setChartHidden] = useState(false);
  const privacyOn = usePebbleStore((s) => s.privacyOn);
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
  // Categories on offer for a type selection: the expense categories, then the
  // two income ones.
  const catsForTypes = (types: ReadonlySet<ReportType>) => [
    ...(types.has('expense') ? expenseCats : []),
    ...(types.has('income') ? incomeCats : []),
  ];
  const includeExpense = selectedTypes.has('expense');
  const includeIncome = selectedTypes.has('income');
  // Both types showing: totals are NET (income minus expenses, signed). One
  // type: the absolute sum, exactly as before.
  const mixed = includeExpense && includeIncome;
  const amt = (t: Transaction) => (mixed ? t.amount : Math.abs(t.amount));
  const availableCats = catsForTypes(selectedTypes);

  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set(catsForTypes(selectedTypes)));
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());

  // Empty means ALL, deliberately - not a set seeded with every id. A seeded
  // set would silently exclude any account created later in the session, and
  // "all" is the default nobody has to opt into.
  //
  // NOT PERSISTED, matching selectedCategories: a stored selection can name
  // things that no longer exist, and accounts can be deleted outright.
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());

  const showTagFilter = includeExpense && selectedCategories.size === 1
    && expenseCats.includes(Array.from(selectedCategories)[0]);
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
      // typeSelection is the source of truth: the explicit set of shown types,
      // where an empty list means nothing is selected. Older prefs carry
      // reportTypes (where empty meant ALL) or only the single reportType; both
      // migrate so nobody's saved view flips. Validated, not trusted.
      const onlyKinds = (v: unknown): ReportType[] =>
        Array.isArray(v) ? v.filter((x): x is ReportType => x === 'expense' || x === 'income') : [];
      const restoredTypes = new Set<ReportType>(
        Array.isArray(saved.typeSelection) ? onlyKinds(saved.typeSelection)
        : Array.isArray(saved.reportTypes) ? (onlyKinds(saved.reportTypes).length === 1 ? onlyKinds(saved.reportTypes) : ['expense', 'income'])
        : [saved.reportType === 'income' ? 'income' : 'expense'],
      );
      setSelectedTypes(restoredTypes);
      setPeriodGroup(saved.periodGroup);
      setSubYear(saved.subYear);
      setSubPeriod(saved.subPeriod);
      setCategoryGroup(saved.categoryGroup);
      setSortField(saved.sortField);
      setSortDir(saved.sortDir);
      setFiltersExpanded(saved.filtersExpanded);
      // === true: prefs saved before these existed have neither field.
      setAccountsExpanded(saved.accountsExpanded === true);
      setCategoriesExpanded(saved.categoriesExpanded === true);
      setTypesExpanded(saved.typesExpanded === true);
      setPeriodExpanded(saved.periodExpanded === true);
      setGroupSortExpanded(saved.groupSortExpanded === true);
      setFindExpanded(saved.findExpanded === true);
      setChartHidden(saved.chartHidden === true);
      setGroupsExpanded(saved.groupsExpanded);
      // Validated, not trusted: localStorage can hold anything, and prefs
      // written before custom ranges existed have neither field.
      setCustomStart(sanitizeYmd(saved.customStart));
      setCustomEnd(sanitizeYmd(saved.customEnd));
      // Category selection is not persisted, so it has to follow the restored
      // types rather than the all-categories default the state was seeded with.
      setSelectedCategories(new Set(catsForTypes(restoredTypes)));
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
      // The legacy single type is still written so an older build keeps working.
      reportType: selectedTypes.size === 1 ? Array.from(selectedTypes)[0] : 'expense',
      typeSelection: Array.from(selectedTypes),
      periodGroup, subYear, subPeriod, categoryGroup, sortField, sortDir,
      filtersExpanded, groupsExpanded, customStart, customEnd,
      accountsExpanded, categoriesExpanded, periodExpanded, groupSortExpanded, findExpanded, typesExpanded,
      chartHidden,
    });
  }, [restored, selectedTypes, periodGroup, subYear, subPeriod, categoryGroup, sortField, sortDir,
      filtersExpanded, groupsExpanded, customStart, customEnd, accountsExpanded, categoriesExpanded,
      periodExpanded, groupSortExpanded, findExpanded, typesExpanded, chartHidden]);

  // Choosing Custom range with no dates yet (first use, or prefs saved before
  // this feature) fills the current month to date, zone-aware via `today`.
  // Only when BOTH are empty: a range with one deliberately open end is left
  // alone. Keyed on the mode and `today`, not the dates, so clearing both
  // while already in Custom range does not refill them.
  useEffect(() => {
    if (!restored || periodGroup !== 'custom' || !today) return;
    if (customStart === '' && customEnd === '') {
      const range = defaultCustomRange(today);
      setCustomStart(range.startYmd);
      setCustomEnd(range.endYmd);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restored, periodGroup, today]);

  // The type selection is explicit, like categories: All is both types, and an
  // empty set shows nothing. Changing it resets categories to everything on offer.
  const applyTypes = (next: Set<ReportType>) => {
    setSelectedTypes(next);
    setSelectedCategories(new Set(catsForTypes(next)));
  };
  const toggleType = (kind: ReportType) => {
    // From All a click isolates that type (as Accounts does); otherwise it toggles.
    if (selectedTypes.size === 2) return applyTypes(new Set<ReportType>([kind]));
    const next = new Set(selectedTypes);
    if (next.has(kind)) next.delete(kind); else next.add(kind);
    applyTypes(next);
  };
  // All while everything is selected clears the selection; otherwise it selects both.
  const toggleAllTypes = () =>
    applyTypes(selectedTypes.size === 2 ? new Set<ReportType>() : new Set<ReportType>(['expense', 'income']));
  const handlePeriodGroupChange = (mode: PeriodGroup) => {
    setPeriodGroup(mode);
    setSubPeriod('All');
  };
  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      // Every category on offer for this period selected means ALL, so the All
      // pill lights up. Promoted to the full set rather than left as the visible
      // subset: the results for this period are identical, and the selection
      // stays "everything" when the period changes.
      if (periodCategories.length > 0 && periodCategories.every((c) => next.has(c))) return new Set(availableCats);
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
    const matchesType = isExpense(t) ? includeExpense : includeIncome;
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

  // Rows of the current report type, before any account, category or search
  // filter. The year list and the period-scoped options both start here, so
  // narrowing categories or accounts (even to nothing) can never change which
  // years or which period the filter resolves to.
  const typeRows = useMemo(
    () => transactions.filter((t) => (isExpense(t) ? includeExpense : includeIncome)),
    [transactions, includeExpense, includeIncome],
  );

  // Years with at least one row of the current type, newest first.
  const yearOptions = Array.from(new Set(typeRows.map((t) => parseLocalDate(t.date).getFullYear())))
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
  const customRange = { startYmd: customStart, endYmd: customEnd };
  const customRangeInverted = isCustomRangeInverted(customRange);

  // The ONE period predicate. Results below and the Accounts/Categories
  // options further down both go through it, so a list can never disagree
  // with what the filter actually counts.
  const applyPeriod = (rows: Transaction[]): Transaction[] => {
  const yearScoped = (showYearSelector && effectiveSubYear !== 'All')
    ? rows.filter((t) => parseLocalDate(t.date).getFullYear() === Number(effectiveSubYear))
    : rows;
  return (subPeriodOptions && subPeriodOptions.includes(effectiveSubPeriod))
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
      : periodGroup === 'custom'
        // An inverted range is flagged in the filters and matches nothing,
        // rather than being silently swapped. Flat, like rolling windows.
        ? (customRangeInverted ? [] : yearScoped.filter((t) => isInCustomRange(customRange, t.date)))
        : yearScoped;
  };
  const periodFiltered = applyPeriod(baseFiltered);

  // What the Accounts and Categories sections may offer: only things with at
  // least one row of the current type inside the selected period. Computed
  // BEFORE the account/category/search filters, from the same predicate as the
  // results. Keyed on a joined signature of the sub-period options rather than
  // the array, which is a new reference every render (see groupKeySignature).
  const subPeriodSignature = subPeriodOptions ? subPeriodOptions.join('|') : '';
  const periodOptions = useMemo(() => {
    const rows = applyPeriod(typeRows);
    return {
      hasRows: rows.length > 0,
      accountIds: new Set(rows.map((t) => t.accountId)),
      categories: new Set(rows.map((t) => t.category)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeRows, periodGroup, effectiveSubPeriod, effectiveSubYear, showYearSelector,
      subPeriodSignature, rollingWindow, customStart, customEnd]);

  // A selected item stays listed even with no rows in this period, so totals
  // never change for no visible reason and the selection survives a trip
  // through an empty period. Categories start fully selected, so "selected"
  // only counts once the person has narrowed them (!allSelected).
  const periodAccounts = accounts.filter((a) => periodOptions.accountIds.has(a.id) || selectedAccounts.has(a.id));
  const periodCategories = availableCats.filter((c) => periodOptions.categories.has(c) || (!allSelected && selectedCategories.has(c)));

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
  // Category groups: the income categories lead, then the expense ones (the
  // Money in / Money out split), whatever the sort. Only the order BETWEEN
  // the two kinds is fixed; the chosen sort still orders everything within
  // each kind. Ungrouped (Group by: None) rows are NOT split by type: income
  // and expenses mix in one list under the chosen sort, each row carrying its
  // own in/out tint. Periods keep the chosen order, so a month never jumps
  // ahead of another.
  const catRank = (cat: string) => (incomeCats.includes(cat) ? 0 : 1);
  const periodGroups: ReportPeriodGroup[] = [...periodBuckets.entries()]
    .map(([key, v]) => {
      const total = v.items.reduce((s, t) => s + amt(t), 0);
      if (categoryGroup === 'category') {
        const catBuckets = new Map<string, Transaction[]>();
        v.items.forEach((t) => {
          if (!catBuckets.has(t.category)) catBuckets.set(t.category, []);
          catBuckets.get(t.category)!.push(t);
        });
        const subGroups = [...catBuckets.entries()]
          .map(([cat, items]) => ({ key: cat, total: items.reduce((s, t) => s + amt(t), 0), items: [...items].sort(sortFn) }))
          .sort((a, b) =>
            (catRank(a.key) - catRank(b.key)) || directed(
              sortField === 'date'
                ? leadingTime(b.items) - leadingTime(a.items)
                : Math.abs(b.total) - Math.abs(a.total),
            ) || a.key.localeCompare(b.key));
        return { key, label: v.label, sortKey: v.sortKey, total, subGroups };
      }
      return { key, label: v.label, sortKey: v.sortKey, total, items: [...v.items].sort(sortFn) };
    })
    .sort((a, b) =>
      directed(
        sortField === 'date' ? b.sortKey - a.sortKey : Math.abs(b.total) - Math.abs(a.total),
      ) || a.key.localeCompare(b.key));

  const grandTotal = periodFiltered.reduce((s, t) => s + amt(t), 0);
  // One type: wine for money out, pine for money in. Both types: the colour
  // follows the sign of the NET, pine when positive and wine when negative, ink
  // only at exactly zero. Rounded to cents so float noise cannot colour a zero.
  const netCents = Math.round(grandTotal * 100);
  const accent = mixed
    ? (netCents > 0 ? 'var(--pine)' : netCents < 0 ? 'var(--wine)' : 'var(--ink)')
    : includeExpense ? 'var(--wine)' : includeIncome ? 'var(--pine)' : 'var(--ink)';

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
    : periodGroup === 'custom' ? `${dict.reports.custom} · ${formatCustomRangeLabel(customRange, locale)}`
    : periodGroup === 'all' ? dict.reports.allTime
    // effectiveSubPeriod, not subPeriod: shows the RESOLVED current period,
    // not the raw 'All' sentinel it may still equal internally.
    : periodGroup === 'year' ? (effectiveSubPeriod === 'All' ? dict.reports.byYear : effectiveSubPeriod)
    : effectiveSubPeriod === 'All'
      ? `${periodGroup === 'month' ? dict.reports.byMonth : dict.reports.byQuarter} · ${yearPart}`
      : `${periodValueLabel(dict, effectiveSubPeriod)} · ${yearPart}`;
  const typePart = mixed ? dict.reports.bothTypes
    : includeExpense ? dict.reports.expenses
    : includeIncome ? dict.reports.income
    : dict.reports.noneSelected;
  const filterSummaryParts = [typePart, periodSummary];
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

  // ---------------------------------------------------------------------
  // The redesign's derived pieces. All read the state and rows above; none
  // filters anything - periodFiltered stays the one result set.
  // ---------------------------------------------------------------------
  const ux = dict.ux.reports;
  const loc = INTL_LOCALE[locale];
  const fmtYmd = (ymd: string, o: Intl.DateTimeFormatOptions) => parseLocalDate(ymd).toLocaleDateString(loc, o);

  // The span the report covers (null for Month/Quarter across All years).
  let dataRange: Bounds | null = null;
  for (const t of periodFiltered) {
    if (!dataRange) dataRange = { startYmd: t.date, endYmd: t.date };
    else {
      if (t.date < dataRange.startYmd) dataRange.startYmd = t.date;
      if (t.date > dataRange.endYmd) dataRange.endYmd = t.date;
    }
  }
  const bounds = resolvePeriodBounds({
    periodGroup, subPeriod: effectiveSubPeriod, subYear: effectiveSubYear,
    rollingWindow, customRange, today, dataRange,
  });

  // Money in and out, as the hero and the copied summary show them.
  let inSum = 0;
  let outSum = 0;
  for (const t of periodFiltered) { if (t.amount > 0) inSum += t.amount; else outSum -= t.amount; }

  // Comparison with the previous comparable period, over the same filters
  // (baseFiltered) - to date when this one is still in progress.
  const prevWin = previousWindow(periodGroup, bounds, customRange, today);
  let delta: ReportDelta | null = null;
  if (prevWin && periodFiltered.length > 0) {
    const within = (rows: Transaction[], b: Bounds) => rows.filter((t) => t.date >= b.startYmd && t.date <= b.endYmd);
    const prevRows = within(baseFiltered, prevWin.bounds);
    if (prevRows.length > 0) {
      const cur = within(periodFiltered, prevWin.current).reduce((s, t) => s + amt(t), 0);
      const prev = prevRows.reduce((s, t) => s + amt(t), 0);
      const b = prevWin.bounds;
      const period = prevWin.toDate
        ? `${fmtYmd(b.startYmd, { month: 'short', day: 'numeric' })} – ${fmtYmd(b.endYmd, b.startYmd.slice(0, 7) === b.endYmd.slice(0, 7) ? { day: 'numeric' } : { month: 'short', day: 'numeric' })}`
        : prevWin.kind === 'month' ? formatMonthYear(Number(b.startYmd.slice(0, 4)), Number(b.startYmd.slice(5, 7)) - 1, locale)
        : prevWin.kind === 'quarter' ? tr(dict.reports.quarterOfYear, { quarter: dict.quarters[`Q${Math.floor((Number(b.startYmd.slice(5, 7)) - 1) / 3) + 1}` as 'Q1'], year: b.startYmd.slice(0, 4) })
        : prevWin.kind === 'year' ? b.startYmd.slice(0, 4)
        : tr(prevWin.kind === 'months' ? ux.prevMonths : ux.prevDays, { count: prevWin.count });
      const diff = cur - prev;
      delta = mixed
        // A net can change sign, so a percentage of it means little: the
        // difference in money instead (blurred in privacy mode).
        ? { delta: diff, text: formatCurrency(Math.abs(diff)), money: true, good: 'up', period }
        : { delta: prev === 0 ? 0 : diff, text: `${Math.round(Math.abs(diff / (prev || 1)) * 100)}%`, money: false, good: includeExpense ? 'down' : 'up', period };
    }
  }

  // The side the share bar, daily average, largest and top category describe:
  // spending whenever expenses are shown, else income.
  const mainSide: 'in' | 'out' = includeExpense ? 'out' : 'in';
  const mainRows = periodFiltered.filter((t) => (mainSide === 'out' ? t.amount < 0 : t.amount > 0));
  const mainTotal = mainRows.reduce((s, t) => s + Math.abs(t.amount), 0);
  const byCat = new Map<string, number>();
  for (const t of mainRows) byCat.set(t.category, (byCat.get(t.category) ?? 0) + Math.abs(t.amount));
  const ranked = [...byCat.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const shares: ShareSlice[] = ranked.slice(0, 6).map(([key, value]) => ({ key, value, share: mainTotal ? value / mainTotal : 0 }));
  const restValue = ranked.slice(6).reduce((s, [, v]) => s + v, 0);
  if (restValue > 0) shares.push({ key: '__other__', value: restValue, share: mainTotal ? restValue / mainTotal : 0 });
  const isolated = selectedCategories.size === 1 ? Array.from(selectedCategories)[0] : null;
  // Same setter as the Categories pills: one category, or back to all.
  const isolateCategory = (cat: string) =>
    setSelectedCategories(isolated === cat ? new Set(availableCats) : new Set([cat]));
  const elapsedDays = bounds && today ? diffDays(bounds.startYmd, bounds.endYmd < today ? bounds.endYmd : today) + 1 : 0;
  const dailyAverage = bounds && elapsedDays > 0 && mainTotal > 0 ? mainTotal / elapsedDays : null;
  const largest = mainRows.reduce<Transaction | null>((best, t) => (!best || Math.abs(t.amount) > Math.abs(best.amount) ? t : best), null);

  // Timeline chart over the bounds.
  const timeline = bounds && periodFiltered.length > 0 ? buildReportBuckets(periodFiltered, bounds, today) : null;
  const timelineMode = mixed ? 'mixed' : includeExpense ? 'expense' : 'income';

  // Category trends: 12 months ending with the report's end (or today).
  const seriesEnd = bounds ? (today && bounds.endYmd > today ? today : bounds.endYmd) : today;
  const series = categoryGroup === 'category' && seriesEnd ? categoryMonthlySeries(baseFiltered, seriesEnd, 12, amt) : null;

  // Period stepper.
  const stepTarget = (dir: 1 | -1) =>
    periodGroup === 'custom'
      ? null
      : stepPeriod(periodGroup, effectiveSubPeriod, effectiveSubYear, yearOptions, today, dir);
  const earliest = typeRows.reduce<string | null>((m, t) => (m === null || t.date < m ? t.date : m), null);
  const customStep = (dir: 1 | -1) => (periodGroup === 'custom' ? shiftCustomRange(customRange, dir, today, earliest) : null);
  const canStep = (dir: 1 | -1) => (periodGroup === 'custom' ? customStep(dir) !== null : stepTarget(dir) !== null);
  const step = (dir: 1 | -1) => {
    if (periodGroup === 'custom') {
      const next = customStep(dir);
      if (next) { setCustomStart(next.startYmd); setCustomEnd(next.endYmd); }
      return;
    }
    const target = stepTarget(dir);
    if (!target) return;
    setSubPeriod(target.subPeriod);
    setSubYear(target.subYear);
  };
  const steppable = periodGroup === 'month' || periodGroup === 'quarter' || periodGroup === 'year'
    || (periodGroup === 'custom' && customStart !== '' && customEnd !== '' && !customRangeInverted);
  const currentYearHasRows = !!currentYearStr && yearOptions.includes(currentYearStr);
  const awayFromCurrent = !!today && (
    (periodGroup === 'year' && currentPeriodValue !== null && effectiveSubPeriod !== currentPeriodValue)
    || ((periodGroup === 'month' || periodGroup === 'quarter') && currentYearHasRows
      && (effectiveSubPeriod !== currentPeriodValue || effectiveSubYear !== currentYearStr)));
  const goCurrent = () => {
    setSubPeriod('All');
    if ((periodGroup === 'month' || periodGroup === 'quarter') && currentYearStr) setSubYear(currentYearStr);
  };
  const concreteYear = effectiveSubYear !== 'All' ? Number(effectiveSubYear) : null;
  const stepLabel = (() => {
    if (periodGroup === 'month' && concreteYear !== null && MONTH_NAMES.includes(effectiveSubPeriod)) {
      const m = MONTH_NAMES.indexOf(effectiveSubPeriod);
      // zh: '26年10月' - the four-digit '2026年10月' does not fit a 390px toolbar.
      const short = locale === 'zh'
        ? `${String(concreteYear).slice(-2)}年${m + 1}月`
        : new Date(concreteYear, m, 1).toLocaleDateString(loc, { month: 'short', year: 'numeric' });
      return { long: formatMonthYear(concreteYear, m, locale), short };
    }
    if (periodGroup === 'quarter' && concreteYear !== null && QUARTER_NAMES.includes(effectiveSubPeriod)) {
      const q = tr(dict.reports.quarterOfYear, { quarter: dict.quarters[effectiveSubPeriod as 'Q1'], year: concreteYear });
      return { long: q, short: q };
    }
    if (periodGroup === 'custom' && bounds) {
      const sameYear = bounds.startYmd.slice(0, 4) === bounds.endYmd.slice(0, 4);
      const o: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) };
      return { long: periodSummary, short: `${fmtYmd(bounds.startYmd, o)} – ${fmtYmd(bounds.endYmd, o)}` };
    }
    if (isRollingWindowKey(periodGroup)) return { long: periodSummary, short: dict.reports[periodGroup] };
    return { long: periodSummary, short: periodSummary };
  })();

  // Remount key for the cross-fade: language-independent, so a language
  // switch keeps every card (and ReportResults' local state) in place; a
  // custom range stays one key, so typing a date does not remount it.
  const periodKey = periodGroup === 'custom' ? 'custom'
    : `${periodGroup}|${effectiveSubPeriod}|${effectiveSubYear}|${rollingWindow?.startYmd ?? ''}`;

  // Active filters as removable chips. Each × resets only its own dimension;
  // Clear resets them all but never the period, grouping or sort.
  const clearAllFilters = () => {
    applyTypes(new Set<ReportType>(['expense', 'income']));
    clearAccounts();
    setDescQuery('');
    setSelectedTags(new Set());
  };
  const chips: ActiveFilterChip[] = [];
  if (selectedTypes.size !== 2) {
    chips.push({ key: 'types', label: typePart, onRemove: () => applyTypes(new Set<ReportType>(['expense', 'income'])) });
  }
  if (!allSelected && selectedTypes.size > 0) {
    chips.push({
      key: 'categories',
      label: selectedCategories.size === 0 ? `${dict.reports.categoriesLabel} · ${dict.reports.noneSelected}`
        : selectedCategories.size === 1 ? categoryLabel(dict, Array.from(selectedCategories)[0])
        : tr(dict.reports.categoriesOther, { count: selectedCategories.size }),
      onRemove: () => setSelectedCategories(new Set(availableCats)),
    });
  }
  if (selectedAccounts.size > 0) {
    const one = selectedAccounts.size === 1 ? accounts.find((a) => selectedAccounts.has(a.id)) : undefined;
    chips.push({
      key: 'accounts',
      label: one ? (one.last4 ? `${one.name} ····${one.last4}` : one.name) : tr(dict.reports.accountsOther, { count: selectedAccounts.size }),
      onRemove: clearAccounts,
    });
  }
  if (showTagFilter && selectedTags.size > 0) {
    chips.push({
      key: 'tags',
      label: selectedTags.size === 1 ? Array.from(selectedTags)[0] : tr(dict.reports.selectedCount, { count: selectedTags.size }),
      onRemove: () => setSelectedTags(new Set()),
    });
  }
  if (descQuery.trim()) chips.push({ key: 'find', label: `“${descQuery.trim()}”`, onRemove: () => setDescQuery('') });

  const emptyInfo: ReportEmptyInfo = {
    kind: selectedTypes.size === 0 ? 'none' : !periodOptions.hasRows ? 'period' : 'filtered',
    period: periodSummary,
    onShowBoth: () => applyTypes(new Set<ReportType>(['expense', 'income'])),
    onClearFilters: chips.length > 0 && selectedTypes.size > 0 ? clearAllFilters : null,
    onGoCurrent: awayFromCurrent ? goCurrent : null,
    onAllTime: periodGroup !== 'all' && selectedTypes.size > 0 ? () => handlePeriodGroupChange('all') : null,
  };

  // Export: exactly the rows shown, in the order shown.
  const shownRows = periodGroups.flatMap((pg) => (pg.subGroups ? pg.subGroups.flatMap((sg) => sg.items) : pg.items ?? []));
  const exportCsv = () => {
    const csv = buildReportCsv(shownRows, accounts, {
      header: ux.csvHeader, expense: ux.csvExpense, income: ux.csvIncome,
      category: (c) => categoryLabel(dict, c),
    });
    const slug = periodGroup === 'month' && bounds ? bounds.startYmd.slice(0, 7)
      : periodGroup === 'year' && bounds ? bounds.startYmd.slice(0, 4)
      : bounds ? `${bounds.startYmd}_${bounds.endYmd}` : periodGroup;
    downloadCsv(csv, `pebble-report-${slug}.csv`);
  };
  const copySummary = async () => {
    const lines = [filterSummary];
    if (mixed) {
      lines.push(tr(ux.summaryIn, { amount: formatCurrency(inSum) }), tr(ux.summaryOut, { amount: formatCurrency(outSum) }), tr(ux.summaryNet, { amount: formatCurrency(grandTotal) }));
    } else {
      lines.push(tr(ux.summaryTotal, { amount: formatCurrency(grandTotal) }));
    }
    lines.push(tr(ux.summaryCount, { count: periodFiltered.length }));
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      return true;
    } catch {
      return false;
    }
  };

  // Column-header sort: the active column flips direction, another starts
  // descending. Same two states the Sort select writes.
  const sortByColumn = (field: SortField) => {
    if (sortField === field) setSortDir((dir) => (dir === 'desc' ? 'asc' : 'desc'));
    else { setSortField(field); setSortDir('desc'); }
  };

  // Page shortcuts, with exactly AppShell's single-key guards (not while
  // typing, composing, repeating, with a modifier, or under a dialog):
  // [ ] step the period, f opens Find, e expands or collapses every group,
  // j / k move between transaction rows (Enter opens one).
  const onPageKey = useEffectEvent((e: KeyboardEvent) => {
    const k = e.key;
    if (!['[', ']', 'f', 'e', 'j', 'k'].includes(k)) return;
    if (e.isComposing || e.keyCode === 229 || e.defaultPrevented || e.repeat) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (document.querySelector('.pebble-root [role="dialog"]')) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.isContentEditable || target.closest('input, textarea, select, [contenteditable="true"], [role="combobox"]'))) return;
    if (k === '[' || k === ']') {
      const dir = k === '[' ? -1 : 1;
      if (!steppable || !canStep(dir)) return;
      e.preventDefault();
      step(dir);
    } else if (k === 'f') {
      e.preventDefault();
      setFiltersExpanded(true);
      setFindExpanded(true);
      // After the panel and section have opened (they are inert while closed,
      // and the card is visibility:hidden until the swap lands), so retry per
      // frame until the field takes focus.
      let tries = 0;
      const focusFind = () => {
        const input = document.querySelector<HTMLInputElement>('.pb-rep-find-input');
        input?.focus();
        if (document.activeElement !== input && ++tries < 12) window.requestAnimationFrame(focusFind);
      };
      window.requestAnimationFrame(() => window.requestAnimationFrame(focusFind));
    } else if (k === 'e') {
      if (categoryGroup !== 'category' || allGroupKeys.length === 0) return;
      e.preventDefault();
      handleToggleAllGroups();
    } else {
      const rows = Array.from(document.querySelectorAll<HTMLElement>('.pb-rep-results .pb-rep-row[role="button"]'))
        .filter((el) => el.offsetParent !== null && !el.closest('[inert]'));
      if (rows.length === 0) return;
      e.preventDefault();
      const i = rows.indexOf(document.activeElement as HTMLElement);
      const next = rows[i === -1 ? 0 : Math.max(0, Math.min(rows.length - 1, i + (k === 'j' ? 1 : -1)))];
      next.focus();
      next.scrollIntoView({ block: 'nearest' });
    }
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => onPageKey(e);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // The toolbar's live height, for the sticky period and day headers under
  // it. Written straight to the wrapper's style: no re-render per resize.
  const ready = restored && today !== null;
  const pageRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const bar = barRef.current;
    const page = pageRef.current;
    if (!bar || !page) return;
    const set = () => page.style.setProperty('--pb-rep-bar-h', `${bar.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(bar);
    return () => ro.disconnect();
  }, [ready]);

  // Open or close the Filters card. On a wide screen the card (or the rail,
  // whichever was hidden) takes focus after the swap, so a keyboard user is
  // not left on a control that just went invisible; elsewhere the card header
  // stays where it was and nothing moves focus.
  const railRef = useRef<HTMLButtonElement>(null);
  const toggleFilters = () => {
    const opening = !filtersExpanded;
    setFiltersExpanded(opening);
    const rail = railRef.current;
    if (!rail || rail.offsetParent === null) return;
    // The swapped-in control only becomes focusable once its visibility has
    // flipped, which can take a few frames after the commit (even with reduced
    // motion, where the change is instant but still lands on a later frame),
    // so retry per frame until it takes focus.
    const target = () => (opening ? pageRef.current?.querySelector<HTMLElement>('.pb-rep-filters > button') : rail);
    let tries = 0;
    const focusIt = () => {
      const el = target();
      el?.focus({ preventScroll: true });
      if (el && document.activeElement !== el && ++tries < 12) window.requestAnimationFrame(focusIt);
    };
    window.requestAnimationFrame(focusIt);
  };

  // First frame: the saved filters and the zone-aware date are not known yet.
  // The report's outline instead of the whole unfiltered history (which used
  // to paint and then snap to the real view).
  if (!ready) return <ReportSkeleton />;

  const heroKind = selectedTypes.size === 0 ? 'none' : mixed ? 'net' : includeExpense ? 'spent' : 'received';

  return (
    <div className="pb-rep" ref={pageRef}>
      <ReportToolbar
        ref={barRef}
        label={stepLabel.long}
        shortLabel={stepLabel.short}
        steppable={steppable}
        canPrev={steppable && canStep(-1)}
        canNext={steppable && canStep(1)}
        onPrev={() => step(-1)}
        onNext={() => step(1)}
        showCurrent={awayFromCurrent}
        onCurrent={goCurrent}
        periodGroup={periodGroup}
        onModeChange={handlePeriodGroupChange}
        showExpand={categoryGroup === 'category' && allGroupKeys.length > 0}
        anyExpanded={anyGroupsExpanded}
        onToggleAll={handleToggleAllGroups}
        onExport={exportCsv}
        canExport={shownRows.length > 0}
        onCopy={copySummary}
        copyBlocked={privacyOn}
      />

      <ReportFilterChips chips={chips} onClearAll={clearAllFilters} summary={filterSummary} />

      {/* The Filters card comes first in the DOM, so on a phone (and any
          narrow column) it sits above the summary as it always did. On a wide
          Mac the SAME grid and the SAME aside stay in place whether the card
          is open or not: open, the right-hand track is the sticky inspector;
          closed, the track narrows to a slim rail (the Filters button with
          the active count) while the report widens into the freed space. One
          track animates and nothing remounts or moves, so collapsing no
          longer throws the card above the summary and stretches everything
          in a single frame (owner-reported). */}
      <div className={`pb-rep-grid${filtersExpanded ? ' has-inspector' : ''}`}>
        <aside className="pb-rep-side-col">
          {/* Wide screens only (reports.css): the collapsed state of the card. */}
          <button
            type="button" ref={railRef} className="pb-rep-rail" onClick={() => toggleFilters()}
            aria-expanded={filtersExpanded} aria-label={chips.length > 0 ? `${dict.reports.filters} (${chips.length})` : dict.reports.filters}
          >
            <SlidersHorizontal size={18} aria-hidden="true" />
            {chips.length > 0 && <span className="pb-rep-rail-count pb-tnum" aria-hidden="true">{chips.length}</span>}
            <span className="pb-rep-rail-text" aria-hidden="true">{dict.reports.filters}</span>
          </button>
          {/* Fixed width on a wide screen, so the card never re-wraps while the
              track animates under it; it is just clipped and faded. */}
          <div className="pb-rep-side-card">
          <ReportFilters
            expanded={filtersExpanded}
            onToggleExpanded={() => toggleFilters()}
            filterSummary={filterSummary}
            selectedTypes={selectedTypes}
            onToggleType={toggleType}
            onToggleAllTypes={toggleAllTypes}
            typesExpanded={typesExpanded}
            onToggleTypesExpanded={() => setTypesExpanded((v) => !v)}
            periodGroup={periodGroup}
            onPeriodGroupChange={handlePeriodGroupChange}
            customStart={customStart}
            customEnd={customEnd}
            onCustomStartChange={setCustomStart}
            onCustomEndChange={setCustomEnd}
            customRangeInverted={customRangeInverted}
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
            periodAccounts={periodAccounts}
            periodHasRows={periodOptions.hasRows}
            selectedAccounts={selectedAccounts}
            onToggleAccount={toggleAccount}
            onClearAccounts={clearAccounts}
            accountsExpanded={accountsExpanded}
            onToggleAccountsExpanded={() => setAccountsExpanded((v) => !v)}
            periodCategories={periodCategories}
            selectedCategories={selectedCategories}
            allSelected={allSelected}
            onToggleCategory={toggleCategory}
            onToggleAllCategories={() => setSelectedCategories(allSelected ? new Set() : new Set(availableCats))}
            categoriesExpanded={categoriesExpanded}
            onToggleCategoriesExpanded={() => setCategoriesExpanded((v) => !v)}
            periodSummary={periodSummary}
            periodExpanded={periodExpanded}
            onTogglePeriodExpanded={() => setPeriodExpanded((v) => !v)}
            groupSortExpanded={groupSortExpanded}
            onToggleGroupSortExpanded={() => setGroupSortExpanded((v) => !v)}
            findExpanded={findExpanded}
            onToggleFindExpanded={() => setFindExpanded((v) => !v)}
            showTagFilter={showTagFilter}
            singleSelectedCategory={singleSelectedCategory}
            availableTags={availableTags}
            selectedTags={selectedTags}
            onToggleTag={toggleTag}
            onClearTags={() => setSelectedTags(new Set())}
          />
          <p className="pb-rep-keys" aria-hidden="true">{ux.shortcutsHint}</p>
          </div>
        </aside>

        {/* Keyed on the period: a period change cross-fades the content
            rather than swapping every card in one frame. */}
        <div className="pb-rep-main pb-rep-swap" key={periodKey}>
          {periodFiltered.length > 0 && (
            <ReportSummary
              eyebrow={periodSummary}
              kind={heroKind}
              total={grandTotal}
              accent={accent}
              count={periodFiltered.length}
              inSum={inSum}
              outSum={outSum}
              mixed={mixed}
              delta={delta}
              shares={shares.length > 1 || isolated ? shares : []}
              shareSide={mainSide}
              isolated={isolated}
              onIsolate={isolateCategory}
              dailyAverage={dailyAverage}
              largest={largest}
              topCategory={ranked.length > 1 ? { key: ranked[0][0], value: ranked[0][1] } : null}
              categoryMeta={categoryMeta}
              onOpenDetail={setSelectedTransaction}
              showChartToggle={!!timeline && timeline.buckets.length > 1}
              chartHidden={chartHidden}
              onToggleChart={() => setChartHidden((v) => !v)}
              timeline={timeline && timeline.buckets.length > 1 ? (
                <ReportTimeline
                  key={`${periodKey}-${timelineMode}`}
                  buckets={timeline.buckets}
                  granularity={timeline.granularity}
                  mode={timelineMode}
                  label={tr(ux.chartLabel, {
                    type: typePart,
                    granularity: timeline.granularity === 'day' ? ux.byDay : timeline.granularity === 'week' ? ux.byWeek : ux.byMonth,
                    period: periodSummary,
                  })}
                />
              ) : null}
            />
          )}

          <ReportResults
            periodGroups={periodGroups}
            periodFilteredCount={periodFiltered.length}
            tinted={mixed}
            categoryGroup={categoryGroup}
            showPeriodHeaders={showPeriodHeaders}
            expandedCategoryGroups={expandedCategoryGroups}
            onToggleCategoryGroup={toggleCategoryGroupExpanded}
            categoryMeta={categoryMeta}
            onOpenDetail={setSelectedTransaction}
            sortField={sortField}
            sortDir={sortDir}
            onSort={sortByColumn}
            series={series}
            empty={emptyInfo}
          />
        </div>
      </div>

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
