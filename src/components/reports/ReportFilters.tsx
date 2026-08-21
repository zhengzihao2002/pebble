'use client';

import { ChevronRight, Search } from 'lucide-react';
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
  categoryGroup, onCategoryGroupChange,
  sortDir, onSortDirChange,
  sortField, onSortFieldChange,
  descQuery, onDescQueryChange,
  availableCats, selectedCategories, allSelected, onToggleCategory, onToggleAllCategories,
  showTagFilter, singleSelectedCategory, availableTags, selectedTags, onToggleTag, onClearTags,
}: ReportFiltersProps) {
  return (
    <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
      <button
        onClick={onToggleExpanded}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', width: '100%', background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', color: 'var(--ink)' }}
      >
        <div style={{ minWidth: 0 }}>
          <p className="filter-label" style={{ margin: 0 }}>Filters</p>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem', paddingTop: '1.15rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {(['expense', 'income'] as const).map((t) => (
                <button
                  key={t} onClick={() => onTypeChange(t)} className={`pill ${reportType === t ? 'active' : ''}`}
                  style={{ flex: 1, padding: '0.62rem', fontWeight: 600 }}
                >
                  {t === 'expense' ? 'Expenses' : 'Income'}
                </button>
              ))}
            </div>

            <div>
              <p className="filter-label">Time period</p>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {([['month', 'Month'], ['quarter', 'Quarter'], ['year', 'Year'], ['all', 'All']] as [PeriodGroup, string][]).map(([v, l]) => (
                  <button key={v} onClick={() => onPeriodGroupChange(v)} className={`pill ${periodGroup === v ? 'active' : ''}`}>{l}</button>
                ))}
              </div>
            </div>

            {subPeriodOptions && (
              <div>
                <p className="filter-label">{subPeriodLabel}</p>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button onClick={() => onSubPeriodChange('All')} className={`pill ${subPeriod === 'All' ? 'active' : ''}`}>
                    All {periodGroup}s
                  </button>
                  {subPeriodOptions.length === 0 ? (
                    <span style={{ fontSize: '0.78rem', color: 'var(--ink-soft)', alignSelf: 'center' }}>No data yet</span>
                  ) : (
                    subPeriodOptions.map((opt) => (
                      <button key={opt} onClick={() => onSubPeriodChange(opt)} className={`pill ${subPeriod === opt ? 'active' : ''}`}>{opt}</button>
                    ))
                  )}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
              <div>
                <p className="filter-label">Group by</p>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {([['category', 'Category'], ['none', 'None']] as [CategoryGroupMode, string][]).map(([v, l]) => (
                    <button key={v} onClick={() => onCategoryGroupChange(v)} className={`pill ${categoryGroup === v ? 'active' : ''}`}>{l}</button>
                  ))}
                </div>
              </div>
              <div>
                <p className="filter-label">Sort</p>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {([
                    ['amount', 'desc', 'Highest first'],
                    ['amount', 'asc', 'Lowest first'],
                    ['date', 'desc', 'Newest first'],
                    ['date', 'asc', 'Oldest first'],
                  ] as [SortField, SortDir, string][]).map(([f, d, l]) => (
                    <button
                      key={`${f}-${d}`}
                      onClick={() => { onSortFieldChange(f); onSortDirChange(d); }}
                      className={`pill ${sortField === f && sortDir === d ? 'active' : ''}`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <p className="filter-label">Description</p>
              <div style={{ position: 'relative', maxWidth: 320 }}>
                <Search size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-soft)' }} />
                <input
                  value={descQuery} onChange={(e) => onDescQueryChange(e.target.value)} placeholder="Optional — search description"
                  style={{ width: '100%', padding: '0.55rem 0.75rem 0.55rem 2.1rem', borderRadius: '0.7rem', border: '1px solid var(--line)', fontSize: '0.83rem', color: 'var(--ink)', backgroundColor: 'var(--paper)', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div>
              <p className="filter-label">Only include categories</p>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button onClick={onToggleAllCategories} className={`pill ${allSelected ? 'active' : ''}`}>All</button>
                {availableCats.map((c) => (
                  <button key={c} onClick={() => onToggleCategory(c)} className={`pill ${selectedCategories.has(c) ? 'active' : ''}`}>{c}</button>
                ))}
              </div>
            </div>

            {showTagFilter && availableTags.length > 0 && (
              <div>
                <p className="filter-label">{singleSelectedCategory} sub-category</p>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button onClick={onClearTags} className={`pill ${selectedTags.size === 0 ? 'active' : ''}`}>All</button>
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
