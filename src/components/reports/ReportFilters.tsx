'use client';

import { ChevronRight, Search } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { categoryLabel, periodValueLabel } from '@/lib/i18n/enumLabels';

// Matches the compact selects on the dashboard charts. Grows to fill its
// track so a row of filters spreads across the available width instead of
// leaving it empty.
const filterSelectStyle: React.CSSProperties = {
  width: '100%', fontSize: '0.83rem', padding: '0.45rem 0.6rem',
  borderRadius: '0.6rem', border: '1px solid var(--line)',
  color: 'var(--ink)', backgroundColor: 'var(--paper)', boxSizing: 'border-box',
};
const filterFieldStyle: React.CSSProperties = { flex: '1 1 150px', minWidth: 0 };
import type { ReportType, PeriodGroup, CategoryGroupMode, SortDir, SortField } from './types';

interface ReportFiltersProps {
  expanded: boolean;
  onToggleExpanded: () => void;
  filterSummary: string;

  reportType: ReportType;
  onTypeChange: (t: ReportType) => void;

  periodGroup: PeriodGroup;
  onPeriodGroupChange: (mode: PeriodGroup) => void;

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

  descQuery: string;
  onDescQueryChange: (v: string) => void;

  availableCats: string[];
  selectedCategories: Set<string>;
  allSelected: boolean;
  onToggleCategory: (cat: string) => void;
  onToggleAllCategories: () => void;

  showTagFilter: boolean;
  singleSelectedCategory: string | null;
  availableTags: string[];
  selectedTags: Set<string>;
  onToggleTag: (tag: string) => void;
  onClearTags: () => void;
}

export function ReportFilters({
  expanded, onToggleExpanded, filterSummary,
  reportType, onTypeChange,
  periodGroup, onPeriodGroupChange,
  subPeriod, onSubPeriodChange, subPeriodOptions, subPeriodLabel,
  subYear, onSubYearChange, yearOptions, showYearSelector,
  categoryGroup, onCategoryGroupChange,
  sortDir, onSortDirChange,
  sortField, onSortFieldChange,
  descQuery, onDescQueryChange,
  availableCats, selectedCategories, allSelected, onToggleCategory, onToggleAllCategories,
  showTagFilter, singleSelectedCategory, availableTags, selectedTags, onToggleTag, onClearTags,
}: ReportFiltersProps) {
  // dict/tr, not d/t: `t` is the map parameter for a report type below.
  const { d: dict, t: tr } = useTranslation();
  return (
    <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
      <button
        onClick={onToggleExpanded}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', width: '100%', background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', color: 'var(--ink)' }}
      >
        <div style={{ minWidth: 0 }}>
          <p className="filter-label" style={{ margin: 0 }}>{dict.reports.filters}</p>
          <p style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
            {filterSummary}
          </p>
        </div>
        <ChevronRight
          size={18}
          style={{ color: 'var(--ink-soft)', flexShrink: 0, transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
        />
      </button>

      <div className={`collapsible-rows ${expanded ? 'expanded' : ''}`}>
        <div className="collapsible-rows-inner">
          {/* 4px of horizontal and bottom padding, not for visual spacing but so
              focus rings have room to draw. .collapsible-rows-inner sets
              overflow: hidden - required for the 0fr/1fr grid animation - and the
              focus ring is a 2px outline at a 2px offset, so any control touching
              the container edge lost its ring on that side. The leftmost and
              rightmost selects in the filter row were the visible casualties.
              Applied here rather than on .collapsible-rows-inner because that
              class is shared with the report's category groups and the settings
              delete dialog. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem', padding: '1.15rem 4px 4px' }}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {(['expense', 'income'] as const).map((t) => (
                <button
                  key={t} onClick={() => onTypeChange(t)} className={`pill ${reportType === t ? 'active' : ''}`}
                  style={{ flex: 1, padding: '0.62rem', fontWeight: 600 }}
                >
                  {t === 'expense' ? dict.reports.expenses : dict.reports.income}
                </button>
              ))}
            </div>

            {/* One wrapping row of equal-width selects rather than five stacked
                blocks of pills. Pill rows grew with the data - a month picker is
                13 pills and the year list gains one every January - so the panel
                got taller the longer the app was used. A select is a fixed-height
                control whatever its option count.
                Each field is flex: 1 1 150px, so they spread across the available
                width and drop to another line only when they genuinely cannot
                fit, rather than at a fixed breakpoint. */}
            <div style={{ display: 'flex', gap: '0.85rem', flexWrap: 'wrap' }}>
              <div style={filterFieldStyle}>
                <p className="filter-label">{dict.reports.timePeriod}</p>
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
                </select>
              </div>

              {showYearSelector && (
                <div style={filterFieldStyle}>
                  <p className="filter-label">{dict.reports.whichYear}</p>
                  <select value={subYear} onChange={(e) => onSubYearChange(e.target.value)} style={filterSelectStyle}>
                    <option value="All">{dict.reports.allYears}</option>
                    {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              )}

              {subPeriodOptions && (
                <div style={filterFieldStyle}>
                  <p className="filter-label">{subPeriodLabel}</p>
                  <select value={subPeriod} onChange={(e) => onSubPeriodChange(e.target.value)} style={filterSelectStyle}>
                    {/* Was `All {periodGroup}s` - English pluralising the raw
                        mode value. One key per mode instead.
                        Each option's VALUE is the MONTH_NAMES / QUARTER_NAMES
                        string that gets persisted and compared; only the text
                        is translated, and a year number falls through. */}
                    <option value="All">
                      {periodGroup === 'month' ? dict.reports.allMonths
                        : periodGroup === 'quarter' ? dict.reports.allQuarters
                        : dict.reports.allYears}
                    </option>
                    {subPeriodOptions.map((opt) => <option key={opt} value={opt}>{periodValueLabel(dict, opt)}</option>)}
                  </select>
                </div>
              )}

              <div style={filterFieldStyle}>
                <p className="filter-label">{dict.reports.groupBy}</p>
                <select
                  value={categoryGroup}
                  onChange={(e) => onCategoryGroupChange(e.target.value as CategoryGroupMode)}
                  style={filterSelectStyle}
                >
                  <option value="category">{dict.reports.groupCategory}</option>
                  <option value="none">{dict.reports.groupNone}</option>
                </select>
              </div>

              {/* Field and direction are one control here because they read as one
                  choice ("Newest first"), while staying two pieces of state so the
                  group and row comparators can share a direction. */}
              <div style={filterFieldStyle}>
                <p className="filter-label">{dict.reports.sort}</p>
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

            <div>
              <p className="filter-label">{dict.reports.description}</p>
              <div style={{ position: 'relative', maxWidth: 320 }}>
                <Search size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-soft)' }} />
                <input
                  value={descQuery} onChange={(e) => onDescQueryChange(e.target.value)} placeholder={dict.reports.descriptionPlaceholder}
                  style={{ width: '100%', padding: '0.55rem 0.75rem 0.55rem 2.1rem', borderRadius: '0.7rem', border: '1px solid var(--line)', fontSize: '0.83rem', color: 'var(--ink)', backgroundColor: 'var(--paper)', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div>
              <p className="filter-label">{dict.reports.onlyCategories}</p>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button onClick={onToggleAllCategories} className={`pill ${allSelected ? 'active' : ''}`}>{dict.reports.all}</button>
                {/* c is the stored category name - the React key, the toggle
                    argument and the filter all use it untranslated. Only the
                    two income literals get a label; user categories pass
                    through categoryLabel unchanged. */}
                {availableCats.map((c) => (
                  <button key={c} onClick={() => onToggleCategory(c)} className={`pill ${selectedCategories.has(c) ? 'active' : ''}`}>{categoryLabel(dict, c)}</button>
                ))}
              </div>
            </div>

            {showTagFilter && availableTags.length > 0 && (
              <div>
                <p className="filter-label">{tr(dict.reports.subCategoryOf, { category: categoryLabel(dict, singleSelectedCategory ?? '') })}</p>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button onClick={onClearTags} className={`pill ${selectedTags.size === 0 ? 'active' : ''}`}>{dict.reports.all}</button>
                  {availableTags.map((tag) => (
                    <button key={tag} onClick={() => onToggleTag(tag)} className={`pill ${selectedTags.has(tag) ? 'active' : ''}`}>{tag}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
