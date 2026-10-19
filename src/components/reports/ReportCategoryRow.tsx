'use client';

import type { KeyboardEvent } from 'react';
import { Banknote, ChevronRight } from 'lucide-react';
import type { CategoryMeta } from '@/types';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { categoryLabel } from '@/lib/i18n/enumLabels';
import { Sparkline } from '@/components/kit/Sparkline';

interface ReportCategoryRowProps {
  category: string;
  total: number;
  count: number;
  /** 0..1 of its own side (money in or money out) in this period. */
  share: number;
  /** Monthly totals, oldest first; omitted where there is no trend. */
  series?: number[];
  expanded: boolean;
  controls: string;
  onToggle: () => void;
  categoryMeta: CategoryMeta;
}

const pctText = (v: number) => (v > 0 && v < 0.01 ? '<1%' : `${Math.round(v * 100)}%`);

/**
 * A category group's header row: a 36px tile in the category colour (the
 * same tile as the transaction rows under it, so parent and child match),
 * the name over "12 transactions · 34%", the subtotal, and a 4px share bar
 * under the text. On a wide card (container query in reports.css) the same
 * cells line up as a table: Category | Transactions | Share | Trend | Total.
 *
 * A div with role=button rather than a <button>: the trend sparkline is a
 * block element, which a button may not contain. Enter and Space toggle it,
 * like a button; it still plays the click sound (role=button is in AppShell's
 * list), as the plain header button did.
 *
 * The name keeps its CSS ellipsis so AppShell's truncation tooltip finds it.
 * The subtotal is font-mono-tab (privacy blur; a reveal tap is swallowed in
 * capture, so it does not toggle the group); the bar sits in pb-chart-fill.
 */
export function ReportCategoryRow({ category, total, count, share, series, expanded, controls, onToggle, categoryMeta }: ReportCategoryRowProps) {
  const { d, t } = useTranslation();
  const meta = categoryMeta[category];
  const Icon = meta ? meta.icon : Banknote;
  const color = meta ? meta.color : 'var(--pine)';
  const name = categoryLabel(d, category);
  const countText = t(count === 1 ? d.reports.transactionsOne : d.reports.transactionsOther, { count });
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); }
  };
  return (
    <div
      role="button" tabIndex={0} aria-expanded={expanded} aria-controls={controls}
      className="pb-rep-cat" onClick={onToggle} onKeyDown={onKeyDown}
      style={{ ['--pb-rep-cat' as string]: color }}
    >
      <span className="pb-rep-cat-tile" aria-hidden="true"><Icon size={16} /></span>
      <span className="pb-rep-cat-text">
        <span className="pb-rep-cat-name">{name}</span>
        <span className="pb-rep-cat-meta pb-tnum">{countText} · {pctText(share)}</span>
        <span className="pb-rep-cat-bar pb-chart-fill" aria-hidden="true">
          <i style={{ transform: `scaleX(${Math.max(0, Math.min(1, share))})` }} />
        </span>
      </span>
      <span className="pb-rep-cat-count pb-tnum">{count}</span>
      <span className="pb-rep-cat-share">
        <span className="pb-rep-cat-bar pb-chart-fill" aria-hidden="true">
          <i style={{ transform: `scaleX(${Math.max(0, Math.min(1, share))})` }} />
        </span>
        <span className="pb-tnum">{pctText(share)}</span>
      </span>
      <span className="pb-rep-cat-trend">
        {series && series.some((v) => v > 0) && <Sparkline values={series} height={22} color={color} endDot area={false} />}
      </span>
      <span className="pb-rep-cat-total font-mono-tab">{formatCurrency(total)}</span>
      <ChevronRight size={16} aria-hidden="true" className="pb-rep-cat-chev" />
    </div>
  );
}
