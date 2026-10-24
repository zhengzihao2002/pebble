'use client';

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react';
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
 * an 8px bar is still easy to hit. On touch a sliver of a few pixels is
 * still too thin for a finger, so a tap is resolved by the strip itself: a
 * segment 44px wide or more takes the tap where it lands, otherwise the
 * segment whose centre is nearest the finger (within 22px) does. And "+N
 * more" opens the legend to every category, each a 44px target on touch, so
 * every category can be reached without aiming at the bar at all. Category colours are user data and only
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
  const [allKeys, setAllKeys] = useState(false);
  // The kind of pointer behind the next click: a click event's own
  // pointerType is not there in every browser (older Safari).
  const lastPointer = useRef('mouse');
  // When a finger or pen last touched this bar (ms, performance clock). See
  // hoverFocus: mouse "hover" arriving right after a touch is not a mouse.
  const lastTouchAt = useRef(-Infinity);

  // A tap anywhere else lets go of a pinned category - and of a hover, so a
  // tooltip that a touch device left behind cannot outlive the next tap.
  useEffect(() => {
    if (!pinned && !hover) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) { setPinned(null); setHover(null); }
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [pinned, hover]);

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
  // It is taken from pointermove, not pointerenter: after a tap changes the
  // layout (the legend opening, "+N more" moving on), the browser replays a
  // pointerenter with pointerType "mouse" on whatever now sits under the
  // finger, with no pointermove and, as the finger is already up, no matching
  // pointerleave. Read as hover, that pinned the category that took the
  // control's place and left its tooltip stuck. A real mouse always moves
  // over the element it enters, so pointermove ignores the replay.
  // Belt and braces for touch-first devices (iOS Safari, hybrids with a mouse
  // paired): a touch or pen contact clears any hover at once (onPointerDown
  // on the root) and, for a moment after it, a "mouse" move is taken as the
  // browser's own compatibility replay, not a hand on a mouse.
  const hoverFocus = (cat: string) => ({
    onPointerMove: (e: { pointerType: string }) => {
      if (e.pointerType === 'mouse' && performance.now() - lastTouchAt.current > 600) setHover(cat);
    },
    onPointerLeave: (e: { pointerType: string }) => { if (e.pointerType === 'mouse') setHover(null); },
    // Keyboard focus shows the tooltip. Only a visible focus: a mouse click
    // focuses the button too, and that must not hold the tooltip open after
    // the click has let go of the pin.
    onFocus: (e: { currentTarget: HTMLElement }) => { if (e.currentTarget.matches(':focus-visible')) setFocused(cat); },
    onBlur: () => setFocused(null),
  });
  const handlers = (cat: string) => ({ onClick: () => toggle(cat), ...hoverFocus(cat) });

  // Every click on the bar - mouse, keyboard (Enter / Space) or tap - is
  // resolved here, so a tap can pick a sliver by proximity.
  const onStripClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    const strip = stripRef.current;
    const under = (e.target as HTMLElement).closest<HTMLElement>('[data-cat]');
    if (!strip) return;
    // A keyboard click (detail 0) or a mouse: the segment it was on.
    if (e.detail === 0 || lastPointer.current !== 'touch') {
      if (under?.dataset.cat) toggle(under.dataset.cat);
      return;
    }
    let pick = under && under.offsetWidth >= 44 ? under : null;
    if (!pick) {
      let best = 23;
      for (const seg of strip.querySelectorAll<HTMLElement>('[data-cat]')) {
        const r = seg.getBoundingClientRect();
        const dist = Math.abs(r.left + r.width / 2 - e.clientX);
        if (dist < best) { best = dist; pick = seg; }
      }
    }
    pick ??= under;
    if (pick?.dataset.cat) toggle(pick.dataset.cat);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || (!pinned && !focused && !hover)) return;
    e.stopPropagation();
    setPinned(null);
    setFocused(null);
    setHover(null);
  };
  // A touch or pen contact: no hover survives it (see hoverFocus).
  const onRootPointerDown = (e: { pointerType: string }) => {
    if (e.pointerType === 'mouse') return;
    lastTouchAt.current = performance.now();
    setHover(null);
  };

  const shown = active ? mix.find(([c]) => c === active) ?? null : null;
  const keys = allKeys ? mix : mix.slice(0, 3);

  return (
    <div ref={rootRef} className={`pb-txn-mix${active ? ' has-focus' : ''}`} onKeyDown={onKeyDown} onPointerDownCapture={onRootPointerDown}>
      <p className="filter-label" style={{ margin: 0 }}>{x.spendingMix}</p>
      <div className="pb-txn-mix-bar">
        {/* data-pb-keep-revealed: in privacy mode, once revealed, later taps
            reach the segments instead of blurring the bar again. */}
        <div className="pb-chart-fill" data-pb-keep-revealed="">
          <div
            ref={stripRef} className="pb-txn-mix-strip" role="group" aria-label={x.spendingMix}
            onPointerDown={(e) => { lastPointer.current = e.pointerType; }}
            onClick={onStripClick}
          >
            {mix.map(([cat, v]) => (
              <button
                key={cat} type="button" data-cat={cat}
                className={`pb-txn-mix-seg${active && active !== cat ? ' is-dim' : ''}${active === cat ? ' is-on' : ''}`}
                style={{ flexGrow: v, ['--pb-txn-seg' as string]: color(cat) }}
                aria-pressed={pinned === cat}
                aria-label={`${categoryLabel(d, cat)}, ${share(v, total)}`}
                {...hoverFocus(cat)}
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
              <span>{t(x.shareOfSpending, { share: share(shown[1], total) })}</span>
              <span>{shown[2] === 1 ? x.countOne : t(x.countOther, { count: shown[2] })}</span>
            </p>
          </div>
        )}
      </div>
      <ul className="pb-txn-mix-legend">
        {keys.map(([cat, v]) => (
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
        {mix.length > 3 && (
          <li>
            <button type="button" className="pb-txn-mix-key pb-txn-mix-more" aria-expanded={allKeys}
              // Only opens or closes the legend. The control moves when the
              // list changes, so any hover is dropped with it: nothing
              // may stay lit under (or after) the tap.
              onClick={() => { setAllKeys((v) => !v); setHover(null); }}>
              {allKeys ? x.fewerCategories : t(x.moreCategories, { count: mix.length - 3 })}
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}
