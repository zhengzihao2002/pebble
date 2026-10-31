'use client';

import { RollingAmount } from '@/components/shared/RollingAmount';
import { AlertTriangle, Check, FastForward, Tag } from 'lucide-react';
import type { CategoryMeta } from '@/types';
import { formatCurrency } from '@/lib/format';
import { categoryLabel } from '@/lib/i18n/enumLabels';
import { useTranslation } from '@/lib/i18n/useTranslation';
import type { BudgetVariance } from '@/lib/analysis/projection';
import { pct } from './parts';

type Status = 'over' | 'ahead' | 'on';

/**
 * Year-to-date spend against each annual budget, in the Budgets page's row
 * anatomy: an icon chip, the name, a status in words and an icon (so over
 * budget is never colour alone), a 10px bar capped at 100% and a pace marker
 * at how far through the year today is - now solid ink with a hover / focus
 * label, where it was a faint line clipped by the track.
 *
 * Grouped Over budget, Ahead of pace, On pace - the order the usedShare sort
 * already gives - each under a small heading. Every budgeted category stays.
 */
export function BudgetPaceList({ variance, pace, categoryMeta }: {
  variance: BudgetVariance[]; pace: number; categoryMeta: CategoryMeta;
}) {
  const { d, t } = useTranslation();
  const x = d.ux.analysis;
  const statusOf = (v: BudgetVariance): Status => (v.overBudget ? 'over' : v.usedShare > pace ? 'ahead' : 'on');
  const groups: { status: Status; label: string; rows: BudgetVariance[] }[] = [
    { status: 'over', label: x.overBudget, rows: [] },
    { status: 'ahead', label: x.aheadOfPace, rows: [] },
    { status: 'on', label: x.onPace, rows: [] },
  ];
  for (const v of variance) groups.find((g) => g.status === statusOf(v))!.rows.push(v);
  const marker = t(x.paceMarker, { pct: pct(pace) });
  // Every marker says the same thing (the year's pace), so only the first
  // one is a tab stop; the rest keep their hover tip and label.
  const firstCategory = groups.find((g) => g.rows.length > 0)?.rows[0]?.category;

  return (
    <div className="pb-ana-pace">
      {groups.filter((g) => g.rows.length > 0).map((g) => (
        <div key={g.status} className="pb-ana-pace-group">
          <p className={`pb-ana-pace-ghead is-${g.status}`}>
            {g.status === 'over' ? <AlertTriangle size={13} aria-hidden="true" /> : g.status === 'ahead' ? <FastForward size={13} aria-hidden="true" /> : <Check size={13} aria-hidden="true" />}
            <span>{g.label}</span>
            <span className="pb-tnum pb-ana-pace-count">{g.rows.length}</span>
          </p>
          <ul className="pb-ana-pace-rows">
            {/* v.category is USER DATA: shown as stored, except that the built-in
                income category names are translated for display. */}
            {g.rows.map((v) => {
              const meta = categoryMeta[v.category];
              const Icon = meta?.icon ?? Tag;
              const color = meta?.color ?? 'var(--pine)';
              return (
                <li key={v.category} className={`pb-ana-pace-row is-${g.status}`}>
                  <span className="pb-ana-ico" aria-hidden="true" style={{ backgroundColor: `color-mix(in srgb, ${color} 13%, transparent)`, color }}>
                    <Icon size={15} />
                  </span>
                  <span className="pb-ana-pace-name">
                    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{categoryLabel(d, v.category)}</span>
                  </span>
                  <span className="pb-ana-pace-figs">
                    <span className="font-mono-tab" style={{ color: v.overBudget ? 'var(--wine)' : undefined }}>
                      <RollingAmount value={formatCurrency(v.spent)} /> / <RollingAmount value={formatCurrency(v.budget)} />
                    </span>
                    <span className="pb-tnum" style={{ color: v.overBudget ? 'var(--wine)' : undefined }}> · {pct(v.usedShare)}</span>
                  </span>
                  <span className="pb-ana-pace-bar">
                    <span className="pb-row-track">
                      <span
                        className="pb-row-fill"
                        style={{ display: 'block', width: `${Math.min(v.usedShare * 100, 100)}%`, backgroundColor: v.overBudget ? 'var(--wine)' : color }}
                      />
                    </span>
                    <span className="pb-row-marker" style={{ left: `${pace * 100}%` }} tabIndex={v.category === firstCategory ? 0 : -1} role="img" aria-label={marker} data-tip={marker} />
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
