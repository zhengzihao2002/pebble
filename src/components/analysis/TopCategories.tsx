'use client';

import { useState } from 'react';
import { MoreHorizontal, Tag } from 'lucide-react';
import type { CategoryMeta } from '@/types';
import { formatCurrency } from '@/lib/format';
import { categoryLabel } from '@/lib/i18n/enumLabels';
import { useTranslation } from '@/lib/i18n/useTranslation';
import type { CategorySpend } from '@/lib/analysis/spending';
import { pct } from './parts';

const TOP = 8;

/**
 * Categories ranked by total, top eight by default. Each row: the category's
 * icon chip, its name (user data, ellipsis with the shell's hover / tap
 * tooltip), "amount · share" and a bar in its own colour on a visible track
 * (var(--line); the old var(--paper) track all but vanished on a light card).
 * Bars reveal with the Budgets rows' clip wipe - true geometry, never a
 * growing false value.
 *
 * New: past eight, an "Other" remainder row keeps the shares adding up to
 * 100%, and "Show all" opens the rest in place.
 */
export function TopCategories({ categories, categoryMeta }: { categories: CategorySpend[]; categoryMeta: CategoryMeta }) {
  const { d, t } = useTranslation();
  const x = d.ux.analysis;
  const [all, setAll] = useState(false);
  const top = categories.slice(0, TOP);
  const rest = categories.slice(TOP);
  const restTotal = rest.reduce((s, c) => s + c.total, 0);
  const restShare = rest.reduce((s, c) => s + c.share, 0);

  const row = (c: CategorySpend) => {
    const meta = categoryMeta[c.category];
    const Icon = meta?.icon ?? Tag;
    const color = meta?.color ?? 'var(--pine)';
    return (
      <li key={c.category} className="pb-ana-cat">
        <span className="pb-ana-ico" aria-hidden="true" style={{ backgroundColor: `color-mix(in srgb, ${color} 13%, transparent)`, color }}>
          <Icon size={15} />
        </span>
        <span className="pb-ana-cat-main">
          <span className="pb-ana-cat-line">
            {/* c.category is USER DATA: shown as stored, except that the built-in
                income category names are translated for display. */}
            <span className="pb-ana-cat-name" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{categoryLabel(d, c.category)}</span>
            <span className="pb-ana-cat-figs">
              <span className="font-mono-tab">{formatCurrency(c.total)}</span>
              <span className="pb-tnum"> · {pct(c.share)}</span>
            </span>
          </span>
          <span className="pb-row-track pb-ana-cat-track" aria-hidden="true">
            <span className="pb-row-fill" style={{ display: 'block', width: `${Math.max(c.share * 100, 1)}%`, backgroundColor: color }} />
          </span>
        </span>
      </li>
    );
  };

  return (
    <div className="pb-ana-cats">
      <ul className="pb-ana-cat-list">{top.map(row)}</ul>
      {rest.length > 0 && (
        <>
          <div className={`collapsible-rows${all ? ' expanded' : ''}`}>
            <div className="collapsible-rows-inner" inert={!all}>
              <ul className="pb-ana-cat-list">{rest.map(row)}</ul>
            </div>
          </div>
          {!all && (
            <div className="pb-ana-cat pb-ana-cat-other">
              <span className="pb-ana-ico" aria-hidden="true"><MoreHorizontal size={15} /></span>
              <span className="pb-ana-cat-main">
                <span className="pb-ana-cat-line">
                  <span className="pb-ana-cat-name">
                    {x.other} <span className="pb-ana-cat-sub pb-tnum">· {t(x.otherCount, { count: rest.length })}</span>
                  </span>
                  <span className="pb-ana-cat-figs">
                    <span className="font-mono-tab">{formatCurrency(restTotal)}</span>
                    <span className="pb-tnum"> · {pct(restShare)}</span>
                  </span>
                </span>
                <span className="pb-row-track pb-ana-cat-track" aria-hidden="true">
                  <span className="pb-row-fill" style={{ display: 'block', width: `${Math.max(restShare * 100, 1)}%`, backgroundColor: 'var(--ink-faint)' }} />
                </span>
              </span>
            </div>
          )}
          <button type="button" className="link-btn pb-ana-more" aria-expanded={all} onClick={() => setAll((v) => !v)}>
            {all ? d.insights.showLess : t(d.insights.showAll, { count: categories.length })}
          </button>
        </>
      )}
    </div>
  );
}
