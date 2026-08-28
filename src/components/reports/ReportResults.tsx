'use client';

import { Banknote, ChevronRight } from 'lucide-react';
import type { CategoryMeta, Transaction } from '@/types';
import { formatCurrency } from '@/lib/format';
import { TransactionRow } from '@/components/shared/TransactionRow';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { categoryLabel } from '@/lib/i18n/enumLabels';
import type { ReportPeriodGroup, CategoryGroupMode } from './types';

interface ReportResultsProps {
  periodGroups: ReportPeriodGroup[];
  periodFilteredCount: number;
  grandTotal: number;
  accent: string;
  categoryGroup: CategoryGroupMode;
  showPeriodHeaders: boolean;
  expandedCategoryGroups: Set<string>;
  onToggleCategoryGroup: (key: string) => void;
  hasGroupKeys: boolean;
  anyGroupsExpanded: boolean;
  onToggleAllGroups: () => void;
  categoryMeta: CategoryMeta;
  onOpenDetail: (txn: Transaction) => void;
}

export function ReportResults({
  periodGroups, periodFilteredCount, grandTotal, accent, categoryGroup, showPeriodHeaders,
  expandedCategoryGroups, onToggleCategoryGroup, hasGroupKeys, anyGroupsExpanded, onToggleAllGroups,
  categoryMeta, onOpenDetail,
}: ReportResultsProps) {
  // dict/tr: `t` is the transaction parameter in three map callbacks below.
  const { d: dict, t: tr } = useTranslation();
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.5rem' }}>
          <p style={{ fontSize: '0.82rem', color: 'var(--ink-soft)' }}>{tr(periodFilteredCount === 1 ? dict.reports.transactionsOne : dict.reports.transactionsOther, { count: periodFilteredCount })}</p>
          <p className="font-mono-tab" style={{ fontSize: '1rem', fontWeight: 600, color: accent }}>{tr(dict.reports.grandTotal, { amount: formatCurrency(grandTotal) })}</p>
        </div>
        {categoryGroup === 'category' && hasGroupKeys && (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={onToggleAllGroups} className="pill">
              {anyGroupsExpanded ? dict.reports.collapseAll : dict.reports.expandAll}
            </button>
          </div>
        )}
      </div>

      {periodGroups.length === 0 || periodFilteredCount === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--ink-soft)' }}>
          <p style={{ fontWeight: 500, marginBottom: 4, color: 'var(--ink)' }}>{dict.reports.noMatch}</p>
          <p style={{ fontSize: '0.85rem' }}>{dict.reports.noMatchHint}</p>
        </div>
      ) : (
        periodGroups.map((pg) => (
          <div key={pg.key} className="card" style={{ padding: '1.25rem 0', overflow: 'hidden' }}>
            {showPeriodHeaders && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.75rem', padding: '0 1.5rem' }}>
                <h3 className="font-display" style={{ fontSize: '1.05rem', fontWeight: 600 }}>{pg.label}</h3>
                <span className="font-mono-tab" style={{ fontSize: '0.85rem', color: 'var(--ink-soft)' }}>{formatCurrency(pg.total)}</span>
              </div>
            )}
            {categoryGroup === 'category' ? (
              (pg.subGroups ?? []).map((sg) => {
                const meta = categoryMeta[sg.key];
                const SgIcon = meta ? meta.icon : Banknote;
                const color = meta ? meta.color : 'var(--pine)';
                const groupKey = `${pg.key}::${sg.key}`;
                const isGroupExpanded = expandedCategoryGroups.has(groupKey);
                return (
                  <div key={sg.key} style={{ marginBottom: '1rem' }}>
                    <button
                      onClick={() => onToggleCategoryGroup(groupKey)}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '0.4rem 1.5rem', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', color: 'var(--ink)' }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', fontWeight: 600, minWidth: 0 }}>
                        <ChevronRight
                          size={14}
                          style={{ color: 'var(--ink-soft)', flexShrink: 0, transform: isGroupExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
                        />
                        <SgIcon size={14} style={{ color, flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{categoryLabel(dict, sg.key)}</span>
                      </span>
                      <span className="font-mono-tab" style={{ fontSize: '0.8rem', color: 'var(--ink-soft)', flexShrink: 0 }}>{formatCurrency(sg.total)}</span>
                    </button>
                    <div className={`collapsible-rows ${isGroupExpanded ? 'expanded' : ''}`}>
                      <div className="collapsible-rows-inner">
                        {sg.items.map((t) => (
                          <TransactionRow key={t.id} txn={t} onOpenDetail={onOpenDetail} categoryMeta={categoryMeta} />
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              (pg.items ?? []).map((t) => <TransactionRow key={t.id} txn={t} onOpenDetail={onOpenDetail} categoryMeta={categoryMeta} />)
            )}
          </div>
        ))
      )}
    </>
  );
}
