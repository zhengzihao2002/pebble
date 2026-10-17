'use client';

import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { INTL_LOCALE } from '@/lib/i18n/locale';

/** One month of the timeline strip. */
export interface MonthChip {
  /** The caller's own month index (TransactionsClient: 0 = current, larger = older). */
  index: number;
  year: number;
  /** Zero-based, as JavaScript's Date. */
  month: number;
  deposits: number;
  withdrawals: number;
  count: number;
  closing: number;
}

interface MonthNavigatorProps {
  label: string;
  canGoOlder: boolean;
  canGoNewer: boolean;
  onOlder: () => void;
  onNewer: () => void;
  // Optional: the 13-month timeline strip. Without these the navigator is the
  // original chevrons-and-label row.
  /** Oldest first, left to right. */
  months?: MonthChip[];
  selectedIndex?: number;
  onSelect?: (index: number) => void;
  /** Quiet text above the month title ("This month"). */
  eyebrow?: ReactNode;
  /** Beside the title on the right (the month's change). */
  aside?: ReactNode;
  /** id of the panel the month tabs control (the statement). */
  controls?: string;
}

export function MonthNavigator(props: MonthNavigatorProps) {
  if (props.months && props.onSelect && props.selectedIndex !== undefined) return <MonthStripNavigator {...props} months={props.months} onSelect={props.onSelect} selectedIndex={props.selectedIndex} />;
  return <ChevronNavigator {...props} />;
}

function ChevronNavigator({ label, canGoOlder, canGoNewer, onOlder, onNewer }: MonthNavigatorProps) {
  // label arrives already formatted by the caller, which is where the locale
  // is known. This component only needs its own two aria-labels.
  const { d } = useTranslation();
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
      <button
        type="button"
        onClick={() => canGoOlder && onOlder()}
        disabled={!canGoOlder}
        className="icon-btn"
        style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, opacity: canGoOlder ? 1 : 0.35, cursor: canGoOlder ? 'pointer' : 'default' }}
        aria-label={d.transactions.prevMonth}
      >
        <ChevronLeft size={16} />
      </button>
      <p className="font-display" style={{ fontSize: '1.05rem', fontWeight: 600, minWidth: 160, textAlign: 'center' }}>
        {label}
      </p>
      <button
        type="button"
        onClick={() => canGoNewer && onNewer()}
        disabled={!canGoNewer}
        className="icon-btn"
        style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, opacity: canGoNewer ? 1 : 0.35, cursor: canGoNewer ? 'pointer' : 'default' }}
        aria-label={d.transactions.nextMonth}
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

/**
 * The month title with a strip of the 13 reachable months under it, chevrons
 * at both ends. The chevrons keep their labels and their end-of-range rule
 * (disabled, faded); they are 44px now, a full touch target.
 *
 * Each chip: the short month name (the year on January and on the first
 * chip) over a micro glyph, a pine bar up for money in and a wine bar down
 * for money out, scaled to the busiest month of the 13. The glyphs carry no
 * figures, but proportions are still information, so they sit in
 * .pb-chart-fill and blur with the other charts in privacy mode. A faint
 * line of each month's closing balance runs behind the chips (also blurred).
 * Months without a record are dimmed with a hollow glyph.
 *
 * A tablist with a roving tabindex: Tab reaches the selected month, the arrow
 * keys, Home and End move the selection (and focus) along the strip. The
 * selected chip carries a pill that slides by transform only. When the strip
 * scrolls (a phone, the Mac side rail) the chosen chip is centred by setting
 * the strip's own scrollLeft - never scrollIntoView, which would also scroll
 * the page.
 */
function MonthStripNavigator({
  label, canGoOlder, canGoNewer, onOlder, onNewer, months, selectedIndex, onSelect, eyebrow, aside, controls,
}: MonthNavigatorProps & { months: MonthChip[]; selectedIndex: number; onSelect: (index: number) => void }) {
  const { d, locale } = useTranslation();
  const stripRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null);
  // No slide on the first placement: the pill appears under the month.
  const [ready, setReady] = useState(false);
  const firstPlace = useRef(true);

  useLayoutEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const place = () => {
      const chip = strip.querySelector<HTMLElement>('[aria-selected="true"]');
      if (!chip) return;
      setThumb({ x: chip.offsetLeft, w: chip.offsetWidth });
    };
    place();
    const chip = strip.querySelector<HTMLElement>('[aria-selected="true"]');
    if (chip && strip.scrollWidth > strip.clientWidth) {
      const left = chip.offsetLeft - (strip.clientWidth - chip.offsetWidth) / 2;
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      strip.scrollTo({ left, behavior: firstPlace.current || reduce ? 'auto' : 'smooth' });
    }
    firstPlace.current = false;
    const ro = new ResizeObserver(place);
    ro.observe(strip);
    const id = requestAnimationFrame(() => setReady(true));
    return () => { ro.disconnect(); cancelAnimationFrame(id); };
  }, [selectedIndex, months.length, locale]);

  const maxFlow = Math.max(1, ...months.map((m) => Math.max(m.deposits, m.withdrawals)));
  const closings = months.map((m) => m.closing);
  const cMin = Math.min(...closings);
  const cSpan = Math.max(...closings) - cMin || 1;
  const n = months.length;
  const linePoints = months.map((m, i) => `${(((i + 0.5) / n) * 100).toFixed(2)},${(30 - ((m.closing - cMin) / cSpan) * 26).toFixed(2)}`).join(' ');

  const pos = months.findIndex((m) => m.index === selectedIndex);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const last = n - 1;
    let next = -1;
    if (e.key === 'ArrowLeft') next = Math.max(0, pos - 1);
    else if (e.key === 'ArrowRight') next = Math.min(last, pos + 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = last;
    if (next === -1) return;
    e.preventDefault();
    onSelect(months[next].index);
    stripRef.current?.querySelector<HTMLElement>(`[data-chip="${next}"]`)?.focus();
  };

  const fmt = (m: MonthChip, opts: Intl.DateTimeFormatOptions) => new Date(m.year, m.month, 1).toLocaleDateString(INTL_LOCALE[locale], opts);
  const chevron = (dir: 'older' | 'newer') => {
    const can = dir === 'older' ? canGoOlder : canGoNewer;
    const go = dir === 'older' ? onOlder : onNewer;
    return (
      <button
        type="button"
        onClick={() => can && go()}
        disabled={!can}
        className="icon-btn pb-txn-chev"
        style={{ opacity: can ? 1 : 0.35, cursor: can ? 'pointer' : 'default' }}
        aria-label={dir === 'older' ? d.transactions.prevMonth : d.transactions.nextMonth}
      >
        {dir === 'older' ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
      </button>
    );
  };

  return (
    <div className="pb-txn-nav">
      <div className="pb-txn-nav-head">
        <div style={{ minWidth: 0 }}>
          {eyebrow && <p className="pb-txn-eyebrow">{eyebrow}</p>}
          {/* Formatted by the caller (it knows the locale); the statement title. */}
          <h2 className="font-display pb-txn-month-title">{label}</h2>
        </div>
        {aside && <div className="pb-txn-nav-aside">{aside}</div>}
      </div>
      <div className="pb-txn-strip-row">
        {chevron('older')}
        <div className="pb-txn-strip themed-scroll" ref={stripRef} role="tablist" aria-label={d.ux.transactions.months} onKeyDown={onKeyDown}>
          <div className="pb-txn-strip-track">
            {/* The closing-balance line behind the chips. preserveAspectRatio
                none stretches it to the track; the stroke stays 1.5px. */}
            <span className="pb-txn-strip-line pb-chart-fill" aria-hidden="true">
              <svg viewBox="0 0 100 32" preserveAspectRatio="none" focusable="false">
                <polyline points={linePoints} vectorEffect="non-scaling-stroke" />
              </svg>
            </span>
            {thumb && (
              <span
                className={`pb-txn-strip-thumb${ready ? ' pb-txn-strip-thumb-ready' : ''}`}
                aria-hidden="true"
                style={{ width: thumb.w, transform: `translateX(${thumb.x}px)` }}
              />
            )}
            {months.map((m, i) => {
              const selected = m.index === selectedIndex;
              const empty = m.count === 0;
              const showYear = i === 0 || m.month === 0;
              const full = fmt(m, { month: 'long', year: 'numeric' });
              return (
                <button
                  key={`${m.year}-${m.month}`}
                  type="button" role="tab" data-chip={i}
                  aria-selected={selected} tabIndex={selected ? 0 : -1}
                  aria-controls={controls}
                  aria-label={empty ? `${full}, ${d.ux.transactions.noActivityShort}` : full}
                  onClick={() => onSelect(m.index)}
                  className={`pb-txn-chip${empty ? ' pb-txn-chip-empty' : ''}`}
                >
                  <span className="pb-txn-chip-year pb-tnum" aria-hidden="true">{showYear ? fmt(m, { year: 'numeric' }) : ''}</span>
                  <span className="pb-txn-chip-glyph pb-chart-fill" aria-hidden="true">
                    <span className="pb-txn-chip-in" style={{ transform: `scaleY(${empty ? 0 : Math.max(0.08, m.deposits / maxFlow)})` }} />
                    <span className="pb-txn-chip-out" style={{ transform: `scaleY(${empty ? 0 : Math.max(0.08, m.withdrawals / maxFlow)})` }} />
                  </span>
                  <span className="pb-txn-chip-month" aria-hidden="true">{fmt(m, { month: 'short' })}</span>
                </button>
              );
            })}
          </div>
        </div>
        {chevron('newer')}
      </div>
    </div>
  );
}
