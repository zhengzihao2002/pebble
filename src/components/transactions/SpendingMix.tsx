'use client';

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { CategoryMeta } from '@/types';
import { formatCurrency } from '@/lib/format';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { categoryLabel } from '@/lib/i18n/enumLabels';

/** Share of the total, display only: whole percent, "<1%" for a sliver. */
function share(v: number, total: number): string {
  if (total <= 0) return '0%';
  const pct = (v / total) * 100;
  return pct > 0 && pct < 1 ? '<1%' : `${Math.round(pct)}%`;
}

interface SpendingMixProps {
  /** [category, amount spent, number of records], largest first. */
  mix: [string, number, number][];
  total: number;
  categoryMeta: CategoryMeta;
}

/**
 * The matched spending as one thin bar of category segments, with the top
 * three named below.
 *
 * LINKED FOCUS, as on the Dashboard's "Where it went": hovering a segment or
 * a legend entry (mouse), tapping one (phone) or tabbing to one singles that
 * category out - the others dim, its legend entry lights, and a tooltip over
 * the bar names it with its amount and share. A tap pins it; tapping it
 * again, tapping elsewhere or Escape lets go.
 *
 * Segments are buttons on a taller transparent hit strip (44px on touch), so
 * an 8px bar is still easy to hit. Category colours are user data and only
 * mark identity; the tooltip and legend carry the name in ink. The amount is
 * only ever in the tooltip, in font-mono-tab (blurred in privacy mode), never
 * in an aria-label; the segments themselves sit in pb-chart-fill, so in
 * privacy mode they blur and take no pointer until revealed.
 */
export function SpendingMix({ mix, total, categoryMeta }: SpendingMixProps) {
  const { d, t } = useTranslation();
  const x = d.ux.transactions;
  const [hover, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const active = hover ?? focused ?? pinned;
  const rootRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  // A tap anywhere else lets go of a pinned category.
  useEffect(() => {
    if (!pinned) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setPinned(null);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [pinned]);

  // The tooltip sits over the middle of its segment, kept inside the card.
  // Written straight to the element, after layout and before paint.
  useLayoutEffect(() => {
    const strip = stripRef.current;
    const tip = tipRef.current;
    if (!active || !strip || !tip) return;
    const seg = strip.querySelector<HTMLElement>(`[data-cat="${CSS.escape(active)}"]`);
    if (!seg) return;
    const mid = seg.offsetLeft + seg.offsetWidth / 2;
    const max = Math.max(0, strip.clientWidth - tip.offsetWidth);
    tip.style.left = `${Math.min(max, Math.max(0, mid - tip.offsetWidth / 2))}px`;
  }, [active]);

  const color = (cat: string) => categoryMeta[cat]?.color ?? 'var(--ink-faint)';
  const toggle = (cat: string) => setPinned((p) => (p === cat ? null : cat));
  // Hover only from a real mouse: a phone's simulated hover would fight the tap.
  const handlers = (cat: string) => ({
    onClick: () => toggle(cat),
    onPointerEnter: (e: { pointerType: string }) => { if (e.pointerType === 'mouse') setHover(cat); },
    onPointerLeave: (e: { pointerType: string }) => { if (e.pointerType === 'mouse') setHover(null); },
    // Keyboard focus shows the tooltip. Only a visible focus: a mouse click
    // focuses the button too, and that must not hold the tooltip open after
    // the click has let go of the pin.
    onFocus: (e: { currentTarget: HTMLElement }) => { if (e.currentTarget.matches(':focus-visible')) setFocused(cat); },
    onBlur: () => setFocused(null),
  });
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || (!pinned && !focused)) return;
    e.stopPropagation();
    setPinned(null);
    setFocused(null);
  };

  const shown = active ? mix.find(([c]) => c === active) ?? null : null;
  const top = mix.slice(0, 3);

  return (
    <div ref={rootRef} className={`pb-txn-mix${active ? ' has-focus' : ''}`} onKeyDown={onKeyDown}>
      <p className="filter-label" style={{ margin: 0 }}>{x.spendingMix}</p>
      <div className="pb-txn-mix-bar">
        <div className="pb-chart-fill">
          <div ref={stripRef} className="pb-txn-mix-strip" role="group" aria-label={x.spendingMix}>
            {mix.map(([cat, v]) => (
              <button
                key={cat} type="button" data-cat={cat}
                className={`pb-txn-mix-seg${active && active !== cat ? ' is-dim' : ''}${active === cat ? ' is-on' : ''}`}
                style={{ flexGrow: v, ['--pb-txn-seg' as string]: color(cat) }}
                aria-pressed={pinned === cat}
                aria-label={`${categoryLabel(d, cat)}, ${share(v, total)}`}
                {...handlers(cat)}
              />
            ))}
          </div>
        </div>
        {shown && (
          <div ref={tipRef} className="pb-txn-mix-tip" aria-hidden="true">
            <p className="pb-txn-mix-tip-name">
              <span className="pb-txn-mix-dot" style={{ backgroundColor: color(shown[0]) }} />
              <span>{categoryLabel(d, shown[0])}</span>
            </p>
            <p className="font-mono-tab pb-txn-mix-tip-amount">{formatCurrency(shown[1])}</p>
            <p className="pb-tnum pb-txn-mix-tip-soft">
              <span>{t(d.ux.dashboard.shareOfSpending, { share: share(shown[1], total) })}</span>
              <span>{shown[2] === 1 ? x.countOne : t(x.countOther, { count: shown[2] })}</span>
            </p>
          </div>
        )}
      </div>
      <ul className="pb-txn-mix-legend">
        {top.map(([cat, v]) => (
          <li key={cat}>
            <button
              type="button"
              className={`pb-txn-mix-key${active === cat ? ' is-on' : ''}${active && active !== cat ? ' is-dim' : ''}`}
              aria-pressed={pinned === cat}
              {...handlers(cat)}
            >
              <span className="pb-txn-mix-dot" style={{ backgroundColor: color(cat) }} aria-hidden="true" />
              <span className="pb-txn-mix-name">{categoryLabel(d, cat)}</span>
              <span className="pb-tnum pb-txn-mix-pct">{share(v, total)}</span>
            </button>
          </li>
        ))}
        {mix.length > 3 && <li className="pb-txn-mix-more">{t(x.moreCategories, { count: mix.length - 3 })}</li>}
      </ul>
    </div>
  );
}
