'use client';

import { AlertTriangle, Check, CircleDashed, CircleOff, FileWarning } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';

export type RowStatus = 'ready' | 'needsAccount' | 'needsCategory' | 'needsBoth' | 'overdue' | 'bad' | 'skipped';

/**
 * Where a review row stands, as a chip: an icon and a word, never colour
 * alone. Derived only from what the review already computes (readable,
 * ticked, account / category chosen, overdue on a card).
 */
export function StatusChip({ status }: { status: RowStatus }) {
  const { d } = useTranslation();
  const x = d.ux.transactionDialogs;
  const meta: Record<RowStatus, { label: string; tone: 'good' | 'wait' | 'bad' | 'quiet'; Icon: typeof Check }> = {
    ready: { label: x.statusReady, tone: 'good', Icon: Check },
    needsAccount: { label: x.statusNeedsAccount, tone: 'wait', Icon: CircleDashed },
    needsCategory: { label: x.statusNeedsCategory, tone: 'wait', Icon: CircleDashed },
    needsBoth: { label: x.statusNeedsBoth, tone: 'wait', Icon: CircleDashed },
    overdue: { label: x.statusOverdue, tone: 'bad', Icon: AlertTriangle },
    bad: { label: x.statusBad, tone: 'bad', Icon: FileWarning },
    skipped: { label: x.statusSkipped, tone: 'quiet', Icon: CircleOff },
  };
  const { label, tone, Icon } = meta[status];
  return (
    <span className={`pb-tdlg-status pb-tdlg-status-${tone}`}>
      <Icon size={12} strokeWidth={2.4} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

export type ReviewFilter = 'all' | 'needs' | 'dups' | 'bad';

/**
 * Filter pills above the review list. A pill with nothing in it is left out
 * (All always shows). aria-pressed buttons in a labelled group.
 */
export function ReviewFilterBar({ value, counts, onChange }: {
  value: ReviewFilter;
  counts: Record<ReviewFilter, number>;
  onChange: (f: ReviewFilter) => void;
}) {
  const { d, t } = useTranslation();
  const x = d.ux.transactionDialogs;
  const label: Record<ReviewFilter, string> = {
    all: x.filterAll, needs: x.filterNeeds, dups: x.filterDups, bad: x.filterBad,
  };
  const order: ReviewFilter[] = ['all', 'needs', 'dups', 'bad'];
  return (
    <div className="pb-tdlg-filters" role="group" aria-label={x.filterLabel}>
      {order.filter((f) => f === 'all' || f === value || counts[f] > 0).map((f) => (
        <button
          key={f} type="button" aria-pressed={value === f}
          className={`pb-tdlg-filter pb-tdlg-filter-${f}`}
          onClick={() => onChange(f)}
        >
          {t(label[f], { count: counts[f] })}
        </button>
      ))}
    </div>
  );
}

/**
 * Before -> after as one thin bar: the balance that stays, then the change -
 * pine when the import adds money, a hatched wine stretch for what it takes
 * away. Proportions only; the figures are the lines below it. Hidden when
 * either balance is below zero, where a single bar would mislead.
 */
export function BalanceDelta({ beforeCents, afterCents }: { beforeCents: number; afterCents: number }) {
  const { d } = useTranslation();
  if (beforeCents < 0 || afterCents < 0) return null;
  const top = Math.max(beforeCents, afterCents);
  if (top <= 0) return null;
  const base = Math.min(beforeCents, afterCents);
  const change = Math.abs(afterCents - beforeCents);
  const up = afterCents > beforeCents;
  return (
    <div className="pb-chart-fade pb-tdlg-delta" role="img" aria-label={d.ux.transactionDialogs.balanceChange}>
      <span className="pb-tdlg-delta-base" style={{ flexGrow: base }} />
      {change > 0 && <span className={up ? 'pb-tdlg-delta-up' : 'pb-tdlg-delta-down'} style={{ flexGrow: change }} />}
    </div>
  );
}
