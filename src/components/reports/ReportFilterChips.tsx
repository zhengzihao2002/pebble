'use client';

import { X } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';

export interface ActiveFilterChip {
  key: string;
  /** Display text, already translated. */
  label: string;
  onRemove: () => void;
}

/**
 * The filters that are narrowing the report right now, each with its own ×,
 * plus Clear filters. Only non-default filters show, and nothing at all when
 * none is on - so a collapsed Filters panel can never shrink the totals
 * without saying why. The period, grouping and sort are not filters here:
 * the toolbar shows the period, and they never hide rows.
 *
 * One line that scrolls sideways on a phone (mid-page, never along the bottom
 * edge), wrapping on wider screens. The filter summary sentence is its label.
 */
export function ReportFilterChips({ chips, onClearAll, summary }: { chips: ActiveFilterChip[]; onClearAll: () => void; summary: string }) {
  const { d, t } = useTranslation();
  const x = d.ux.reports;
  if (chips.length === 0) return null;
  return (
    <div className="pb-rep-chips" role="group" aria-label={`${x.activeFilters}: ${summary}`}>
      <div className="pb-rep-chips-row themed-scroll">
        {chips.map((c) => (
          <button key={c.key} type="button" className="pb-rep-chip" onClick={c.onRemove} aria-label={t(x.removeFilter, { name: c.label })}>
            <span className="pb-rep-chip-text">{c.label}</span>
            <X size={13} aria-hidden="true" />
          </button>
        ))}
        {chips.length > 1 && (
          <button type="button" className="pb-rep-chip-clear" onClick={onClearAll}>{x.clearFilters}</button>
        )}
      </div>
    </div>
  );
}
