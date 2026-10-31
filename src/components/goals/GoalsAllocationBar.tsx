'use client';

import { RollingAmount, RollingMoneyText } from '@/components/shared/RollingAmount';
import { useState } from 'react';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';

export interface AllocationSlice {
  key: string;
  /** The goal's name - user data, shown exactly as stored. */
  name: string;
  /** The goal's own colour (an identity mark). */
  color: string;
  value: number;
}

interface GoalsAllocationBarProps {
  /** Goals with money set aside, largest first. */
  slices: AllocationSlice[];
  total: number;
  allocated: number;
  unallocated: number;
}

// A segment is named under the ribbon once it is this share of it; narrower
// ones are named by the popup.
const LABEL_SHARE = 0.12;

function formatShare(value: number, base: number): string {
  if (base <= 0) return '0%';
  const pct = (value / base) * 100;
  return pct > 0 && pct < 1 ? '<1%' : `${Math.round(pct)}%`;
}

/**
 * NEW: the balance, split. One ribbon in the same language as the Budgets
 * plan bar: each goal's set-aside amount in the goal's colour, and what is
 * unallocated as the pine hatch (the plan bar's "kept, not spent" mark).
 *
 * When goals claim more than the balance, the ribbon's 100% becomes what the
 * goals claim and a wine bracket marks the part the balance does not cover,
 * labelled with how much - the over-allocated note below says why.
 *
 * Hover, focus or tap a segment for its name, amount and share. Labels on the
 * segments never carry an amount (privacy); the popup's figures wear
 * .font-mono-tab, and the whole ribbon sits in .pb-chart-fade, so privacy
 * mode blurs it and a tap reveals it like any chart.
 */
export function GoalsAllocationBar({ slices, total, allocated, unallocated }: GoalsAllocationBarProps) {
  const { d, t } = useTranslation();
  const ux = d.ux.goals;
  const [hover, setHover] = useState<{ key: string; left: number } | null>(null);

  const over = allocated > 0 && unallocated < 0;
  // The ribbon's 100%: the balance, or what goals claim once that is more.
  const base = over ? allocated : Math.max(total, 0);
  if (base <= 0) return null;

  const rows = [
    ...slices.map((s) => ({ ...s, free: false })),
    ...(!over && unallocated > 0 ? [{ key: 'free', name: d.goals.unallocated, color: 'var(--pine)', value: unallocated, free: true }] : []),
  ];
  // How much of the ribbon the balance does not cover (all of it with no
  // positive balance).
  const overShare = over ? Math.min(1, (allocated - Math.max(total, 0)) / allocated) : 0;
  const shareText = (v: number) => t(over ? ux.ofClaims : ux.ofBalance, { pct: formatShare(v, base) });

  return (
    <div className="pb-goals-ribbon pb-chart-fade">
      <div className={`pb-plan-barwrap pb-goals-ribbon-wrap${hover ? ' has-active' : ''}`}>
        <div className="pb-bar-track pb-goals-ribbon-track" role="group" aria-label={ux.allocBarLabel}>
          {rows.map((r) => {
            const show = (el: HTMLElement) => setHover({ key: r.key, left: el.offsetLeft + el.offsetWidth / 2 });
            return (
              <span
                key={r.key}
                tabIndex={0}
                className={`pb-bar-seg pb-plan-seg${r.free ? ' pb-plan-savings' : ''}${hover?.key === r.key ? ' active' : ''}`}
                style={{ flexGrow: r.value, ...(r.free ? {} : { backgroundColor: r.color }) }}
                // Name and share only: an amount never goes in a label.
                aria-label={`${r.name}: ${shareText(r.value)}`}
                onPointerEnter={(e) => show(e.currentTarget)}
                onPointerLeave={(e) => { if (e.pointerType === 'mouse') setHover(null); }}
                onClick={(e) => show(e.currentTarget)}
                onFocus={(e) => show(e.currentTarget)}
                onBlur={() => setHover(null)}
              />
            );
          })}
        </div>
        {over && (
          <span className="pb-goals-over-zone" style={{ width: `${overShare * 100}%` }} aria-hidden="true" />
        )}

        {hover && (() => {
          const r = rows.find((x) => x.key === hover.key);
          if (!r) return null;
          return (
            <div className="pb-plan-pop" role="status" style={{ left: `clamp(7rem, ${hover.left}px, calc(100% - 7rem))` }}>
              <div className="pb-plan-pop-title">
                <span
                  className={`pb-donut-dot${r.free ? ' pb-plan-savings' : ''}`}
                  style={r.free ? undefined : { backgroundColor: r.color }}
                  aria-hidden="true"
                />
                <span>{r.name}</span>
              </div>
              <div className="pb-plan-pop-figs">
                <span className="font-mono-tab"><RollingAmount value={formatCurrency(r.value)} /></span> · <span className="pb-tnum">{shareText(r.value)}</span>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Direct labels under the wide segments, laid out with the same flex
          weights and gaps so each sits under its own segment. Decorative: the
          segments' own labels carry it for assistive tech. In the over case
          the bracket's label takes the right-hand end instead. */}
      <div className="pb-goals-ribbon-labels" aria-hidden="true">
        {rows.map((r) => (
          <span key={r.key} className={r.free ? 'is-free' : undefined} style={{ flexGrow: r.value }}>
            {r.value / base >= LABEL_SHARE && (
              <>
                <span className="pb-goals-ribbon-name">{r.name}</span>
                <span className="pb-goals-ribbon-share pb-tnum">{formatShare(r.value, base)}</span>
              </>
            )}
          </span>
        ))}
      </div>
      {/* Phone: every slice as a wrapping legend instead (goals.css swaps
          them by width). Decorative for the same reason as the labels. */}
      <ul className="pb-goals-ribbon-legend" aria-hidden="true">
        {rows.map((r) => (
          <li key={r.key}>
            <span
              className={`pb-donut-dot${r.free ? ' pb-plan-savings' : ''}`}
              style={r.free ? undefined : { backgroundColor: r.color }}
            />
            <span className="pb-goals-ribbon-name">{r.name}</span>
            <span className="pb-goals-ribbon-share pb-tnum">{formatShare(r.value, base)}</span>
          </li>
        ))}
      </ul>
      {over && (
        <p className="pb-goals-over-label" style={{ width: `max(${overShare * 100}%, 9rem)` }}>
          <span>{ux.overShort}</span>
          <span className="font-mono-tab"><RollingMoneyText value={t(ux.overBy, { amount: formatCurrency(allocated - Math.max(total, 0)) })} /></span>
        </p>
      )}
    </div>
  );
}
