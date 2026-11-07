'use client';

import { useId, useLayoutEffect, useRef, useState } from 'react';
import { ChevronRight, Search, X } from 'lucide-react';
import type { Account } from '@/lib/data/mappers';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { categoryLabel, periodValueLabel } from '@/lib/i18n/enumLabels';
import type { ReportType, PeriodGroup, CategoryGroupMode, SortDir, SortField } from './types';

// Layout of the panel: a card title and summary, then a grouped list - one row
// per filter group, divided by hairlines (the same border-top divider
// .card .stat-tabs uses), title on the left and the current value, as a chip,
// on the right. Each row opens to its controls below.

// Same timing as .collapsible-rows, so the chevron and the slide finish
// together. That class lives in globals.css (shared), so it is matched here
// rather than retimed there; the report's category rows match it too.
const chevronTransition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';

// Matches the compact selects on the dashboard charts.
const filterSelectStyle: React.CSSProperties = {
  width: '100%', fontSize: '0.83rem', padding: '0.45rem 0.6rem',
  borderRadius: '0.6rem', border: '1px solid var(--line)',
  color: 'var(--ink)', backgroundColor: 'var(--paper)', boxSizing: 'border-box',
};
// flex: 1 1 150px - a row of fields spreads across the available width and
// wraps only when they genuinely cannot fit, not at a fixed breakpoint.
const filterFieldStyle: React.CSSProperties = { flex: '1 1 150px', minWidth: 0 };
const fieldRowStyle: React.CSSProperties = { display: 'flex', gap: '0.85rem', flexWrap: 'wrap' };
const pillRowStyle: React.CSSProperties = { display: 'flex', gap: '0.5rem', flexWrap: 'wrap' };
const emptyLineStyle: React.CSSProperties = { margin: 0, fontSize: '0.83rem', color: 'var(--ink-soft)' };
// Field labels inside the panel: sentence case and soft, one step below the
// row titles. Local on purpose - the global .filter-label is used elsewhere.
const fieldLabelStyle: React.CSSProperties = {
  margin: '0 0 0.4rem', fontSize: '0.75rem', fontWeight: 500, color: 'var(--ink-soft)',
};
// A chosen value shown in a row: a grey-tinted rectangle, so it reads as a
// selection rather than a label. The tint is a mix of ink, as .pb-wk-name does,
// so it follows every theme and dark mode. Soft text, so the row title stays
// the dominant element. Truncates on one line.
const chipStyle: React.CSSProperties = {
  minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  padding: '0.15rem 0.55rem', borderRadius: 6,
  background: 'color-mix(in srgb, var(--ink) 8%, transparent)',
  fontSize: '0.78rem', fontWeight: 500, color: 'var(--ink-soft)',
};
// A section that is narrowing the report: a pine-tinted chip led by a pine
// dot, so "this one is on" is not told by colour alone and the default "All"
// chips stay quiet beside it.
const activeChipStyle: React.CSSProperties = {
  ...chipStyle,
  display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
  background: 'color-mix(in srgb, var(--pine) 13%, transparent)', color: 'var(--ink)', fontWeight: 600,
};
const activeDotStyle: React.CSSProperties = { width: 6, height: 6, borderRadius: '50%', background: 'var(--pine)', flexShrink: 0 };
// The chip text truncates on its own element, so the AppShell tooltip still
// finds the ellipsis when the chip has a dot.
const chipTextStyle: React.CSSProperties = { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

// One row of the grouped list. 4px of side padding on the button and the
// content keeps titles aligned with the controls below them, and gives focus
// rings room inside .collapsible-rows-inner's overflow: hidden.
function FilterSection({ id, name, summary, open, onToggle, children, active = false }: {
  id: string;
  name: string;
  /** One chip per entry; empty strings are skipped. */
  summary: string | string[];
  open: boolean;
  /** The section narrows the report (not at its default). */
  active?: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div style={{ borderTop: '1px solid var(--line)' }}>
      <button
        type="button" onClick={onToggle} aria-expanded={open} aria-controls={id}
        style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%', minHeight: 44, padding: '0.6rem 4px', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', color: 'var(--ink)' }}
      >
        <span style={{ flexShrink: 0, fontSize: '0.88rem', fontWeight: 600 }}>{name}</span>
        {/* Always shown, open or closed, so toggling never changes the text.
            Each value is a chip; a chip truncates, so a long one cannot wrap
            the row. */}
        <span className="pb-rep-fs-chips" style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'flex-end', gap: '0.4rem', overflow: 'hidden' }}>
          {(Array.isArray(summary) ? summary : [summary]).filter(Boolean).map((chip, i) => (
            active ? (
              <span key={i} style={activeChipStyle}>
                <span style={activeDotStyle} aria-hidden="true" />
                <span style={chipTextStyle}>{chip}</span>
              </span>
            ) : (
              <span key={i} style={chipStyle}>{chip}</span>
            )
          ))}
        </span>
        <ChevronRight
          size={16} aria-hidden="true"
          style={{ color: 'var(--ink-soft)', flexShrink: 0, transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: chevronTransition }}
        />
      </button>
      {/* inert while closed: the 0fr grid only hides it visually, and Tab
          used to walk into invisible selects and pills. */}
      <div id={id} className={`collapsible-rows ${open ? 'expanded' : ''}`} inert={!open}>
        <div className="collapsible-rows-inner">
          <div style={{ padding: '0.2rem 4px 1rem' }}>{children}</div>
        </div>
      </div>
    </div>
  );
}

interface ReportFiltersProps {
  expanded: boolean;
  onToggleExpanded: () => void;
  filterSummary: string;

  /** Explicit set, like the category selection: both is ALL, empty is nothing. */
  selectedTypes: Set<ReportType>;
  onToggleType: (t: ReportType) => void;
  onToggleAllTypes: () => void;
  typesExpanded: boolean;
  onToggleTypesExpanded: () => void;

  periodGroup: PeriodGroup;
  onPeriodGroupChange: (mode: PeriodGroup) => void;
  /** The resolved period, as the outer summary shows it. */
  periodSummary: string;
  periodExpanded: boolean;
  onTogglePeriodExpanded: () => void;

  /** 'YYYY-MM-DD' or '' for an open end. Shown only for periodGroup 'custom'. */
  customStart: string;
  customEnd: string;
  onCustomStartChange: (v: string) => void;
  onCustomEndChange: (v: string) => void;
  customRangeInverted: boolean;

  subPeriod: string;
  onSubPeriodChange: (v: string) => void;
  subPeriodOptions: string[] | null;
  subPeriodLabel: string;

  subYear: string;
  onSubYearChange: (v: string) => void;
  yearOptions: string[];
  showYearSelector: boolean;

  categoryGroup: CategoryGroupMode;
  onCategoryGroupChange: (v: CategoryGroupMode) => void;

  sortDir: SortDir;
  onSortDirChange: (v: SortDir) => void;

  sortField: SortField;
  onSortFieldChange: (v: SortField) => void;

  groupSortExpanded: boolean;
  onToggleGroupSortExpanded: () => void;

  descQuery: string;
  onDescQueryChange: (v: string) => void;
  findExpanded: boolean;
  onToggleFindExpanded: () => void;

  accounts: Account[];
  /** Accounts offered: those with rows in the period, plus any still selected. */
  periodAccounts: Account[];
  /** False when the period has no rows of the current type(s) at all. */
  periodHasRows: boolean;
  /** Empty means ALL - see the note on the state in ReportsClient. */
  selectedAccounts: Set<string>;
  onToggleAccount: (id: string) => void;
  onClearAccounts: () => void;
  accountsExpanded: boolean;
  onToggleAccountsExpanded: () => void;

  /** Categories offered: those with rows in the period, plus any still selected once narrowed. */
  periodCategories: string[];
  selectedCategories: Set<string>;
  allSelected: boolean;
  onToggleCategory: (cat: string) => void;
  onToggleAllCategories: () => void;
  categoriesExpanded: boolean;
  onToggleCategoriesExpanded: () => void;

  showTagFilter: boolean;
  singleSelectedCategory: string | null;
  availableTags: string[];
  selectedTags: Set<string>;
  onToggleTag: (tag: string) => void;
  onClearTags: () => void;
}

export function ReportFilters({
  expanded, onToggleExpanded, filterSummary,
  selectedTypes, onToggleType, onToggleAllTypes, typesExpanded, onToggleTypesExpanded,
  periodGroup, onPeriodGroupChange, periodSummary, periodExpanded, onTogglePeriodExpanded,
  customStart, customEnd, onCustomStartChange, onCustomEndChange, customRangeInverted,
  subPeriod, onSubPeriodChange, subPeriodOptions, subPeriodLabel,
  subYear, onSubYearChange, yearOptions, showYearSelector,
  categoryGroup, onCategoryGroupChange,
  sortDir, onSortDirChange,
  sortField, onSortFieldChange,
  groupSortExpanded, onToggleGroupSortExpanded,
  descQuery, onDescQueryChange, findExpanded, onToggleFindExpanded,
  accounts, periodAccounts, periodHasRows, selectedAccounts, onToggleAccount, onClearAccounts,
  accountsExpanded, onToggleAccountsExpanded,
  periodCategories, selectedCategories, allSelected, onToggleCategory, onToggleAllCategories,
  categoriesExpanded, onToggleCategoriesExpanded,
  showTagFilter, singleSelectedCategory, availableTags, selectedTags, onToggleTag, onClearTags,
}: ReportFiltersProps) {
  // dict/tr, not d/t: `t` and `d` are used as closure parameters below.
  const { d: dict, t: tr } = useTranslation();
  const uid = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const card = cardRef.current;
    const root = card?.closest('.pebble-root');
    if (!card || !root) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const bottomNav = root.querySelector('.pebble-bottom-nav')?.getBoundingClientRect().height ?? 0;
      const room = Math.max(0, window.innerHeight - bottomNav - card.getBoundingClientRect().top);
      // Before sticking, the card also sits below the main padding/chips.
      // Keep a little air below it unless the window is exceptionally short.
      const gap = Math.min(16, Math.max(0, room - 48));
      card.style.setProperty('--pb-rep-filter-available', `${Math.max(0, room - gap)}px`);
    };
    const queue = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(queue);
    observer.observe(root);
    const page = card.closest('.pb-rep');
    // The first active chip mounts after this effect; watching the page also
    // catches that insertion/removal and later chip wrapping above the card.
    if (page) observer.observe(page);
    for (const selector of ['.pebble-header', '.pb-rep-bar', '.pb-rep-chips', '.pebble-bottom-nav']) {
      const element = root.querySelector(selector);
      if (element) observer.observe(element);
    }
    root.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', queue);
    measure();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      root.removeEventListener('scroll', queue);
      window.removeEventListener('resize', queue);
    };
  }, []);
  // Sub-category appears only while exactly one category is selected, so it
  // opens by default and is not persisted - there is nothing to restore.
  const [tagsExpanded, setTagsExpanded] = useState(true);

  // Accounts stays visible whenever there is a choice of accounts: a group
  // that comes and goes as the period changes reads as a bug. Its LIST still
  // narrows to the period. Categories hide at one option or fewer unless
  // narrowed; they start fully selected, so only a narrowed set is "active".
  const accountsActive = selectedAccounts.size > 0;
  const showAccounts = accounts.length > 1;
  const accountsEmpty = periodAccounts.length === 0 && !accountsActive;
  const categoriesActive = !allSelected;
  const showCategories = categoriesActive || periodCategories.length > 1 || !periodHasRows;
  const categoriesEmpty = periodCategories.length === 0 && !categoriesActive;

  // Row values. Account labels follow the shape every other account picker
  // uses; the single-account lookup uses the FULL list so a selected account
  // with no rows in this period is still named. Names are never translated.
  const onlyAccount = selectedAccounts.size === 1 ? accounts.find((a) => selectedAccounts.has(a.id)) : undefined;
  const typesSummary =
    selectedTypes.size === 2 ? dict.reports.all
    : selectedTypes.size === 0 ? dict.reports.noneSelected
    : selectedTypes.has('expense') ? dict.reports.expenses : dict.reports.income;
  const accountsSummary =
    selectedAccounts.size === 0 ? dict.reports.all
    : onlyAccount ? (onlyAccount.last4 ? `${onlyAccount.name} ····${onlyAccount.last4}` : onlyAccount.name)
    : tr(dict.reports.selectedCount, { count: selectedAccounts.size });
  const categoriesSummary =
    allSelected ? dict.reports.all
    : selectedCategories.size === 0 ? dict.reports.noneSelected
    : selectedCategories.size === 1 ? categoryLabel(dict, Array.from(selectedCategories)[0])
    : tr(dict.reports.selectedCount, { count: selectedCategories.size });
  const sortLabel = sortField === 'amount'
    ? (sortDir === 'desc' ? dict.reports.sortHighest : dict.reports.sortLowest)
    : (sortDir === 'desc' ? dict.reports.sortNewest : dict.reports.sortOldest);
  const groupSortSummary = [
    `${categoryGroup === 'category' ? dict.reports.groupCategory : dict.reports.groupNone}`,
    sortLabel,
  ];
  // An active search shows in its row, so a closed row can never reduce
  // totals without a visible reason.
  const findQuery = descQuery.trim();
  const findSummary = findQuery ? `“${findQuery}”` : '';
  const tagsSummary =
    selectedTags.size === 0 ? dict.reports.all
    : selectedTags.size === 1 ? Array.from(selectedTags)[0]
    : tr(dict.reports.selectedCount, { count: selectedTags.size });

  const panelId = `${uid}-panel`;

  return (
    <div ref={cardRef} className="card pb-rep-filters" style={{ display: 'flex', flexDirection: 'column' }}>
      <button
        type="button" onClick={onToggleExpanded} aria-expanded={expanded} aria-controls={panelId}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', width: '100%', background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', color: 'var(--ink)' }}
      >
        {/* Card title style (dashboard cards: 0.95rem / 600). A span, not an
            h3, because a heading is not allowed inside a button. */}
        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span style={{ fontSize: '0.95rem', fontWeight: 600 }}>{dict.reports.filters}</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 3 }}>
            {filterSummary}
          </span>
        </span>
        <ChevronRight
          size={18} aria-hidden="true"
          style={{ color: 'var(--ink-soft)', flexShrink: 0, transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: chevronTransition }}
        />
      </button>

      <div id={panelId} className={`collapsible-rows pb-rep-filter-panel ${expanded ? 'expanded' : ''}`} inert={!expanded}>
        <div className="collapsible-rows-inner">
          {/* 4px of side and bottom padding so focus rings are not clipped by
              .collapsible-rows-inner's overflow: hidden (a 2px outline at a 2px
              offset). Set here because that class is shared elsewhere. */}
          <div className="pb-rep-filter-scroll" style={{ display: 'flex', flexDirection: 'column', padding: '1.15rem 4px 4px' }}>
            {/* An explicit selection, like Categories: All is both types, and
                clicking All while it is lit clears everything. From All, a click
                on one type isolates it. Values are the stored ReportType
                literals; only the text is translated. */}
            <FilterSection
              id={`${uid}-types`} name={dict.reports.transactionType} summary={typesSummary}
              open={typesExpanded} onToggle={onToggleTypesExpanded} active={selectedTypes.size !== 2}
            >
              <div style={pillRowStyle}>
                <button onClick={onToggleAllTypes} aria-pressed={selectedTypes.size === 2} className={`pill ${selectedTypes.size === 2 ? 'active' : ''}`}>{dict.reports.all}</button>
                {(['expense', 'income'] as const).map((k) => (
                  <button key={k} onClick={() => onToggleType(k)} aria-pressed={selectedTypes.has(k)} className={`pill ${selectedTypes.has(k) ? 'active' : ''}`}>
                    {k === 'expense' ? dict.reports.expenses : dict.reports.income}
                  </button>
                ))}
              </div>
            </FilterSection>

            {/* Selects rather than pill rows: a month picker is 13 pills and the
                year list grows every January, while a select is fixed-height. */}
            <FilterSection
              id={`${uid}-period`} name={dict.reports.timePeriod} summary={periodSummary}
              open={periodExpanded} onToggle={onTogglePeriodExpanded}
            >
              <div style={fieldRowStyle}>
                <div style={filterFieldStyle}>
                  <p style={fieldLabelStyle}>{dict.reports.periodType}</p>
                  <select
                    value={periodGroup}
                    onChange={(e) => onPeriodGroupChange(e.target.value as PeriodGroup)}
                    style={filterSelectStyle}
                  >
                    {/* values are the stored PeriodGroup union members. */}
                    <option value="month">{dict.reports.month}</option>
                    <option value="quarter">{dict.reports.quarter}</option>
                    <option value="year">{dict.reports.year}</option>
                    <option value="all">{dict.reports.allTime}</option>
                    <option value="last3">{dict.reports.last3}</option>
                    <option value="last6">{dict.reports.last6}</option>
                    <option value="last12">{dict.reports.last12}</option>
                    <option value="custom">{dict.reports.custom}</option>
                  </select>
                </div>

                {/* Only for Custom range. Native date inputs: the value is always
                    'YYYY-MM-DD', the picker localizes itself, and min/max keep it
                    from offering an inverted pair. A typed inverted pair is still
                    possible, hence the message. */}
                {periodGroup === 'custom' && (
                  <>
                    <div style={filterFieldStyle}>
                      <p style={fieldLabelStyle}>{dict.reports.customFrom}</p>
                      <input
                        type="date" value={customStart} max={customEnd || undefined}
                        onChange={(e) => onCustomStartChange(e.target.value)}
                        aria-invalid={customRangeInverted || undefined}
                        style={{ ...filterSelectStyle, ...(customRangeInverted ? { border: '1px solid var(--wine)' } : {}) }}
                      />
                    </div>
                    <div style={filterFieldStyle}>
                      <p style={fieldLabelStyle}>{dict.reports.customTo}</p>
                      <input
                        type="date" value={customEnd} min={customStart || undefined}
                        onChange={(e) => onCustomEndChange(e.target.value)}
                        aria-invalid={customRangeInverted || undefined}
                        style={{ ...filterSelectStyle, ...(customRangeInverted ? { border: '1px solid var(--wine)' } : {}) }}
                      />
                    </div>
                    {customRangeInverted && (
                      <p style={{ flexBasis: '100%', margin: 0, fontSize: '0.75rem', color: 'var(--wine)', lineHeight: 1.45 }}>
                        {dict.reports.customInvalid}
                      </p>
                    )}
                  </>
                )}

                {subPeriodOptions && (
                  <div style={filterFieldStyle}>
                    <p style={fieldLabelStyle}>{subPeriodLabel}</p>
                    <select value={subPeriod} onChange={(e) => onSubPeriodChange(e.target.value)} style={filterSelectStyle}>
                      {/* No "All" option: Month/Quarter/Year always shows exactly
                          one period, defaulting to the current one - see
                          effectiveSubPeriod in ReportsClient.tsx. Each option's
                          VALUE is the MONTH_NAMES / QUARTER_NAMES string that is
                          persisted and compared; only the text is translated. */}
                      {subPeriodOptions.map((opt) => <option key={opt} value={opt}>{periodValueLabel(dict, opt)}</option>)}
                    </select>
                  </div>
                )}

                {showYearSelector && (
                  <div style={filterFieldStyle}>
                    <p style={fieldLabelStyle}>{dict.reports.whichYear}</p>
                    <select value={subYear} onChange={(e) => onSubYearChange(e.target.value)} style={filterSelectStyle}>
                      <option value="All">{dict.reports.allYears}</option>
                      {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </FilterSection>

            <FilterSection
              id={`${uid}-groupsort`} name={dict.reports.groupAndSort} summary={groupSortSummary}
              open={groupSortExpanded} onToggle={onToggleGroupSortExpanded}
            >
              <div style={fieldRowStyle}>
                <div style={filterFieldStyle}>
                  <p style={fieldLabelStyle}>{dict.reports.groupBy}</p>
                  <select
                    value={categoryGroup}
                    onChange={(e) => onCategoryGroupChange(e.target.value as CategoryGroupMode)}
                    style={filterSelectStyle}
                  >
                    <option value="category">{dict.reports.groupCategory}</option>
                    <option value="none">{dict.reports.groupNone}</option>
                  </select>
                </div>

                {/* Field and direction are one control because they read as one
                    choice ("Newest first"), while staying two pieces of state so
                    the group and row comparators can share a direction. */}
                <div style={filterFieldStyle}>
                  <p style={fieldLabelStyle}>{dict.reports.sort}</p>
                  <select
                    value={`${sortField}-${sortDir}`}
                    onChange={(e) => {
                      const [f, d] = e.target.value.split('-') as [SortField, SortDir];
                      onSortFieldChange(f);
                      onSortDirChange(d);
                    }}
                    style={filterSelectStyle}
                  >
                    {/* value encodes `${sortField}-${sortDir}` and is split
                        back apart above - never translated. */}
                    <option value="amount-desc">{dict.reports.sortHighest}</option>
                    <option value="amount-asc">{dict.reports.sortLowest}</option>
                    <option value="date-desc">{dict.reports.sortNewest}</option>
                    <option value="date-asc">{dict.reports.sortOldest}</option>
                  </select>
                </div>
              </div>
            </FilterSection>

            <FilterSection
              id={`${uid}-find`} name={dict.reports.find} summary={findSummary}
              open={findExpanded} onToggle={onToggleFindExpanded} active={findQuery !== ''}
            >
              <div style={{ position: 'relative' }}>
                <Search size={15} aria-hidden="true" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-soft)' }} />
                {/* pb-rep-find-input: the page's 'f' shortcut focuses it. */}
                <input
                  value={descQuery} onChange={(e) => onDescQueryChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape' && descQuery !== '' && !e.nativeEvent.isComposing) { e.preventDefault(); onDescQueryChange(''); }
                  }}
                  className="pb-rep-find-input"
                  placeholder={dict.reports.descriptionPlaceholder} aria-label={dict.reports.find}
                  style={{ width: '100%', padding: '0.55rem 2.6rem 0.55rem 2.1rem', borderRadius: '0.7rem', border: '1px solid var(--line)', fontSize: '0.83rem', color: 'var(--ink)', backgroundColor: 'var(--paper)', boxSizing: 'border-box' }}
                />
                {/* Clears the text only, like the Transactions search. */}
                {descQuery !== '' && (
                  <button
                    type="button" className="icon-btn pb-rep-find-clear" aria-label={dict.txnSearch.clear} title={dict.txnSearch.clear}
                    onClick={(e) => { onDescQueryChange(''); (e.currentTarget.previousElementSibling as HTMLElement | null)?.focus(); }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </FilterSection>

            {/* Accounts above categories: an account is the broader cut, and
                "these accounts, then these categories" matches how the filter
                narrows. Hibernated accounts appear too - Reports covers history. */}
            {showAccounts && (
              <FilterSection
                id={`${uid}-accounts`} name={dict.reports.onlyAccounts} summary={accountsSummary}
                open={accountsExpanded} onToggle={onToggleAccountsExpanded} active={accountsActive}
              >
                {accountsEmpty ? (
                  <p style={emptyLineStyle}>{dict.reports.noRecordsInPeriod}</p>
                ) : (
                  <div style={pillRowStyle}>
                    <button onClick={onClearAccounts} aria-pressed={selectedAccounts.size === 0} className={`pill ${selectedAccounts.size === 0 ? 'active' : ''}`}>{dict.reports.all}</button>
                    {periodAccounts.map((a) => (
                      <button key={a.id} onClick={() => onToggleAccount(a.id)} aria-pressed={selectedAccounts.has(a.id)} className={`pill ${selectedAccounts.has(a.id) ? 'active' : ''}`}>
                        {a.name}
                      </button>
                    ))}
                  </div>
                )}
              </FilterSection>
            )}

            {showCategories && (
              <FilterSection
                id={`${uid}-categories`} name={dict.reports.categoriesLabel} summary={categoriesSummary}
                open={categoriesExpanded} onToggle={onToggleCategoriesExpanded} active={categoriesActive}
              >
                {categoriesEmpty ? (
                  <p style={emptyLineStyle}>{dict.reports.noRecordsInPeriod}</p>
                ) : (
                  <div style={pillRowStyle}>
                    <button onClick={onToggleAllCategories} aria-pressed={allSelected} className={`pill ${allSelected ? 'active' : ''}`}>{dict.reports.all}</button>
                    {/* c is the stored category name - the React key, the toggle
                        argument and the filter all use it untranslated. Only the
                        two income literals get a label; user categories pass
                        through categoryLabel unchanged. */}
                    {periodCategories.map((c) => (
                      <button key={c} onClick={() => onToggleCategory(c)} aria-pressed={selectedCategories.has(c)} className={`pill ${selectedCategories.has(c) ? 'active' : ''}`}>{categoryLabel(dict, c)}</button>
                    ))}
                  </div>
                )}
              </FilterSection>
            )}

            {showTagFilter && availableTags.length > 0 && (
              <FilterSection
                id={`${uid}-tags`}
                name={tr(dict.reports.subCategoryOf, { category: categoryLabel(dict, singleSelectedCategory ?? '') })}
                summary={tagsSummary}
                open={tagsExpanded} onToggle={() => setTagsExpanded((v) => !v)} active={selectedTags.size > 0}
              >
                <div style={pillRowStyle}>
                  <button onClick={onClearTags} aria-pressed={selectedTags.size === 0} className={`pill ${selectedTags.size === 0 ? 'active' : ''}`}>{dict.reports.all}</button>
                  {availableTags.map((tag) => (
                    <button key={tag} onClick={() => onToggleTag(tag)} aria-pressed={selectedTags.has(tag)} className={`pill ${selectedTags.has(tag) ? 'active' : ''}`}>{tag}</button>
                  ))}
                </div>
              </FilterSection>
            )}
          </div>
        </div>
      </div>
      <p className="pb-rep-keys" aria-hidden="true">{dict.ux.reports.shortcutsHint}</p>
    </div>
  );
}
