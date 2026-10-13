'use client';

import { Banknote, ChevronRight } from 'lucide-react';
import type { CategoryMeta, Transaction } from '@/types';
import { formatCurrency } from '@/lib/format';
import { TransactionRow } from '@/components/shared/TransactionRow';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { categoryLabel } from '@/lib/i18n/enumLabels';
import type { ReportPeriodGroup, CategoryGroupMode } from './types';

// Light green behind income and light red behind expenses (the same pine and
// wine as the totals). A mix of the theme colour, so it follows every palette
// and dark mode.
const tintFor = (income: boolean) =>
  `color-mix(in srgb, var(${income ? '--pine' : '--wine'}) 9%, transparent)`;

// The card's own vertical padding. In tinted mode the card has none, and the
// first and last bands add it back inside their own colour, so the tint runs
// to the card edge instead of leaving a white strip below the last group.
const CARD_PAD = '1.25rem';

interface ReportResultsProps {
  periodGroups: ReportPeriodGroup[];
  periodFilteredCount: number;
  grandTotal: number;
  accent: string;
  /** True when expenses and income show together: groups and rows are tinted. */
  tinted: boolean;
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
  periodGroups, periodFilteredCount, grandTotal, accent, tinted, categoryGroup, showPeriodHeaders,
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
          <div key={pg.key} className="card" style={{ padding: tinted ? 0 : `${CARD_PAD} 0`, overflow: 'hidden' }}>
            {/* The title stays on the plain card background; the tint starts
                below it. */}
            {showPeriodHeaders && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.75rem', padding: tinted ? `${CARD_PAD} 1.5rem 0` : '0 1.5rem' }}>
                <h3 className="font-display" style={{ fontSize: '1.05rem', fontWeight: 600 }}>{pg.label}</h3>
                <span className="font-mono-tab" style={{ fontSize: '0.85rem', color: 'var(--ink-soft)' }}>{formatCurrency(pg.total)}</span>
              </div>
            )}
            {categoryGroup === 'category' ? (
              (pg.subGroups ?? []).map((sg, i, all) => {
                const meta = categoryMeta[sg.key];
                const SgIcon = meta ? meta.icon : Banknote;
                const color = meta ? meta.color : 'var(--pine)';
                const groupKey = `${pg.key}::${sg.key}`;
                const isGroupExpanded = expandedCategoryGroups.has(groupKey);
                const isFirst = i === 0;
                const isLast = i === all.length - 1;
                // Tinted: each group is its own band with half of the old 1rem
                // gap above and below. Two neighbouring bands meet in the
                // middle of that gap, so red-red is red, green-green is green
                // and green-red is half and half, with no gradient needed. The
                // first and last bands also carry the card padding.
                const bandStyle: React.CSSProperties = tinted
                  ? {
                      background: tintFor(sg.items[0]?.type === 'income'),
                      paddingTop: isFirst && !showPeriodHeaders ? `calc(0.5rem + ${CARD_PAD})` : '0.5rem',
                      paddingBottom: isLast ? `calc(0.5rem + ${CARD_PAD})` : '0.5rem',
                    }
                  : { marginBottom: '1rem' };
                return (
                  <div key={sg.key} style={bandStyle}>
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
              // Ungrouped: rows already touch, so each row is its own band and
              // there is no gap to fill. The first and last carry the card
              // padding so the tint reaches the edges.
              (pg.items ?? []).map((t, i, all) =>
                tinted ? (
                  <div
                    key={t.id}
                    style={{
                      background: tintFor(t.type === 'income'),
                      paddingTop: i === 0 && !showPeriodHeaders ? CARD_PAD : 0,
                      paddingBottom: i === all.length - 1 ? CARD_PAD : 0,
                    }}
                  >
                    <TransactionRow txn={t} onOpenDetail={onOpenDetail} categoryMeta={categoryMeta} />
                  </div>
                ) : (
                  <TransactionRow key={t.id} txn={t} onOpenDetail={onOpenDetail} categoryMeta={categoryMeta} />
                ),
              )
            )}
          </div>
        ))
      )}
    </>
  );
}
