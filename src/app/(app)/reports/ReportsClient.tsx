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
    });
  }, [restored, selectedTypes, periodGroup, subYear, subPeriod, categoryGroup, sortField, sortDir,
      filtersExpanded, groupsExpanded, customStart, customEnd, accountsExpanded, categoriesExpanded,
      periodExpanded, groupSortExpanded, findExpanded, typesExpanded]);

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
  // Income always comes before expenses inside each period, whatever the sort
  // or the grouping: with category groups the income categories lead, and with
  // no grouping the income rows lead. Only the order BETWEEN the two kinds is
  // fixed; the chosen sort still orders everything within each kind. Periods
  // themselves keep the chosen order, so a month never jumps ahead of another.
  const catRank = (cat: string) => (incomeCats.includes(cat) ? 0 : 1);
  const typeRank = (t: Transaction) => (isExpense(t) ? 1 : 0);
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
      return { key, label: v.label, sortKey: v.sortKey, total, items: [...v.items].sort((a, b) => (typeRank(a) - typeRank(b)) || sortFn(a, b)) };
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <ReportFilters
        expanded={filtersExpanded}
        onToggleExpanded={() => setFiltersExpanded((v) => !v)}
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

      <ReportResults
        periodGroups={periodGroups}
        periodFilteredCount={periodFiltered.length}
        grandTotal={grandTotal}
        accent={accent}
        tinted={mixed}
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
